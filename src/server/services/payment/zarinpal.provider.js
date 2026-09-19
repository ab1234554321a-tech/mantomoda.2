// =============================================================================
//  Zarinpal Payment Provider (ADR-008)
//  Chosen as the default PSP: multi-bank smart routing means a single bank
//  outage does not take checkout down, activation does not require a direct
//  bank terminal, and it ships a sandbox for development.
//
//  API reference (REST v4):
//    POST {base}/pg/v4/payment/request.json
//    POST {base}/pg/v4/payment/verify.json
//    Redirect: {base}/pg/StartPay/{authority}
//
//  IMPORTANT: Zarinpal amounts are in RIAL, the storefront prices are in TOMAN.
//  All conversion happens here so no other layer has to think about it.
// =============================================================================

const REQUEST_TIMEOUT_MS = Number(process.env.PAYMENT_HTTP_TIMEOUT_MS || 8000);

const LIVE_BASE = 'https://payment.zarinpal.com';
const SANDBOX_BASE = 'https://sandbox.zarinpal.com';

// Zarinpal status codes
const ZP_STATUS = {
  OK: 100,
  ALREADY_VERIFIED: 101
};

function baseUrl() {
  const sandbox = String(process.env.ZARINPAL_SANDBOX || '').toLowerCase() === 'true';
  return sandbox ? SANDBOX_BASE : LIVE_BASE;
}

async function postJson(url, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Zarinpal returned a non-JSON response (HTTP ${response.status}).`);
    }
    return { httpStatus: response.status, body };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Zarinpal request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const zarinpalProvider = {
  /**
   * Convert Toman (storefront unit) to Rial (PSP unit).
   */
  tomanToRial(toman) {
    const value = Math.round(Number(toman) || 0);
    return value * 10;
  },

  isConfigured() {
    return Boolean(process.env.ZARINPAL_MERCHANT_ID && process.env.ZARINPAL_MERCHANT_ID.length >= 36);
  },

  missingConfig() {
    const missing = [];
    const merchantId = process.env.ZARINPAL_MERCHANT_ID || '';
    if (!merchantId) missing.push('ZARINPAL_MERCHANT_ID');
    else if (merchantId.length < 36) missing.push('ZARINPAL_MERCHANT_ID (must be a 36-character UUID)');
    return missing;
  },

  /**
   * Create a payment session and return the redirect URL.
   */
  async request({ amountRial, description, callbackUrl, orderId, mobile, email }) {
    if (!this.isConfigured()) {
      throw Object.assign(
        new Error(`Zarinpal is not configured. Missing: ${this.missingConfig().join(', ')}`),
        { statusCode: 503, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' }
      );
    }
    if (!Number.isInteger(amountRial) || amountRial <= 0) {
      throw Object.assign(new Error('Payment amount must be a positive integer in Rial.'), {
        statusCode: 400, code: 'INVALID_PAYMENT_AMOUNT'
      });
    }

    const { httpStatus, body } = await postJson(`${baseUrl()}/pg/v4/payment/request.json`, {
      merchant_id: process.env.ZARINPAL_MERCHANT_ID,
      amount: amountRial,
      description: description || `پرداخت سفارش ${orderId}`,
      callback_url: callbackUrl,
      metadata: {
        ...(mobile ? { mobile } : {}),
        ...(email ? { email } : {}),
        order_id: orderId
      }
    });

    const data = body?.data;
    if (httpStatus >= 400 || !data || data.code !== ZP_STATUS.OK || !data.authority) {
      const detail = data?.errors?.message || body?.errors?.message || `HTTP ${httpStatus}`;
      throw Object.assign(new Error(`Zarinpal payment request failed: ${detail}`), {
        statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR'
      });
    }

    return {
      authority: data.authority,
      paymentUrl: `${baseUrl()}/pg/StartPay/${data.authority}`,
      feeType: data.fee_type || null,
      provider: 'zarinpal'
    };
  },

  /**
   * Verify a payment after the user returns from the gateway.
   * Amount is re-verified against the order — a mismatch is never accepted.
   */
  async verify({ authority, amountRial }) {
    if (!this.isConfigured()) {
      throw Object.assign(
        new Error(`Zarinpal is not configured. Missing: ${this.missingConfig().join(', ')}`),
        { statusCode: 503, code: 'PAYMENT_PROVIDER_NOT_CONFIGURED' }
      );
    }

    const { httpStatus, body } = await postJson(`${baseUrl()}/pg/v4/payment/verify.json`, {
      merchant_id: process.env.ZARINPAL_MERCHANT_ID,
      amount: amountRial,
      authority
    });

    const data = body?.data;
    const code = data?.code;

    if (httpStatus >= 400 || !data) {
      const detail = body?.errors?.message || `HTTP ${httpStatus}`;
      throw Object.assign(new Error(`Zarinpal verification failed: ${detail}`), {
        statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR'
      });
    }

    if (code === ZP_STATUS.ALREADY_VERIFIED) {
      return {
        ok: true,
        alreadyVerified: true,
        refId: data.ref_id ? String(data.ref_id) : null,
        cardPan: data.card_pan || null,
        provider: 'zarinpal',
        raw: data
      };
    }

    if (code === ZP_STATUS.OK) {
      return {
        ok: true,
        alreadyVerified: false,
        refId: data.ref_id ? String(data.ref_id) : null,
        cardPan: data.card_pan || null,
        provider: 'zarinpal',
        raw: data
      };
    }

    return {
      ok: false,
      alreadyVerified: false,
      refId: null,
      cardPan: null,
      provider: 'zarinpal',
      errorCode: code ?? null,
      errorMessage: data?.errors?.message || 'تراکنش توسط درگاه تأیید نشد.',
      raw: data
    };
  }
};

export default zarinpalProvider;
