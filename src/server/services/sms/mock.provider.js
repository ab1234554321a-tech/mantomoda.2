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
