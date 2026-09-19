// =============================================================================
//  Payment Provider Registry (ADR-008)
//  Pluggable adapter so the store can switch PSP without touching business logic.
//  Selecting a provider is a single environment variable: PAYMENT_PROVIDER
//      zarinpal -> live Iranian PSP (default for production)
//      mock     -> deterministic offline provider used by tests/local dev
// =============================================================================
import { zarinpalProvider } from './zarinpal.provider.js';
import { mockPaymentProvider } from './mock.provider.js';

export const PAYMENT_PROVIDERS = {
  zarinpal: zarinpalProvider,
  mock: mockPaymentProvider
};

/**
 * Resolve the active payment provider.
 * Production requires an explicitly configured provider with credentials;
 * falling back silently to `mock` in production would fake successful payments,
 * so that is treated as a startup error.
 */
export function getPaymentProvider() {
  const name = (process.env.PAYMENT_PROVIDER || '').trim().toLowerCase();
  const isTest = process.env.NODE_ENV === 'test';

  if (!name) {
    if (isTest) return { name: 'mock', adapter: PAYMENT_PROVIDERS.mock };
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PAYMENT_PROVIDER is not configured. Set PAYMENT_PROVIDER=zarinpal together with ' +
        'ZARINPAL_MERCHANT_ID before starting in production. Allowed values: zarinpal, mock.'
      );
    }
    return { name: 'mock', adapter: PAYMENT_PROVIDERS.mock };
  }

  const adapter = PAYMENT_PROVIDERS[name];
  if (name === 'mock' && process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PROVIDERS !== 'true') {
    throw new Error(
      'PAYMENT_PROVIDER=mock is refused in production because it would fake درگاه پرداخت results. ' +
      'Configure a real provider, or set ALLOW_MOCK_PROVIDERS=true for a deliberate demo/staging environment.'
    );
  }
  if (!adapter) {
    throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Allowed values: ${Object.keys(PAYMENT_PROVIDERS).join(', ')}.`);
  }

  if (adapter.isConfigured && !adapter.isConfigured()) {
    throw new Error(
      `Payment provider "${name}" is selected but not fully configured. ` +
      `Missing environment variables: ${adapter.missingConfig().join(', ')}`
    );
  }

  return { name, adapter };
}

/**
 * Provider adapter contract (enforced by tests):
 *   request({ amountRial, description, callbackUrl, orderId, mobile, email })
 *     -> { authority, paymentUrl, provider }
 *   verify({ authority, amountRial })
 *     -> { ok, refId, cardPan, alreadyVerified, provider, raw }
 */
export const PAYMENT_PROVIDER_CONTRACT = [
  'request',
  'verify'
];
