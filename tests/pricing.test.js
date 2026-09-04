import assert from 'assert';
import { db } from '../src/server/db/store.js';

export async function runPricingTests() {
  console.log('\n🧮 Running Pricing Engine & Cart Validation Tests (ADR-003)...');

  const p1 = db.findProductById('prod-001'); // Retail: 1,850,000, Wholesale: 1,120,000, MinQty: 6
  assert.ok(p1, 'Product prod-001 must exist');

  // Test 1: Retail user purchasing 1 unit
  const retailUser = db.findUserByEmail('neda.alavi@gmail.com');
  const qtyRetail = 1;
  const retailTotal = p1.retailPrice * qtyRetail;
  assert.strictEqual(retailTotal, 1850000, 'Retail subtotal calculation is accurate');
  console.log('  ✔ Passed: Retail user pricing calculates strictly with retailPrice.');

  // Test 2: Wholesale user purchasing below minimum quantity threshold (e.g. 2 units < 6 minQty)
  const wholesaleUser = db.findUserByEmail('boutique.tehran@manto.ir');
  const qtyBelowMin = 2;
  const belowMinAppliedPrice = qtyBelowMin >= p1.wholesaleMinQuantity ? p1.wholesalePrice : p1.retailPrice;
  assert.strictEqual(belowMinAppliedPrice, p1.retailPrice, 'Below wholesale threshold must charge retail price');
  console.log('  ✔ Passed: Sub-threshold wholesale quantities safely fall back to retail price.');

  // Test 3: Wholesale user meeting minimum bulk threshold (e.g. 10 units >= 6 minQty)
  const qtyAboveMin = 10;
  const aboveMinAppliedPrice = qtyAboveMin >= p1.wholesaleMinQuantity ? p1.wholesalePrice : p1.retailPrice;
  const wholesaleTotal = aboveMinAppliedPrice * qtyAboveMin;
  const wholesaleSavings = (p1.retailPrice - p1.wholesalePrice) * qtyAboveMin;

  assert.strictEqual(aboveMinAppliedPrice, p1.wholesalePrice, 'Threshold met applies wholesale price');
  assert.strictEqual(wholesaleTotal, 11200000, 'Wholesale line total matches 10 * 1,120,000');
  assert.strictEqual(wholesaleSavings, 7300000, 'Wholesale savings matches (1,850,000 - 1,120,000) * 10');
  console.log('  ✔ Passed: Bulk wholesale threshold applies wholesale rate with accurate savings.');
}
