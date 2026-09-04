/**
 * Skill Orchestrator CLI (ارکستریتور مرکزی مهارت‌ها و ایجنت‌ها)
 * Runs all autonomous skills in sequence: Audit -> Security -> Tests -> State Sync.
 */

import { execSync } from 'child_process';

console.log('############################################################');
console.log('🤖 MANTO MODA — AI AGENT & SKILLS ORCHESTRATION PIPELINE 🤖');
console.log('############################################################\n');

function runStep(name, command) {
  console.log(`\n▶ [Executing Skill]: ${name}`);
  try {
    const output = execSync(command, { encoding: 'utf-8', stdio: 'inherit' });
    console.log(`✔ [Skill Completed]: ${name}`);
  } catch (error) {
    console.error(`❌ [Skill Failed]: ${name}`);
    process.exit(1);
  }
}

try {
  runStep('1. Project Architecture & Artifacts Audit', 'node skills/project-auditor.js');
  runStep('2. Autonomous Security & Price Isolation Guard', 'node skills/security-guard.js');
  runStep('3. CI Quality & Regression Gate Tests', 'npm test');
  runStep('4. Project State & JSON Synchronizer', 'node skills/state-sync.js');

  console.log('\n############################################################');
  console.log('🎉 ALL AI AGENT SKILLS & QUALITY GATES EXECUTED SUCCESSFULLY!');
  console.log('🚀 SYSTEM READY FOR PRODUCTION AND MULTI-AGENT COLLABORATION');
  console.log('############################################################\n');
} catch (e) {
  console.error('Pipeline execution aborted.', e);
  process.exit(1);
}
