import { runSecurityTests } from './security.test.js';
import { runWholesaleTests } from './wholesale.test.js';
import { runPricingTests } from './pricing.test.js';

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

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n========================================================');
    console.log(`🎉 ALL ${passedCount} TEST SUITES PASSED SUCCESSFULLY! (${duration}s)`);
    console.log('✔ Security Price Isolation: VERIFIED');
    console.log('✔ Wholesale Approval State Machine: VERIFIED');
    console.log('✔ Cart & Pricing Engine: VERIFIED');
    console.log('========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    process.exit(1);
  }
}

main();
