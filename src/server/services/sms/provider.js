// =============================================================================
//  SMS Provider Registry (ADR-009)
//  Pluggable adapter for transactional SMS / OTP delivery.
//  Selecting a provider is a single environment variable: SMS_PROVIDER
//      kavenegar -> live Iranian SMS panel (default for production)
//      mock     -> logs the message and stores it for tests/local dev
// =============================================================================
import { kavenegarProvider } from './kavenegar.provider.js';
import { mockSmsProvider } from './mock.provider.js';

export const SMS_PROVIDERS = {
  kavenegar: kavenegarProvider,
  mock: mockSmsProvider
};

export function getSmsProvider() {
  const name = (process.env.SMS_PROVIDER || '').trim().toLowerCase();
  const isTest = process.env.NODE_ENV === 'test';

  if (!name) {
    if (isTest) return { name: 'mock', adapter: SMS_PROVIDERS.mock };
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SMS_PROVIDER is not configured. Set SMS_PROVIDER=kavenegar together with ' +
        'KAVENEGAR_API_KEY and KAVENEGAR_SENDER before starting in production. Allowed values: kavenegar, mock.'
      );
    }
    return { name: 'mock', adapter: SMS_PROVIDERS.mock };
  }

  const adapter = SMS_PROVIDERS[name];
  if (!adapter) {
    throw new Error(`Unknown SMS_PROVIDER "${name}". Allowed values: ${Object.keys(SMS_PROVIDERS).join(', ')}.`);
  }

  if (adapter.isConfigured && !adapter.isConfigured()) {
    throw new Error(
      `SMS provider "${name}" is selected but not fully configured. ` +
      `Missing environment variables: ${adapter.missingConfig().join(', ')}`
    );
  }

  return { name, adapter };
}

/**
 * Provider adapter contract (enforced by tests):
 *   sendOtp({ mobile, code, template })
 *     -> { ok, messageId, provider, raw }
 *   sendMessage({ mobile, message })
 *     -> { ok, messageId, provider, raw }
 */
export const SMS_PROVIDER_CONTRACT = ['sendOtp', 'sendMessage'];
