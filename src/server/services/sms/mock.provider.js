// =============================================================================
//  Mock SMS Provider
//  Used by tests and local development. Prints the message to the server log
//  instead of dispatching it, and keeps a copy in memory so tests can assert
//  on delivery without touching the network.
// =============================================================================

const outbox = [];

export const mockSmsProvider = {
  name: 'mock',

  isConfigured() {
    return true;
  },

  missingConfig() {
    return [];
  },

  async sendOtp({ mobile, code, template }) {
    const message = {
      kind: 'OTP',
      to: mobile,
      code,
      template: template || 'mock-template',
      sentAt: new Date().toISOString(),
      messageId: `mock-${outbox.length + 1}`
    };

    outbox.push(message);

    // Deliberately visible: this is the only way a developer without SMS
    // credentials can read the code. The route layer never returns it in
    // production responses (see otp.service.js / isDevelopmentCodeExposed()).
    console.log(`[MOCK SMS] -> ${mobile} | code: ${code} | template: ${message.template}`);

    return { ok: true, messageId: message.messageId, provider: 'mock', raw: message };
  },

  /**
   * Free-form transactional message (order status updates).
   * Numbers starting with 0900 simulate a delivery failure so tests can prove
   * that a failed notification never breaks the business operation.
   */
  async sendMessage({ mobile, message }) {
    if (String(mobile || '').startsWith('0900')) {
      const error = new Error('mock delivery failure (simulated for numbers starting with 0900)');
      error.code = 'SMS_PROVIDER_ERROR';
      error.statusCode = 502;
      throw error;
    }

    const entry = {
      kind: 'MESSAGE',
      to: mobile,
      message,
      sentAt: new Date().toISOString(),
      messageId: `mock-msg-${outbox.length + 1}`
    };

    outbox.push(entry);
    console.log(`[MOCK SMS] -> ${mobile} | ${message}`);

    return { ok: true, messageId: entry.messageId, provider: 'mock', raw: entry };
  },

  /** Test helper — returns a copy of everything "sent". */
  _outbox() {
    return [...outbox];
  },

  /** Test helper — clears the outbox between suites. */
  _reset() {
    outbox.length = 0;
  }
};

export default mockSmsProvider;
