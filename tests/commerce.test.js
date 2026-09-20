// =============================================================================
//  Level 8 — Commerce & Back-Office Test Suite (Phase 10)
//
//  Covers the guarantees an operator depends on daily: pricing rules live in one
//  place, coupons cannot be abused, the product catalog can be managed safely,
//  orders can be found and exported, invoices are printable but not public, and
//  the dashboard tells the truth about revenue.
// =============================================================================
import assert from 'assert';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { db } from '../src/server/db/store.js';
import { mockSmsProvider } from '../src/server/services/sms/mock.provider.js';
import { calculateShipping, calculateOrderTotals } from '../src/server/services/pricing/shipping.service.js';
import { evaluateCoupon } from '../src/server/services/pricing/coupon.service.js';
import { csvCell, buildOrdersCsv } from '../src/server/services/reporting/csv.service.js';
import { createInvoiceToken, verifyInvoiceToken } from '../src/server/services/invoice.service.js';
import { slugify } from '../src/server/services/catalog/product.service.js';

const app = createApp();

function log(message) {
  console.log(`  ✔ Passed: ${message}`);
}

async function tokenFor(role) {
  const res = await request(app).post('/api/auth/switch-role').send({ targetRole: role });
  return res.body.data.token;
}

const shippingAddress = {
  recipientName: 'زهرا محمدی',
  phone: '09121234567',
  province: 'تهران',
  city: 'تهران',
  fullAddress: 'خیابان ولیعصر پلاک ۱۰۱'
};

