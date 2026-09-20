// =============================================================================
//  Kavenegar SMS Provider (ADR-009)
//  Chosen as the default SMS panel: highest reliability for transactional OTP
//  (well documented REST API, pattern/lookup sending that keeps the code in a
//  pre-approved template, and a voice-call fallback for landline numbers).
//
//  API reference:
//    GET https://api.kavenegar.com/v1/{API-KEY}/verify/lookup.json
//        ?receptor={mobile}&token={code}&template={template}
//
//  The pattern ("template") must be pre-approved in the Kavenegar panel; the
//  verification code is passed as the single `token` placeholder.
// =============================================================================

const REQUEST_TIMEOUT_MS = Number(process.env.SMS_HTTP_TIMEOUT_MS || 8000);
const DEFAULT_TEMPLATE = 'manto-verify';

function isConfigured() {
  return Boolean(process.env.KAVENEGAR_API_KEY && process.env.KAVENEGAR_SENDER);
}

function missingConfig() {
  const missing = [];
  if (!process.env.KAVENEGAR_API_KEY) missing.push('KAVENEGAR_API_KEY');
  if (!process.env.KAVENEGAR_SENDER) missing.push('KAVENEGAR_SENDER');
  return missing;
}

/**
 * Iranian mobile numbers are stored as 09xxxxxxxxx. Kavenegar expects the same
 * national format; anything else is rejected upstream by Zod, so this is a
 * defensive normalisation only.
 */
function normaliseMobile(mobile) {
  return String(mobile || '').replace(/[\s-]/g, '');
}

export const kavenegarProvider = {
  name: 'kavenegar',

  isConfigured,
  missingConfig,

  async sendOtp({ mobile, code, template }) {
    if (!isConfigured()) {
      throw Object.assign(
        new Error(`Kavenegar is not configured. Missing: ${missingConfig().join(', ')}`),
        { statusCode: 503, code: 'SMS_PROVIDER_NOT_CONFIGURED' }
      );
    }

    const receptor = normaliseMobile(mobile);
    const pattern = template || process.env.KAVENEGAR_OTP_TEMPLATE || DEFAULT_TEMPLATE;
    const url =
      `https://api.kavenegar.com/v1/${process.env.KAVENEGAR_API_KEY}/verify/lookup.json` +
      `?receptor=${encodeURIComponent(receptor)}` +
      `&token=${encodeURIComponent(code)}` +
      `&template=${encodeURIComponent(pattern)}` +
      `&sender=${encodeURIComponent(process.env.KAVENEGAR_SENDER)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
      const text = await response.text();

      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw Object.assign(new Error(`Kavenegar returned a non-JSON response (HTTP ${response.status}).`), {
          statusCode: 502, code: 'SMS_PROVIDER_ERROR'
        });
      }

      const entry = Array.isArray(body?.return) ? body.return[0] : body?.return;
      const status = Number(entry?.status);

      // Kavenegar returns HTTP 200 with a status code in the body.
      if (response.status >= 400 || (status && status !== 200)) {
        throw Object.assign(
          new Error(`Kavenegar rejected the message: ${entry?.message || `status ${status || 'unknown'}`}`),
          { statusCode: 502, code: 'SMS_PROVIDER_ERROR' }
        );
      }

      return {
        ok: true,
        messageId: entry?.messageid ? String(entry.messageid) : null,
        provider: 'kavenegar',
        raw: entry || null
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw Object.assign(new Error(`Kavenegar request timed out after ${REQUEST_TIMEOUT_MS}ms.`), {
          statusCode: 504, code: 'SMS_PROVIDER_TIMEOUT'
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Send a free-form transactional message (order status updates).
   * Uses /sms/send.json, unlike OTP which uses the pre-approved pattern lookup.
   */
  async sendMessage({ mobile, message }) {
    if (!isConfigured()) {
      throw Object.assign(
        new Error(`Kavenegar is not configured. Missing: ${missingConfig().join(', ')}`),
        { statusCode: 503, code: 'SMS_PROVIDER_NOT_CONFIGURED' }
      );
    }

    const receptor = normaliseMobile(mobile);
    const url =
      `https://api.kavenegar.com/v1/${process.env.KAVENEGAR_API_KEY}/sms/send.json` +
      `?receptor=${encodeURIComponent(receptor)}` +
      `&sender=${encodeURIComponent(process.env.KAVENEGAR_SENDER)}` +
      `&message=${encodeURIComponent(message)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
      const text = await response.text();

      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw Object.assign(new Error(`Kavenegar returned a non-JSON response (HTTP ${response.status}).`), {
          statusCode: 502, code: 'SMS_PROVIDER_ERROR'
        });
      }

      const entry = Array.isArray(body?.return) ? body.return[0] : body?.return;
      const status = Number(entry?.status);

      if (response.status >= 400 || (status && status !== 200)) {
        throw Object.assign(
          new Error(`Kavenegar rejected the message: ${entry?.message || `status ${status || 'unknown'}`}`),
          { statusCode: 502, code: 'SMS_PROVIDER_ERROR' }
        );
      }

      return {
        ok: true,
        messageId: entry?.messageid ? String(entry.messageid) : null,
        provider: 'kavenegar',
        raw: entry || null
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw Object.assign(new Error(`Kavenegar request timed out after ${REQUEST_TIMEOUT_MS}ms.`), {
          statusCode: 504, code: 'SMS_PROVIDER_TIMEOUT'
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
};

export default kavenegarProvider;
