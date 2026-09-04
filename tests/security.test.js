import assert from 'assert';
import { db } from '../src/server/db/store.js';
import { sanitizeProductForUser, sanitizeProductListForUser } from '../src/server/middlewares/price-sanitizer.js';

export async function runSecurityTests() {
  console.log('\n🔒 Running Security & Price Protection Tests (ADR-003)...');

  const sampleProduct = db.findProductById('prod-001');
  assert.ok(sampleProduct, 'Sample product should exist in DB');
  assert.ok(sampleProduct.wholesalePrice > 0, 'Database model must have wholesalePrice');

  // Test 1: Guest User (Unauthenticated) must NOT see wholesalePrice
  const guestSanitized = sanitizeProductForUser(sampleProduct, null);
  assert.strictEqual(guestSanitized.wholesalePrice, undefined, 'Guest MUST NOT see wholesalePrice');
  assert.strictEqual(guestSanitized.wholesaleMinQuantity, undefined, 'Guest MUST NOT see wholesaleMinQuantity');
  assert.ok(guestSanitized.retailPrice > 0, 'Guest CAN see retailPrice');
  console.log('  ✔ Passed: Guest user receives sanitized product without wholesale price.');

  // Test 2: Regular Retail User must NOT see wholesalePrice
  const retailUser = db.findUserByEmail('neda.alavi@gmail.com');
  const retailSanitized = sanitizeProductForUser(sampleProduct, retailUser);
  assert.strictEqual(retailSanitized.wholesalePrice, undefined, 'Retail user MUST NOT see wholesalePrice');
  assert.strictEqual(retailSanitized.wholesaleMinQuantity, undefined, 'Retail user MUST NOT see wholesaleMinQuantity');
  console.log('  ✔ Passed: Retail user receives sanitized product without wholesale price.');

  // Test 3: Unapproved / Pending Wholesale Applicant must NOT see wholesalePrice
  const pendingUser = db.findUserByEmail('boutique.shiraz@gmail.com');
  const pendingSanitized = sanitizeProductForUser(sampleProduct, pendingUser);
  assert.strictEqual(pendingSanitized.wholesalePrice, undefined, 'Pending applicant MUST NOT see wholesalePrice');
  console.log('  ✔ Passed: Unapproved/Pending wholesale applicant cannot see wholesale price.');

  // Test 4: Verified Wholesale User MUST see wholesalePrice
  const wholesaleUser = db.findUserByEmail('boutique.tehran@manto.ir');
  const wholesaleSanitized = sanitizeProductForUser(sampleProduct, wholesaleUser);
  assert.strictEqual(wholesaleSanitized.wholesalePrice, sampleProduct.wholesalePrice, 'Wholesale user MUST see wholesalePrice');
  assert.strictEqual(wholesaleSanitized.wholesaleMinQuantity, sampleProduct.wholesaleMinQuantity, 'Wholesale user MUST see wholesaleMinQuantity');
  console.log('  ✔ Passed: Verified wholesale merchant correctly receives wholesale price.');

  // Test 5: Admin User MUST see wholesalePrice
  const adminUser = db.findUserByEmail('admin@manto.ir');
  const adminSanitized = sanitizeProductForUser(sampleProduct, adminUser);
  assert.strictEqual(adminSanitized.wholesalePrice, sampleProduct.wholesalePrice, 'Admin MUST see wholesalePrice');
  console.log('  ✔ Passed: Admin user correctly receives wholesale price.');

  // Test 6: Bulk Product List Sanitization
  const allProducts = db.listProducts();
  const guestList = sanitizeProductListForUser(allProducts, null);
  const leakedProducts = guestList.filter(p => p.wholesalePrice !== undefined);
  assert.strictEqual(leakedProducts.length, 0, 'Zero products should leak wholesalePrice in product listing');
  console.log('  ✔ Passed: List sanitization verified with 0 price leaks across all catalog items.');
}
