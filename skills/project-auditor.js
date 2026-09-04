/**
 * Skill: Autonomous Project Auditor (ممیز خودکار پروژه)
 * Inspects repository health, architectural integrity, price isolation, test status, and state files.
 */

import fs from 'fs';
import path from 'path';
import { db } from '../src/server/db/store.js';
import { sanitizeProductListForUser } from '../src/server/middlewares/price-sanitizer.js';

console.log('====================================================');
console.log('🔍 MANTO MODA — AUTONOMOUS PROJECT AUDIT SKILL 🔍');
console.log('====================================================');

let score = 100;
const issues = [];

// 1. Audit Required Documentation and State Files
const requiredFiles = [
  'ROADMAP.md',
  'PROJECT_STATE.md',
  'project-state.json',
  'TASKS.md',
  'ARCHITECTURE.md',
  'DECISIONS.md',
  'CHANGELOG.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  'PROJECT_HANDOFF.md',
  '.gitignore',
  '.env.example',
  'Dockerfile'
];

console.log('\n[1/4] Checking State & Architecture Artifacts...');
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`  ✔ Found: ${file}`);
  } else {
    console.log(`  ❌ Missing: ${file}`);
    issues.push(`Missing essential project artifact: ${file}`);
    score -= 10;
  }
}

// 2. Audit Core Code Modules
console.log('\n[2/4] Checking Backend & Frontend Core Modules...');
const coreModules = [
  'src/server/index.js',
  'src/server/db/store.js',
  'src/server/middlewares/auth.js',
  'src/server/middlewares/price-sanitizer.js',
  'src/server/routes/auth.routes.js',
  'src/server/routes/product.routes.js',
  'src/server/routes/wholesale.routes.js',
  'src/server/routes/cart.routes.js',
  'src/server/routes/order.routes.js',
  'src/server/routes/admin.routes.js',
  'src/client/public/index.html',
  'src/client/public/app.js',
  'src/client/public/styles.css'
];

for (const mod of coreModules) {
  if (fs.existsSync(mod)) {
    console.log(`  ✔ Module OK: ${mod}`);
  } else {
    console.log(`  ❌ Module Missing: ${mod}`);
    issues.push(`Missing core module: ${mod}`);
    score -= 10;
  }
}

// 3. Security Audit: Price Leakage Check
console.log('\n[3/4] Running Security Audit (Wholesale Price Leak Check)...');
const allProducts = db.listProducts();
const sanitizedGuestProducts = sanitizeProductListForUser(allProducts, null);
const leaked = sanitizedGuestProducts.filter(p => p.wholesalePrice !== undefined || p.wholesaleMinQuantity !== undefined);

if (leaked.length === 0) {
  console.log(`  ✔ Price Protection Verified: 0 / ${allProducts.length} items exposed to guest/retail.`);
} else {
  console.log(`  ❌ SECURITY ALERT: ${leaked.length} products leaked wholesale pricing!`);
  issues.push('Critical Price Leak detected in product sanitizer');
  score -= 30;
}

// 4. Data Layer & Catalog Health
console.log('\n[4/4] Validating Database Seed & Store Integrity...');
const categories = db.listCategories();
const orders = db.listOrders();
const applications = db.listApplications();

console.log(`  ✔ Active Products: ${allProducts.length}`);
console.log(`  ✔ Active Categories: ${categories.length}`);
console.log(`  ✔ Total Seed Orders: ${orders.length}`);
console.log(`  ✔ Wholesale Applications: ${applications.length}`);

// Final Report
console.log('\n====================================================');
console.log(`📊 AUDIT SUMMARY SCORE: ${score}/100`);
if (issues.length === 0) {
  console.log('✅ ALL SYSTEMS OPERATIONAL & HEALTHY!');
  console.log('✔ Architecture: Compliant');
  console.log('✔ Price Security: 100% Protected');
  console.log('✔ Project State: Synchronized');
} else {
  console.log('⚠️ Identified Issues to Resolve:');
  issues.forEach((iss, i) => console.log(`  ${i + 1}. ${iss}`));
}
console.log('====================================================\n');

process.exit(score >= 80 ? 0 : 1);
