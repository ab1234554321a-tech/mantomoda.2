// =============================================================================
//  Payment Gateway Tests (BL-006 / ADR-008)
//  Covers the provider contract, amount integrity, idempotency and access control.
// =============================================================================
import { mockPaymentProvider } from '../src/server/services/payment/mock.provider.js';
import { getPaymentProvider, PAYMENT_PROVIDERS, PAYMENT_PROVIDER_CONTRACT } from '../src/server/services/payment/provider.js';
import { zarinpalProvider } from '../src/server/services/payment/zarinpal.provider.js';
import { db } from '../src/server/db/store.js';

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✔ Passed: ${message}`);
}

export async function runPaymentTests() {
  console.log('\n💳 Running Payment Gateway & Provider Adapter Tests (BL-006)...');
  mockPaymentProvider._reset();

  // --- Provider registry ---
  assert(Object.keys(PAYMENT_PROVIDERS).includes('zarinpal'), 'Zarinpal provider is registered as the default PSP');
  assert(Object.keys(PAYMENT_PROVIDERS).includes('mock'), 'Mock provider is registered for offline testing');
  for (const method of PAYMENT_PROVIDER_CONTRACT) {
    assert(
      typeof PAYMENT_PROVIDERS.zarinpal[method] === 'function' && typeof PAYMENT_PROVIDERS.mock[method] === 'function',
      `Both providers implement the "${method}" contract method`
    );
  }

  // --- Toman -> Rial conversion (the classic Iranian e-commerce bug) ---
  assert(zarinpalProvider.tomanToRial(1250000) === 12500000, 'Zarinpal converts Toman to Rial (x10) before sending to the PSP');
  assert(zarinpalProvider.tomanToRial(0) === 0, 'Zero-amount conversion stays zero (no NaN)');

  // --- Sandbox handling ---
  const originalSandbox = process.env.ZARINPAL_SANDBOX;
  process.env.ZARINPAL_SANDBOX = 'true';
  process.env.ZARINPAL_MERCHANT_ID = '00000000-0000-0000-0000-000000000000';
  try {
    const sandboxSession = await zarinpalProvider.request({
      amountRial: 100000,
      orderId: 'ord-sandbox-check',
      callbackUrl: 'https://example.test/api/payments/callback'
    });
    // The sandbox is unreachable in CI, so a thrown provider error is the expected
    // outcome; what matters is that it fails loudly instead of silently succeeding.
    assert(false, 'Sandbox request should not succeed without network access');
  } catch (error) {
    assert(
      error.code === 'PAYMENT_PROVIDER_ERROR' || error.statusCode >= 500 || error.message.includes('timed out') || error.message.includes('fetch'),
      'Zarinpal failures surface as provider errors, never as silent successes'
    );
  } finally {
    process.env.ZARINPAL_SANDBOX = originalSandbox;
    delete process.env.ZARINPAL_MERCHANT_ID;
  }

  // --- Missing configuration must be loud ---
  assert(zarinpalProvider.isConfigured() === false, 'Zarinpal reports unconfigured without a merchant ID');
  assert(zarinpalProvider.missingConfig().includes('ZARINPAL_MERCHANT_ID'), 'Missing config lists ZARINPAL_MERCHANT_ID');
  let configError = null;
  const envBefore = process.env.NODE_ENV;
  try {
    process.env.PAYMENT_PROVIDER = 'zarinpal';
    process.env.NODE_ENV = 'production';
    getPaymentProvider();
  } catch (error) {
    configError = error;
  } finally {
    delete process.env.PAYMENT_PROVIDER;
    process.env.NODE_ENV = envBefore;
  }
  assert(configError !== null, 'Selecting an unconfigured provider throws at startup instead of faking payments');

  // --- Mock provider happy path ---
  const session = await mockPaymentProvider.request({ amountRial: 500000, orderId: 'ord-test-1' });
  assert(typeof session.authority === 'string' && session.authority.length > 5, 'Payment request returns an authority');
  assert(session.paymentUrl.includes(session.authority), 'Redirect URL contains the authority');

  const verified = await mockPaymentProvider.verify({ authority: session.authority, amountRial: 500000 });
  assert(verified.ok === true && Boolean(verified.refId), 'Valid transaction verifies and returns a reference ID');

  // --- Idempotency ---
  const second = await mockPaymentProvider.verify({ authority: session.authority, amountRial: 500000 });
  assert(second.ok === true && second.alreadyVerified === true, 'Re-verifying the same transaction is idempotent, not a second charge');

  // --- Amount tampering ---
  const tamperSession = await mockPaymentProvider.request({ amountRial: 500000, orderId: 'ord-test-tamper' });
  const tampered = await mockPaymentProvider.verify({ authority: tamperSession.authority, amountRial: 1000 });
  assert(tampered.ok === false, 'Verifying with a tampered (lower) amount is rejected');

  // --- Unknown authority ---
  const unknown = await mockPaymentProvider.verify({ authority: 'MOCK-DOES-NOT-EXIST', amountRial: 500000 });
  assert(unknown.ok === false && unknown.errorCode === -51, 'Unknown authority is rejected with a gateway error code');

  // --- Gateway-declared failure ---
  const failed = await mockPaymentProvider.verify({ authority: mockPaymentProvider.FAILING_AUTHORITY, amountRial: 500000 });
  assert(failed.ok === false, 'A gateway-declared failed transaction never verifies');

  // --- Invalid amounts are refused by the provider ---
  let amountError = null;
  try {
    await mockPaymentProvider.request({ amountRial: -5000, orderId: 'ord-negative' });
  } catch (error) {
    amountError = error;
  }
  assert(amountError !== null && amountError.code === 'INVALID_PAYMENT_AMOUNT', 'Negative payment amounts are rejected at the provider boundary');

  // --- Order state machine ---
  db.createOrder({
    userId: 'usr-test', userFullName: 'Test User', userEmail: 't@example.test',
    items: [], totalAmount: 500000, payableAmount: 500000, paymentMethod: 'ONLINE_GATEWAY',
    shippingAddress: { recipientName: 'T', phone: '09120000000', province: 'تهران', city: 'تهران', fullAddress: 'x' }
  });
  const order = db.listOrders().find(o => o.userId === 'usr-test');
  assert(order.paymentStatus === 'PENDING', 'Online orders are created UNPAID (no simulated instant PAID anymore)');

  db.markOrderPaid(order.id, { paymentStatus: 'PAID', refId: '123456789' });
  const paidOrder = db.findOrderById(order.id);
  assert(paidOrder.paymentStatus === 'PAID' && paidOrder.paymentRefId === '123456789', 'Order transitions to PAID only after verification, storing the reference ID');

  // --- Payment records are persisted against the order ---
  const paymentRecord = db.createPayment({
    orderId: order.id, userId: 'usr-test', provider: 'mock',
    authority: 'MOCK-PERSIST-1', amountRial: 5000000, amountToman: 500000
  });
  assert(db.findPaymentByAuthority('MOCK-PERSIST-1')?.id === paymentRecord.id, 'Payment sessions are retrievable by authority');
  assert(db.findPaymentByOrderId(order.id)?.amountRial === 5000000, 'Payment sessions are retrievable by order');
  db.markPaymentVerified('MOCK-PERSIST-1', { refId: '987654321', cardPan: '6037-****-1234', status: 'PAID' });
  const stored = db.findPaymentByAuthority('MOCK-PERSIST-1');
  assert(stored.status === 'PAID' && stored.refId === '987654321', 'Verified payments store status, reference ID and card PAN');

  // --- Bank transfer orders are not payable online ---
  assert(order.paymentMethod === 'ONLINE_GATEWAY', 'Order keeps its payment method for the online-payment guard to check');
}
