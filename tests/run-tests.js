// The suites import server modules at module-evaluation time, so NODE_ENV must
// be set before those imports happen: hence the dynamic imports below.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// Test runs must never touch the on-disk snapshot of a real shop.
process.env.PERSIST_DATA = 'false';

const { runSecurityTests } = await import('./security.test.js');
const { runWholesaleTests } = await import('./wholesale.test.js');
const { runPricingTests } = await import('./pricing.test.js');
const { runAdversarialTests } = await import('./adversarial.test.js');
const { runPaymentTests } = await import('./payment.test.js');
const { runOtpTests } = await import('./otp.test.js');
const { runOperationsTests } = await import('./operations.test.js');
const { runCommerceTests } = await import('./commerce.test.js');
const { runEscapingTests } = await import('./escaping.test.js');

async function main() {
  console.log('========================================================');
  console.log('⚡ MANTO MODA — AUTOMATED QUALITY & SECURITY GATE (CI) ⚡');
  console.log('========================================================');

  const startTime = Date.now();
  let passedCount = 0;

  try {
    await runSecurityTests();
    passedCount++;

    await runWholesaleTests();
    passedCount++;

    await runPricingTests();
    passedCount++;

    await runAdversarialTests();
    passedCount++;

    await runPaymentTests();
    passedCount++;

    await runOtpTests();
    passedCount++;

    await runOperationsTests();
    passedCount++;

    await runCommerceTests();
    passedCount++;

    await runEscapingTests();
    passedCount++;

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedCount} TEST SUITES PASSED SUCCESSFULLY! (${duration}s)`);
    console.log('✔ Level 1: Unit & Pricing Engine Tests: PASSED');
    console.log('✔ Level 2: Wholesale State Machine & Approval: PASSED');
    console.log('✔ Level 3: Security, JWT Crypto & Price Isolation: PASSED');
    console.log('✔ Level 4: Red Team Adversarial & BOLA Penetration: PASSED');
    console.log('✔ Level 5: Payment Gateway & Provider Adapter (BL-006): PASSED');
    console.log('✔ Level 6: OTP / SMS Mobile Verification (BL-007): PASSED');
    console.log('✔ Level 7: Operations — inventory, order lifecycle, notifications, SEO, uploads: PASSED');
    console.log('✔ Level 8: Commerce — pricing, coupons, catalog, invoices, audit log: PASSED');
    console.log('✔ Level 9: Output encoding — storefront, invoice, back-office XSS (ADR-022): PASSED');
    console.log('========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    process.exit(1);
  }
}

main();
