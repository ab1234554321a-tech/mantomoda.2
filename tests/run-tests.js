import { runSecurityTests } from './security.test.js';
import { runWholesaleTests } from './wholesale.test.js';
import { runPricingTests } from './pricing.test.js';
import { runAdversarialTests } from './adversarial.test.js';
import { runPaymentTests } from './payment.test.js';
import { runOtpTests } from './otp.test.js';

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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedCount} TEST SUITES PASSED SUCCESSFULLY! (${duration}s)`);
    console.log('✔ Level 1: Unit & Pricing Engine Tests: PASSED');
    console.log('✔ Level 2: Wholesale State Machine & Approval: PASSED');
    console.log('✔ Level 3: Security, JWT Crypto & Price Isolation: PASSED');
    console.log('✔ Level 4: Red Team Adversarial & BOLA Penetration: PASSED');
    console.log('✔ Level 5: Payment Gateway & Provider Adapter (BL-006): PASSED');
    console.log('✔ Level 6: OTP / SMS Mobile Verification (BL-007): PASSED');
    console.log('========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    process.exit(1);
  }
}

main();