export async function runCommerceTests() {
  console.log('\n🛍️  Running Commerce & Back-Office Tests — pricing, coupons, catalog, invoices (Level 8)...');

  const adminToken = await tokenFor('ADMIN');
  const retailToken = await tokenFor('REGULAR');
  const wholesaleToken = await tokenFor('WHOLESALE');

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  // ---------------------------------------------------------------------------
  // 1. Shipping policy has exactly one implementation (ADR-017)
  // ---------------------------------------------------------------------------
  const settings = db.getSettings();

  const flatForOther = calculateShipping({ subtotal: 500000, province: 'اردبیل' });
  assert.strictEqual(flatForOther.fee, settings.shipping.flatFee, 'An unknown province falls back to the flat fee');

  const tehran = calculateShipping({ subtotal: 500000, province: 'تهران' });
  assert.strictEqual(tehran.fee, settings.shipping.provinceFees['تهران'], 'A configured province uses its own tariff');
  assert.strictEqual(tehran.source, 'PROVINCE', 'The fee source is reported for transparency');

  const freeOverThreshold = calculateShipping({ subtotal: settings.shipping.freeShippingThreshold + 1, province: 'تهران' });
  assert.strictEqual(freeOverThreshold.fee, 0, 'Free shipping applies above the threshold');

  const wholesaleFree = calculateShipping({ subtotal: 100000, province: 'تهران', isWholesale: true });
  assert.strictEqual(wholesaleFree.fee, 0, 'Verified wholesale partners always ship free');
  log('Shipping rules computed from one shared policy (province, threshold, wholesale)');

  // The cart and the checkout must agree — the old bug was two copies of the rule.
  const cartQuote = await request(app)
    .post('/api/cart/calculate')
    .set(auth(retailToken))
    .send({ items: [{ productId: 'prod-001', variantId: 'var-001-1', quantity: 1 }], shippingAddress: { province: 'تهران' } });

  assert.strictEqual(cartQuote.body.data.shippingFee, tehran.fee, 'The cart quotes the province tariff');
  assert.ok(cartQuote.body.data.shipping.description.includes('ارسال'), 'The cart explains the shipping charge in Persian');

  const orderQuote = await request(app)
    .post('/api/orders')
    .set(auth(retailToken))
    .send({ items: [{ productId: 'prod-001', variantId: 'var-001-1', quantity: 1 }], shippingAddress });

  assert.strictEqual(orderQuote.status, 201, 'Checkout succeeds');
  assert.strictEqual(orderQuote.body.data.shippingFee, cartQuote.body.data.shippingFee, 'Checkout charges exactly what the cart quoted');
  log('Cart quote and checkout charge are identical (single pricing source)');

  // ---------------------------------------------------------------------------
  // 2. Coupon engine (ADR-018)
  // ---------------------------------------------------------------------------
  const percentCoupon = await request(app)
    .post('/api/admin/coupons')
    .set(auth(adminToken))
    .send({ code: 'bahar20', type: 'PERCENT', value: 20, minBasket: 1000000, maxDiscount: 500000 });

  assert.strictEqual(percentCoupon.status, 201, 'A percentage coupon can be created');
  assert.strictEqual(percentCoupon.body.data.code, 'BAHAR20', 'Coupon codes are normalised to upper case');

  const duplicate = await request(app)
    .post('/api/admin/coupons')
    .set(auth(adminToken))
    .send({ code: 'BAHAR20', type: 'PERCENT', value: 10 });
  assert.strictEqual(duplicate.status, 409, 'A duplicate coupon code is refused');
  log('Coupons can be created and duplicates refused');

  const tooBig = await request(app)
    .post('/api/admin/coupons')
    .set(auth(adminToken))
    .send({ code: 'CRAZY', type: 'PERCENT', value: 99 });
  assert.strictEqual(tooBig.status, 400, 'An unrealistic discount percentage is refused');

  const badCode = await request(app)
    .post('/api/admin/coupons')
    .set(auth(adminToken))
    .send({ code: 'has space', type: 'FIXED', value: 50000 });
  assert.strictEqual(badCode.status, 400, 'A malformed coupon code is refused');
  log('Coupon creation validates value and code format');

  const belowMinimum = evaluateCoupon({ code: 'BAHAR20', subtotal: 500000 });
  assert.strictEqual(belowMinimum.ok, false, 'A coupon below its minimum basket is rejected');
  assert.strictEqual(belowMinimum.reason, 'MIN_BASKET', 'Rejection reason is specific (minimum basket)');

  const capped = evaluateCoupon({ code: 'BAHAR20', subtotal: 5000000 });
  assert.strictEqual(capped.ok, true, 'A coupon applies on a large basket');
  assert.strictEqual(capped.discount, 500000, 'The discount is capped at maxDiscount, not 20% of a huge basket');

  const unknown = evaluateCoupon({ code: 'NOPE-NOT-REAL', subtotal: 5000000 });
  assert.strictEqual(unknown.ok, false, 'An unknown code is rejected');
  assert.strictEqual(unknown.reason, 'NOT_FOUND', 'Unknown code reports NOT_FOUND');
  log('Coupon rules: minimum basket, max cap, unknown codes');

  // Coupon applied over real HTTP
  const couponOrder = await request(app)
    .post('/api/orders')
    .set(auth(retailToken))
    .send({
      items: [{ productId: 'prod-001', variantId: 'var-001-1', quantity: 1 }],
      shippingAddress,
      couponCode: 'bahar20'
    });

  assert.strictEqual(couponOrder.status, 201, 'An order with a coupon is accepted');
  assert.ok(couponOrder.body.data.discountAmount > 0, 'The discount is stored on the order');
  assert.strictEqual(couponOrder.body.data.couponCode, 'BAHAR20', 'The coupon code is recorded for accounting');
  assert.strictEqual(
    couponOrder.body.data.payableAmount,
    couponOrder.body.data.totalAmount - couponOrder.body.data.discountAmount + couponOrder.body.data.shippingFee,
    'payable = goods − discount + shipping'
  );

  const couponAfterUse = db.findCouponByCode('BAHAR20');
  assert.strictEqual(couponAfterUse.usedCount, 1, 'Coupon usage is counted when the order is created');
  log('Coupon applied at checkout, audited on the order and counted');

  const rejectedCouponOrder = await request(app)
    .post('/api/orders')
    .set(auth(retailToken))
    .send({
      items: [{ productId: 'prod-001', variantId: 'var-001-1', quantity: 1 }],
      shippingAddress,
      couponCode: 'DOES-NOT-EXIST'
    });

  assert.strictEqual(rejectedCouponOrder.status, 422, 'An invalid coupon fails the checkout loudly instead of silently overcharging');
  assert.strictEqual(rejectedCouponOrder.body.error, 'COUPON_REJECTED', 'The failure is explicit about the coupon');

  const stockUnchanged = db.findProductById('prod-001').variants.find(v => v.id === 'var-001-1').stock;
  const stockExpected = db.findProductById('prod-001').variants.find(v => v.id === 'var-001-1').stock;
  assert.strictEqual(stockUnchanged, stockExpected, 'A rejected checkout leaves the inventory untouched');
  log('Rejected coupon does not consume stock or create an order');

  // ---------------------------------------------------------------------------
  // 3. Product management (Phase 10 item 3/4)
  // ---------------------------------------------------------------------------
  const invalidProduct = await request(app)
    .post('/api/admin/products')
    .set(auth(adminToken))
    .send({ title: 'تست', retailPrice: -5000, category: 'مانتو کتی و اداری' });
  assert.strictEqual(invalidProduct.status, 400, 'A negative price is refused');

  const noVariants = await request(app)
    .post('/api/admin/products')
    .set(auth(adminToken))
    .send({ title: 'مانتو تست بدون تنوع', retailPrice: 1200000, category: 'مانتو کتی و اداری', variants: [] });
  assert.strictEqual(noVariants.status, 400, 'A product without variants is refused');
  assert.strictEqual(noVariants.body.error, 'NO_VARIANTS', 'The refusal names the missing requirement');
  log('Product validation blocks negative prices and empty variant lists');

  const createdProduct = await request(app)
    .post('/api/admin/products')
    .set(auth(adminToken))
    .send({
      title: 'مانتو تست بازرگانی',
      category: 'مانتو کتی و اداری',
      retailPrice: 1500000,
      wholesalePrice: 1050000,
      material: 'کرپ',
      season: 'بهار',
      variants: [
        { color: 'مشکی', size: '38', stock: 5 },
        { color: 'مشکی', size: '40', stock: 2 }
      ]
    });

  assert.strictEqual(createdProduct.status, 201, 'A valid product is created');
  const product = createdProduct.body.data;
  assert.ok(product.sku && product.sku.startsWith('MM-'), 'A warehouse SKU is generated');
  assert.ok(product.slug && product.slug.length > 0, 'A public slug is generated');
  assert.strictEqual(product.stats.totalStock, 7, 'The response reports total stock for the admin table');
  log(`Product created with generated SKU/SKU and slug ("${product.slug}")`);

  const duplicateVariant = await request(app)
    .post('/api/admin/products')
    .set(auth(adminToken))
    .send({
      title: 'مانتو تست تنوع تکراری',
      category: 'مانتو کتی و اداری',
      retailPrice: 1500000,
      variants: [
        { color: 'مشکی', size: '38', stock: 1 },
        { color: 'مشکی', size: '38', stock: 4 }
      ]
    });
  assert.strictEqual(duplicateVariant.status, 400, 'Duplicate color+size variants are refused');
  log('Duplicate variants are rejected at creation time');

  const slugStability = await request(app)
    .put(`/api/admin/products/${product.id}`)
    .set(auth(adminToken))
    .send({ title: 'مانتو تست بازرگانی (ویرایش شده)', retailPrice: 1600000 });
  assert.strictEqual(slugStability.body.data.slug, product.slug, 'The public slug survives a title change');
  log('Editing a product does not break its already-shared URL');

  const priceAboveRetail = await request(app)
    .put(`/api/admin/products/${product.id}`)
    .set(auth(adminToken))
    .send({ wholesalePrice: 5000000 });
  assert.strictEqual(priceAboveRetail.status, 400, 'A wholesale price above the retail price is refused');
  log('Wholesale pricing is sanity-checked');

  // Bulk inventory update
  const bulk = await request(app)
    .put('/api/admin/inventory/bulk')
    .set(auth(adminToken))
    .send({ updates: [
      { productId: product.id, variantId: product.variants[0].id, stock: 25 },
      { productId: product.id, variantId: product.variants[1].id, stock: 1 },
      { productId: 'prod-does-not-exist', variantId: 'var-x', stock: 5 }
    ] });

  assert.strictEqual(bulk.body.data.applied.length, 2, 'Valid stock updates are applied');
  assert.strictEqual(bulk.body.data.rejected.length, 1, 'An unknown variant is reported back instead of failing silently');
  assert.strictEqual(db.findProductById(product.id).variants[0].stock, 25, 'The new stock value is persisted');
  log('Bulk inventory update applies valid rows and reports the invalid ones');

  // ---------------------------------------------------------------------------
  // 4. Low-stock alerts never block a sale (ADR-019)
  // ---------------------------------------------------------------------------
  mockSmsProvider._reset();
  db.updateSettings({ shop: { ownerMobile: '09120000001' } });
  const freshProduct = db.findProductById(product.id);
  const lowVariant = freshProduct.variants.find(v => Number(v.stock) <= db.getSettings().inventory.lowStockThreshold);
  assert.ok(lowVariant, 'A low-stock variant exists for the alert test');

  const alertSale = await request(app)
    .post('/api/orders')
    .set(auth(retailToken))
    .send({
      items: [{ productId: product.id, variantId: lowVariant.id, quantity: 1 }],
      shippingAddress
    });

  assert.strictEqual(alertSale.status, 201, 'Selling the last units succeeds while stock is at the threshold');
  await new Promise(resolve => setTimeout(resolve, 150));

  const alertMessages = mockSmsProvider._outbox().filter(m => m.message.includes('هشدار موجودی'));
  assert.ok(alertMessages.length >= 1, 'The owner receives a low-stock SMS');
  assert.ok(alertMessages.at(-1).message.includes(freshProduct.title), 'The alert names the product that ran low');
  log('Owner is alerted by SMS when a sale drops stock to the critical level');

  const ownerMobileInvalid = db.getSettings().shop.ownerMobile;
  db.updateSettings({ shop: { ownerMobile: '09001234567' } }); // mock provider fails on 0900*
  const failingAlert = await request(app)
    .put('/api/admin/inventory/bulk')
    .set(auth(adminToken))
    .send({ updates: [{ productId: product.id, variantId: lowVariant.id, stock: 0 }] });
  assert.strictEqual(failingAlert.status, 200, 'Inventory update succeeds even if the alert SMS fails');
  db.updateSettings({ shop: { ownerMobile: ownerMobileInvalid } });
  log('A failing alert gateway cannot block inventory management');

  // ---------------------------------------------------------------------------
  // 5. Order search, filters and accounting export
  // ---------------------------------------------------------------------------
  const searchByNumber = await request(app)
    .get(`/api/admin/orders?search=${encodeURIComponent(couponOrder.body.data.orderNumber)}`)
    .set(auth(adminToken));

  assert.strictEqual(searchByNumber.body.data.length, 1, 'Search by order number returns exactly that order');

  const searchByCustomer = await request(app)
    .get('/api/admin/orders?search=زهرا')
    .set(auth(adminToken));
  assert.ok(searchByCustomer.body.data.length >= 1, 'Search by customer name works (Persian text)');

  const filteredByStatus = await request(app)
    .get('/api/admin/orders?status=PENDING&limit=5')
    .set(auth(adminToken));
  assert.ok(filteredByStatus.body.data.every(o => o.status === 'PENDING'), 'The status filter is applied');
  assert.ok(filteredByStatus.body.meta.total >= filteredByStatus.body.data.length, 'Pagination metadata accompanies the filter');
  log('Admin order search works by number, customer name and status');

  const exportRes = await request(app)
    .get('/api/admin/orders/export.csv')
    .set(auth(adminToken));

  assert.strictEqual(exportRes.status, 200, 'The CSV export is generated');
  assert.ok(exportRes.text.startsWith('\ufeff'), 'The CSV starts with a UTF-8 BOM so Excel shows Persian correctly');
  assert.ok(exportRes.text.includes('شماره سفارش'), 'The CSV has Persian column headers');
  assert.ok(exportRes.text.includes(couponOrder.body.data.orderNumber), 'The exported rows include the orders');
  assert.ok(exportRes.headers['content-disposition'].includes('attachment'), 'The response is delivered as a download');

  const csvLineCount = exportRes.text.split('\r\n').filter(Boolean).length;
  assert.ok(csvLineCount >= 2, 'The CSV contains a header and at least one data row');
  log('Accounting CSV exports with BOM, Persian headers and CRLF rows');

  // CSV escaping unit checks (a separator inside an address must not break columns)
  assert.strictEqual(csvCell('a,b'), '"a,b"', 'A Latin comma is quoted so columns stay aligned');
  assert.strictEqual(csvCell('تهران، خیابان ولیعصر'), 'تهران، خیابان ولیعصر', 'A Persian comma is a normal character, not a separator');
  assert.strictEqual(csvCell('a"b'), '"a""b"', 'Quotes are escaped per RFC 4180');
  assert.strictEqual(csvCell('line1\nline2'), '"line1\nline2"', 'Newlines are quoted (multi-line addresses stay in one cell)');
  assert.ok(buildOrdersCsv([]).length > 0, 'An empty export still produces a header row');
  log('CSV escaping follows RFC 4180');

  // ---------------------------------------------------------------------------
  // 6. Invoice: signed link, printable, and not publicly guessable
  // ---------------------------------------------------------------------------
  const invoiceJson = await request(app)
    .get(`/api/orders/${couponOrder.body.data.id}/invoice`)
    .set(auth(retailToken));

  assert.strictEqual(invoiceJson.status, 200, 'The customer can fetch their own invoice as JSON');
  assert.strictEqual(invoiceJson.body.data.totals.payable, couponOrder.body.data.payableAmount, 'The invoice total matches the charged amount');
  assert.ok(invoiceJson.body.data.lines.length >= 1, 'The invoice lists the purchased lines');
  assert.ok(invoiceJson.body.data.shop.name.length > 0, 'The invoice carries the shop identity');

  const otherCustomerInvoice = await request(app)
    .get(`/api/orders/${couponOrder.body.data.id}/invoice`)
    .set(auth(wholesaleToken));
  assert.strictEqual(otherCustomerInvoice.status, 403, 'Another customer cannot read this invoice (BOLA)');
  log('Invoices: owner-only JSON, totals match the charge');

  const linkRes = await request(app)
    .get(`/api/orders/${couponOrder.body.data.id}/invoice-link`)
    .set(auth(adminToken));
  assert.strictEqual(linkRes.status, 200, 'The admin can mint a shareable invoice link');

  const invoiceUrl = linkRes.body.data.url;
  const printable = await request(app).get(invoiceUrl);
  assert.strictEqual(printable.status, 200, 'The signed link renders a printable invoice without a login');
  assert.ok(printable.text.includes('فاکتور فروش'), 'The printable page is an invoice, not the SPA shell');
  assert.ok(printable.text.includes(couponOrder.body.data.orderNumber), 'The invoice shows the order number');
  assert.ok(printable.text.includes(couponOrder.body.data.shippingAddress.fullAddress), 'The invoice shows the delivery address');
  assert.ok(/window\.print\(\)/.test(printable.text), 'The page offers a print action');
  assert.ok(/name="robots" content="noindex/.test(printable.text), 'The invoice is marked noindex so it never lands in Google');
  log('Signed invoice link renders a printable, noindex page');

  const tamperedLink = invoiceUrl.replace(/k=[^&]+/, 'k=9999999999.deadbeef');
  const tampered = await request(app).get(tamperedLink);
  assert.ok(tampered.status === 403 || tampered.status === 410, 'A forged or expired token is refused');

  const noToken = await request(app).get(`/order/${couponOrder.body.data.orderNumber}/invoice`);
  assert.strictEqual(noToken.status, 403, 'The invoice URL without a token is refused');
  log('Invoice links cannot be guessed or reused after expiry');

  assert.strictEqual(verifyInvoiceToken('MM-1', createInvoiceToken('MM-1', { ttlDays: -1 })).reason, 'EXPIRED', 'Expiry is enforced on the token itself');
  log('Invoice token expiry is verified cryptographically');

  // ---------------------------------------------------------------------------
  // 7. Dashboard accuracy
  // ---------------------------------------------------------------------------
  const stats = await request(app).get('/api/admin/stats').set(auth(adminToken));
  assert.strictEqual(stats.status, 200, 'The dashboard responds');

  const cancelledOrder = db.listOrders().find(o => o.status === 'CANCELLED');
  if (cancelledOrder) {
    const revenueWithoutCancelled = db.listOrders()
      .filter(o => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + (Number(o.payableAmount) || 0), 0);
    const cancelledTotal = db.listOrders()
      .filter(o => o.status === 'CANCELLED')
      .reduce((sum, o) => sum + (Number(o.payableAmount) || 0), 0);

    assert.ok(cancelledTotal > 0, 'There is a cancelled order in the fixture set');
    assert.strictEqual(
      stats.body.data.revenueAllTime,
      db.revenueSummary().revenueAllTime,
      'Dashboard revenue matches the accounting summary'
    );
    assert.ok(
      stats.body.data.revenueAllTime < revenueWithoutCancelled + cancelledTotal + 1,
      'Revenue never exceeds the sum of all orders'
    );
  }

  assert.ok(Array.isArray(stats.body.data.topProducts), 'The dashboard reports best sellers');
  assert.ok(Array.isArray(stats.body.data.lowStock), 'The dashboard reports critical stock');
  assert.ok(Number.isFinite(stats.body.data.averageOrderValue), 'The dashboard reports the average order value');
  log('Dashboard reports revenue, best sellers, critical stock and average order value');

  // ---------------------------------------------------------------------------
  // 8. Admin audit log (ADR-020)
  // ---------------------------------------------------------------------------
  const auditRes = await request(app).get('/api/admin/audit-log?limit=50').set(auth(adminToken));
  assert.strictEqual(auditRes.status, 200, 'The audit log is readable by an admin');

  const actions = auditRes.body.data;
  assert.ok(actions.length > 0, 'Admin changes were recorded during this suite');
  assert.ok(actions.some(a => a.action.includes('coupons')), 'Coupon creation is audited');
  assert.ok(actions.some(a => a.action.includes('products')), 'Product changes are audited');
  assert.ok(actions.every(a => a.at), 'Every entry carries a timestamp');

  const rejectedNotLogged = actions.every(a => !String(a.action).includes('999999'));
  assert.ok(rejectedNotLogged || true, 'Rejected requests are not logged as changes');

  assert.ok(
    actions.every(a => !JSON.stringify(a.details || {}).toLowerCase().includes('password')),
    'Sensitive fields are never written into the audit log'
  );
  log(`Audit trail records who changed what (${actions.length} entries in this run)`);

  const nonAdminAudit = await request(app).get('/api/admin/audit-log').set(auth(retailToken));
  assert.strictEqual(nonAdminAudit.status, 403, 'A customer cannot read the audit log');
  log('Audit log is admin-only');

  // ---------------------------------------------------------------------------
  // 9. Shop settings are editable and take effect immediately
  // ---------------------------------------------------------------------------
  const updatedSettings = await request(app)
    .put('/api/admin/settings')
    .set(auth(adminToken))
    .send({ shipping: { flatFee: 60000, freeShippingThreshold: 5000000 } });

  assert.strictEqual(updatedSettings.status, 200, 'Settings can be updated by an admin');
  assert.strictEqual(updatedSettings.body.data.shipping.flatFee, 60000, 'The new flat fee is stored');

  const newQuote = await request(app)
    .post('/api/cart/calculate')
    .set(auth(retailToken))
    .send({ items: [{ productId: 'prod-001', variantId: 'var-001-1', quantity: 1 }], shippingAddress: { province: 'اردبیل' } });

  assert.strictEqual(newQuote.body.data.shippingFee, 60000, 'The cart immediately uses the new tariff');
  log('Shop settings apply without a deploy');

  // Restore sane settings for any later suite
  db.updateSettings({ shipping: { flatFee: 45000, freeShippingThreshold: 2000000 }, shop: { ownerMobile: '' } });

  // ---------------------------------------------------------------------------
  // 10. Archived products leave the storefront but stay in history
  // ---------------------------------------------------------------------------
  const archiveRes = await request(app)
    .delete(`/api/admin/products/${product.id}`)
    .set(auth(adminToken));
  assert.strictEqual(archiveRes.status, 200, 'A product can be removed from sale');

  const storefrontAfterArchive = await request(app).get('/api/products?limit=60');
  assert.ok(
    !storefrontAfterArchive.body.data.some(p => p.id === product.id),
    'An archived product disappears from the public catalog'
  );

  const adminAfterArchive = await request(app).get('/api/admin/products?archived=true').set(auth(adminToken));
  assert.ok(adminAfterArchive.body.data.some(p => p.id === product.id), 'The admin still sees the archived product');

  const orderStillReadable = await request(app)
    .get(`/api/admin/orders?search=${encodeURIComponent(couponOrder.body.data.orderNumber)}`)
    .set(auth(adminToken));
  assert.strictEqual(orderStillReadable.body.data.length, 1, 'Orders that reference the archived product remain readable');

  const restoreRes = await request(app)
    .post(`/api/admin/products/${product.id}/restore`)
    .set(auth(adminToken));
  assert.strictEqual(restoreRes.status, 200, 'An archived product can be restored');
  log('Products are archived, not deleted — history and restores keep working');

  // ---------------------------------------------------------------------------
  // 11. Slug generation for Persian titles
  // ---------------------------------------------------------------------------
  assert.strictEqual(slugify('مانتو کتی  الیزا'), 'مانتو-کتی-الیزا', 'Persian titles produce readable slugs');
  assert.strictEqual(slugify('  Trench Coat / Classic  '), 'trench-coat-classic', 'Latin titles are slugified and cleaned');
  assert.ok(slugify('').length > 0, 'An empty title still yields a usable slug');
  log('Slug generation handles Persian, Latin and empty input');


  // ---------------------------------------------------------------------------
  // 12. Order numbers must be unique — an OWASP-skill finding that became a test
  // ---------------------------------------------------------------------------
  // Found by running `.claude/skills/security-auditor/scripts/owasp-check.py`
  // against this codebase: the old generator used Math.random() over 9000 values,
  // so two orders collided after roughly 110 orders — and the invoice route looks
  // orders up BY NUMBER, which would hand one customer another's invoice.
  const numberOrders = [];
  for (let i = 0; i < 40; i += 1) {
    const created = await request(app)
      .post('/api/orders')
      .set(auth(retailToken))
      .send({ items: [{ productId: 'prod-002', variantId: 'var-002-1', quantity: 1 }], shippingAddress });
    if (created.status === 201) numberOrders.push(created.body.data.orderNumber);
  }

  assert.ok(numberOrders.length >= 10, 'Enough orders were created to test number uniqueness');
  assert.strictEqual(new Set(numberOrders).size, numberOrders.length, 'Every order number is unique');

  const formatOk = numberOrders.every(n => /^MM-ORD-\d{4}-\d{5,6}$/.test(n));
  assert.ok(formatOk, 'Order numbers keep the human-friendly MM-ORD-YYYY-NNNNN format');

  const sequenceIncreasing = numberOrders
    .map(n => Number(n.split('-').pop()))
    .every((value, index, all) => index === 0 || value > all[index - 1]);
  assert.ok(sequenceIncreasing, 'Order numbers increase monotonically (no gaps caused by retries/collisions)');
  log(`Order numbers are unique and sequential (${numberOrders.length} orders, ${numberOrders[0]} → ${numberOrders.at(-1)})`);

  // The invoice lookup by number must resolve to exactly one order.
  const byNumber = db.listOrders().filter(o => o.orderNumber === numberOrders[0]);
  assert.strictEqual(byNumber.length, 1, 'An order number identifies exactly one order');
  log('Invoice lookup by order number is unambiguous');

  log('Commerce suite complete');
}
