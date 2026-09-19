// =============================================================================
//  Mock Payment Provider
//  Deterministic, offline provider used by the test suites and local development.
//  Never selected automatically in production (see provider.js).
//
//  Behaviour contract mirrors the real PSP closely enough that the route layer
//  and the order state machine are exercised identically:
//    - request() returns a sandbox URL containing the authority
//    - verify() succeeds once, returns alreadyVerified on a second call
//    - verify() fails when the authority is unknown or the amount differs
// =============================================================================
import crypto from 'crypto';

// authority -> { amountRial, verified }
const sessions = new Map();

// Authorities that always fail verification, used by tests to exercise the failure path.
const FAILING_AUTHORITY = 'MOCK-FAIL-AUTHORITY';

export const mockPaymentProvider = {
  name: 'mock',

  isConfigured() {
    return true;
  },

  missingConfig() {
    return [];
  },

  async request({ amountRial, orderId }) {
    if (!Number.isInteger(amountRial) || amountRial <= 0) {
      throw Object.assign(new Error('Payment amount must be a positive integer in Rial.'), {
        statusCode: 400, code: 'INVALID_PAYMENT_AMOUNT'
      });
    }

    const authority = `MOCK-${orderId}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    sessions.set(authority, { amountRial, orderId, verified: false });

    return {
      authority,
      paymentUrl: `https://sandbox.local.mock/pg/StartPay/${authority}`,
      provider: 'mock'
    };
  },

  async verify({ authority, amountRial }) {
    if (authority === FAILING_AUTHORITY) {
      return {
        ok: false,
        alreadyVerified: false,
        refId: null,
        cardPan: null,
        provider: 'mock',
        errorCode: -30,
        errorMessage: 'تراکنش توسط درگاه تأیید نشد (mock failure).'
      };
    }

    const session = sessions.get(authority);
    if (!session) {
      return {
        ok: false,
        alreadyVerified: false,
        refId: null,
        cardPan: null,
        provider: 'mock',
        errorCode: -51,
        errorMessage: 'نشست پرداخت یافت نشد یا منقضی شده است.'
      };
    }

    if (session.amountRial !== amountRial) {
      return {
        ok: false,
        alreadyVerified: false,
        refId: null,
        cardPan: null,
        provider: 'mock',
        errorCode: -30,
        errorMessage: 'مبلغ تأییدشده با مبلغ سفارش مطابقت ندارد.'
      };
    }

    const alreadyVerified = session.verified;
    session.verified = true;

    return {
      ok: true,
      alreadyVerified,
      refId: String(Math.floor(100000000 + Math.random() * 899999999)),
      cardPan: '6037-****-****-1234',
      provider: 'mock',
      raw: { authority, amount: amountRial }
    };
  },

  /** Test helper — clears stored sessions between suites. */
  _reset() {
    sessions.clear();
  },

  FAILING_AUTHORITY
};

export default mockPaymentProvider;
