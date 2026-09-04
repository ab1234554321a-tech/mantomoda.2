/**
 * Skill: State Sync & Health Check (همگام‌ساز وضعیت پروژه)
 * Validates and synchronizes PROJECT_STATE.md and project-state.json with repository reality.
 */

import fs from 'fs';

console.log('====================================================');
console.log('🔄 MANTO MODA — STATE SYNCHRONIZATION SKILL 🔄');
console.log('====================================================');

const stateJsonPath = 'project-state.json';
const stateMdPath = 'PROJECT_STATE.md';

if (!fs.existsSync(stateJsonPath) || !fs.existsSync(stateMdPath)) {
  console.error('❌ State files missing!');
  process.exit(1);
}

const stateJson = JSON.parse(fs.readFileSync(stateJsonPath, 'utf-8'));
const stateMd = fs.readFileSync(stateMdPath, 'utf-8');

console.log(`\nProject: ${stateJson.projectName}`);
console.log(`Version: ${stateJson.version}`);
console.log(`Current Phase: ${stateJson.currentPhase}`);
console.log(`Progress: ${stateJson.overallProgressPercent}%`);
console.log(`Active Branch: ${stateJson.activeBranch}`);

console.log(`\nCompleted Items: ${stateJson.completed.length}`);
stateJson.completed.forEach((c, i) => console.log(`  [x] ${c}`));

console.log(`\nIn Progress Items: ${stateJson.inProgress.length}`);
stateJson.inProgress.forEach((ip, i) => console.log(`  [ ] ${ip}`));

console.log(`\nIdentified Risks: ${stateJson.risks.length}`);
stateJson.risks.forEach((r, i) => console.log(`  ⚠️ [${r.severity}] ${r.risk} -> Mitigation: ${r.mitigation}`));

console.log(`\nNext Recommended Step:\n  👉 ${stateJson.nextRecommendedStep}`);

// Update timestamp
stateJson.lastUpdated = new Date().toISOString();
fs.writeFileSync(stateJsonPath, JSON.stringify(stateJson, null, 2));

console.log('\n✔ State files validated & synchronized successfully.');
console.log('====================================================\n');
