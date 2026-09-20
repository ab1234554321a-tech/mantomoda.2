// =============================================================================
//  Level 7 — Operations Test Suite
//  Real HTTP tests (supertest) for the operational guarantees that make the shop
//  sellable: no overselling, a real order state machine, customer notifications,
//  catalog pagination, SEO endpoints, image upload hardening and persistence.
//
//  Unlike the earlier suites, these exercise the actual Express stack, including
//  middlewares (auth, RBAC, price sanitizer, validation, rate limiting).
// =============================================================================
import assert from 'assert';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../src/server/app.js';
import { db } from '../src/server/db/store.js';
import { mockSmsProvider } from '../src/server/services/sms/mock.provider.js';

const app = createApp();

function log(message) {
  console.log(`  ✔ Passed: ${message}`);
}

async function tokenFor(role) {
  const res = await request(app).post('/api/auth/switch-role').send({ targetRole: role });
  return res.body.data.token;
}

function firstVariant(product) {
  return (product.variants || [])[0];
}

export async function runOperationsTests() {
  console.log('\n🧭 Running Operations Tests — inventory, lifecycle, notifications, SEO (Level 7)...');

  const adminToken = await tokenFor('ADMIN');
  const retailToken = await tokenFor('REGULAR');
  const wholesaleToken = await tokenFor('WHOLESALE');
  assert.ok(adminToken && retailToken && wholesaleToken, 'Role tokens issued for admin, retail and wholesale users');
  log('Role tokens issued through the real HTTP endpoint');

  // ---------------------------------------------------------------------------
  // 1. Inventory integrity — the single most damaging business bug (ADR-011)
  // ---------------------------------------------------------------------------
  const catalogRes = await request(app).get('/api/products');
  const product = catalogRes.body.data.find((p) => (p.variants || []).length > 0);
  const variant = firstVariant(product);
  const startingStock = Number(variant.stock);

  assert.ok(startingStock > 0, 'Catalog returned a product with stock to test against');
  log('Catalog returns variant stock levels');

  // Overselling attempt: far more than available
  const oversellRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${retailToken}`)
    .send({
      items: [{ productId: product.id, variantId: variant.id, quantity: startingStock + 50 }],
      shippingAddress: {
        recipientName: 'مهاجم آزمایشی', phone: '09120000000', province: 'تهران', city: 'تهران', fullAddress: 'خیابان تست پلاک ۱۰'
      },
      paymentMethod: 'ONLINE_GATEWAY'
    });

  assert.strictEqual(oversellRes.status, 409, 'Ordering more than the available stock is rejected');
  assert.strictEqual(oversellRes.body.error, 'INSUFFICIENT_STOCK', 'Rejection uses a specific, actionable error code');
  assert.strictEqual(oversellRes.body.shortages[0].available, startingStock, 'Shortage response reports exactly how many remain');
  log('Overselling blocked (HTTP 409 with per-item availability)');

  // A valid order must decrement stock
  const qty = Math.min(2, startingStock);
  const orderRes = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${retailToken}`)
    .send({
      items: [{ productId: product.id, variantId: variant.id, quantity: qty }],
      shippingAddress: {
        recipientName: 'سارا رضایی', phone: '09121112233', province: 'تهران', city: 'تهران', fullAddress: 'خیابان ولیعصر پلاک ۱'
      },
      paymentMethod: 'ONLINE_GATEWAY'
    });

  assert.strictEqual(orderRes.status, 201, 'A valid order is accepted');
  const order = orderRes.body.data;

  const afterOrder = db.findProductById(product.id).variants.find((v) => v.id === variant.id);
  assert.strictEqual(Number(afterOrder.stock), startingStock - qty, 'Stock is decremented by exactly the ordered quantity');
  log('Stock decremented atomically on checkout');

  // Duplicate concurrent-style attempt for the remaining stock
  const remaining = Number(afterOrder.stock);
  if (remaining < startingStock) {
    const secondOversell = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${retailToken}`)
      .send({
        items: [{ productId: product.id, variantId: variant.id, quantity: remaining + 1 }],
        shippingAddress: { recipientName: 'کاربر دوم', phone: '09120000001', province: 'تهران', city: 'تهران', fullAddress: 'خیابان دوم پلاک ۲۰' }
      });
    assert.strictEqual(secondOversell.status, 409, 'A second oversized order is also rejected against the updated stock');
    log('Repeat oversell attempt after a partial sale is still blocked');
  }

  // Cart endpoint reports availability before checkout
  const cartRes = await request(app)
    .post('/api/cart/calculate')
    .set('Authorization', `Bearer ${retailToken}`)
    .send({ items: [{ productId: product.id, variantId: variant.id, quantity: 999 }] });

  assert.strictEqual(cartRes.body.data.hasStockProblem, true, 'Cart calculation flags stock problems before checkout');
  assert.ok(cartRes.body.data.stockNotices.length > 0, 'Cart returns a human-readable stock notice');
  log('Cart warns about insufficient stock before the customer reaches checkout');

  // ---------------------------------------------------------------------------
  // 2. Order state machine + audit trail + stock release (ADR-011)
  // ---------------------------------------------------------------------------
  const invalidTransition = await request(app)
    .put(`/api/admin/orders/${order.id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'DELIVERED' });

  assert.strictEqual(invalidTransition.status, 409, 'Skipping lifecycle steps (PENDING → DELIVERED) is rejected');
  assert.strictEqual(invalidTransition.body.error, 'INVALID_STATUS_TRANSITION', 'Invalid transition has a dedicated error code');
  assert.deepStrictEqual(
    invalidTransition.body.allowedTransitions,
    ['CONFIRMED', 'CANCELLED'],
    'The response tells the admin exactly which transitions are legal'
  );
  log('Order lifecycle enforced as a state machine (no illegal status jumps)');

  const confirmRes = await request(app)
    .put(`/api/admin/orders/${order.id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'CONFIRMED', note: 'پرداخت تلفنی تأیید شد' });

  assert.strictEqual(confirmRes.status, 200, 'A legal transition succeeds');
  assert.strictEqual(confirmRes.body.data.status, 'CONFIRMED', 'Order reached the requested status');
  assert.ok(confirmRes.body.data.statusHistory.length >= 2, 'Every transition is appended to the audit trail');
  assert.strictEqual(confirmRes.body.data.statusHistory.at(-1).by, db.findUserByEmail('admin@manto.ir').id, 'The audit trail records who made the change');
  log('Legal transition applied and audited (who, when, from → to, note)');

  const markDelivered = await request(app)
    .put(`/api/admin/orders/${order.id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'PROCESSING' });
  assert.strictEqual(markDelivered.status, 200, 'Chained transitions along the allowed path succeed');

  app.locals = app.locals || {};

  // Cancelling must return the stock to the catalog
  const stockBeforeCancel = Number(
    db.findProductById(product.id).variants.find((v) => v.id === variant.id).stock
  );

  const cancelRes = await request(app)
    .put(`/api/admin/orders/${order.id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'CANCELLED', note: 'عدم موجودی رنگ' });

  assert.strictEqual(cancelRes.status, 200, 'Cancelling an order in PROCESSING is allowed');
  assert.strictEqual(cancelRes.body.data.status, 'CANCELLED', 'Order is cancelled');

  const stockAfterCancel = Number(
    db.findProductById(product.id).variants.find((v) => v.id === variant.id).stock
  );
  assert.strictEqual(stockAfterCancel, stockBeforeCancel + qty, 'Cancelling an order returns the reserved stock to the catalog');
  log('Stock restored to inventory on cancellation');

  const cancelAgain = await request(app)
    .put(`/api/admin/orders/${order.id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'CONFIRMED' });
  assert.strictEqual(cancelAgain.status, 409, 'A cancelled order cannot be reopened (terminal state reached)');
  log('Terminal states are respected (cancelled orders stay cancelled)');

  // ---------------------------------------------------------------------------
  // 3. Customer notifications (ADR-012)
  // ---------------------------------------------------------------------------
  mockSmsProvider._reset();

  const notifiableOrder = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${retailToken}`)
    .send({
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
      shippingAddress: { recipientName: 'مریم', phone: '09351234567', province: 'تهران', city: 'تهران', fullAddress: 'خیابان آزادی' }
    });

  assert.strictEqual(notifiableOrder.status, 201, 'A second order is placed for notification testing');

  // The placement SMS is fire-and-forget, so give it a tick to land.
  await new Promise((resolve) => setTimeout(resolve, 150));
  const placedMessages = mockSmsProvider._outbox().filter((m) => m.kind === 'MESSAGE');
  assert.ok(placedMessages.length >= 1, 'An SMS is sent when the order is placed');
  assert.ok(placedMessages.at(-1).message.includes(notifiableOrder.body.data.orderNumber), 'The message contains the order number');

  await request(app)
    .put(`/api/admin/orders/${notifiableOrder.body.data.id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'CONFIRMED' });

  await new Promise((resolve) => setTimeout(resolve, 150));

  const storedOrder = db.findOrderById(notifiableOrder.body.data.id);
  assert.ok(Array.isArray(storedOrder.notifications) && storedOrder.notifications.length >= 2, 'Notification attempts are recorded on the order');
  assert.ok(storedOrder.notifications.some((n) => n.status === 'CONFIRMED' && n.ok === true), 'The status-change notification succeeded and is logged');
  log('Order placement and status-change SMS delivered and audited');

  // A failing SMS gateway must not break the business operation
  const failingOrder = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${retailToken}`)
    .send({
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
      // The mock provider simulates a delivery failure for 0900-prefixed numbers
      shippingAddress: { recipientName: 'تست خطای پیامک', phone: '09001234567', province: 'تهران', city: 'تهران', fullAddress: 'خیابان خطا پلاک ۳۰' }
    });

  assert.strictEqual(failingOrder.status, 201, 'Checkout still succeeds when the SMS gateway fails');

  const failingOrderRes = await request(app)
    .put(`/api/admin/orders/${failingOrder.body.data.id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'CONFIRMED' });

  assert.strictEqual(failingOrderRes.status, 200, 'The admin action still succeeds when the SMS gateway fails');
  assert.ok(
    failingOrderRes.body.data.notifications.some((n) => n.ok === false),
    'The failed notification is recorded for investigation instead of being silently swallowed'
  );
  log('A dead SMS gateway never blocks checkout or admin operations');

  // ---------------------------------------------------------------------------
  // 4. Catalog pagination (ADR-014)
  // ---------------------------------------------------------------------------
  const pageOne = await request(app).get('/api/products?page=1&limit=2');
  assert.strictEqual(pageOne.status, 200, 'Paginated catalog request succeeds');
  assert.strictEqual(pageOne.body.data.length <= 2, true, 'Page size is respected');
  assert.ok(pageOne.body.meta.total >= pageOne.body.data.length, 'Metadata reports the full result count');
  assert.strictEqual(pageOne.body.meta.page, 1, 'Metadata reports the current page');
  assert.strictEqual(typeof pageOne.body.meta.hasMore, 'boolean', 'Metadata reports whether more pages exist');
  log('Catalog pagination returns items with correct metadata');

  const pageTwo = await request(app).get('/api/products?page=2&limit=2');
  if (pageOne.body.meta.hasMore) {
    assert.notStrictEqual(pageTwo.body.data[0]?.id, pageOne.body.data[0]?.id, 'Page 2 does not repeat page 1');
    log('Page 2 returns different products than page 1');
  }

  const capped = await request(app).get('/api/products?page=1&limit=9999');
  assert.ok(capped.body.meta.limit <= 60, 'Page size is capped so a client cannot request the entire catalog');
  log('Page size is capped (bounded response size)');

  // ---------------------------------------------------------------------------
  // 5. SEO endpoints (ADR-015)
  // ---------------------------------------------------------------------------
  const robots = await request(app).get('/robots.txt');
  assert.strictEqual(robots.status, 200, 'robots.txt is served');
  assert.ok(robots.text.includes('Sitemap:'), 'robots.txt points to the sitemap');
  assert.ok(robots.text.includes('Disallow: /api/'), 'robots.txt keeps the API out of the index');
  log('robots.txt served with sitemap reference and API disallow rule');

  const sitemap = await request(app).get('/sitemap.xml');
  assert.strictEqual(sitemap.status, 200, 'sitemap.xml is served');
  assert.ok(sitemap.text.includes('<urlset'), 'Sitemap is valid urlset XML');
  assert.ok(sitemap.text.includes(`/product/${encodeURIComponent(product.slug || product.id)}`), 'Sitemap lists product pages');
  log('sitemap.xml generated from live catalog data');

  const productPage = await request(app).get(`/product/${product.slug || product.id}`);
  assert.strictEqual(productPage.status, 200, 'The pre-rendered product page is served');
  assert.ok(productPage.text.includes(product.title), 'Product page contains the product title in server-rendered HTML');
  assert.ok(productPage.text.includes('application/ld+json'), 'Product page ships JSON-LD structured data');
  assert.ok(productPage.text.includes('"@type":"Product"'), 'JSON-LD describes a Product');
  assert.ok(productPage.text.includes('"@context":"https://schema.org"'), 'JSON-LD declares the schema.org context');
  assert.ok(productPage.text.includes('og:title'), 'Product page has Open Graph tags for social sharing');
  assert.ok(productPage.text.includes('"priceCurrency":"IRR"'), 'JSON-LD exposes price in the correct currency');
  assert.ok(productPage.text.includes('<noscript>'), 'Product page has a no-JS fallback for crawlers and text browsers');
  log('Product page pre-rendered with title, OpenGraph, JSON-LD price and noscript fallback');

  const missingProduct = await request(app).get('/product/definitely-not-a-real-slug');
  assert.strictEqual(missingProduct.status, 200, 'An unknown product slug falls back to the SPA shell (custom not-found view)');
  assert.ok(!missingProduct.text.includes('"@type":"Product"'), 'The fallback shell does not emit product structured data for an unknown slug');
  log('Unknown product slug degrades gracefully without emitting false structured data');

  // ---------------------------------------------------------------------------
  // 6. Image upload hardening (ADR-013)
  // ---------------------------------------------------------------------------
  const uploadTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manto-upload-'));
  const previousUploadDir = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = uploadTmp;

  try {
    // (a) non-admin is rejected
    const unauthUpload = await request(app)
      .post(`/api/admin/products/${product.id}/images`)
      .set('Authorization', `Bearer ${retailToken}`)
      .attach('image', Buffer.from('not an image'), 'evil.png');
    assert.strictEqual(unauthUpload.status, 403, 'Retail users cannot upload product images (RBAC enforced)');
    log('Image upload is admin-only');

    // (b) a text file renamed .png is rejected by content sniffing
    const fakeImage = await request(app)
      .post(`/api/admin/products/${product.id}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      // Explicitly claim an allowed MIME type: only real decoding can stop this.
      .attach('image', Buffer.from('<?php echo "pwned"; ?>'), { filename: 'payload.png', contentType: 'image/png' });
    assert.strictEqual(fakeImage.status, 415, 'A non-image payload with an image MIME type is rejected');
    assert.strictEqual(fakeImage.body.error, 'INVALID_IMAGE_CONTENT', 'Rejection is explicit about invalid image content');
    log('Spoofed image content rejected by real decoding (no polyglot uploads)');

    // (c) a real image is accepted, converted to webp and thumbnailed
    const { default: sharp } = await import('sharp');
    const realJpeg = await sharp({
      create: { width: 900, height: 1200, channels: 3, background: { r: 190, g: 110, b: 140 } }
    }).jpeg().toBuffer();

    const goodUpload = await request(app)
      .post(`/api/admin/products/${product.id}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', realJpeg, { filename: 'manto.jpg', contentType: 'image/jpeg' });

    assert.strictEqual(goodUpload.status, 201, 'A real image uploads successfully');
    assert.strictEqual(goodUpload.body.data.storedFormat, 'webp', 'Uploads are re-encoded to WebP (smaller files, EXIF stripped)');
    assert.ok(goodUpload.body.data.url.startsWith('/uploads/'), 'Stored file is served from the uploads path');
    assert.ok(fs.existsSync(path.join(uploadTmp, path.basename(goodUpload.body.data.url))), 'Gallery file exists on disk');
    assert.ok(fs.existsSync(path.join(uploadTmp, path.basename(goodUpload.body.data.thumbnailUrl))), 'Thumbnail was generated for catalog grids');

    const storedImages = db.findProductById(product.id).images;
    assert.ok(storedImages.includes(goodUpload.body.data.url), 'The product now references the uploaded image');

    // (d) deletion cleans up both files
    const deleteRes = await request(app)
      .delete(`/api/admin/products/${product.id}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: goodUpload.body.data.url });

    assert.strictEqual(deleteRes.status, 200, 'An uploaded image can be removed');
    assert.ok(!fs.existsSync(path.join(uploadTmp, path.basename(goodUpload.body.data.url))), 'Removing an image deletes the file from disk');

    const traversalAttempt = await request(app)
      .delete(`/api/admin/products/${product.id}/images`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: '/uploads/../../../etc/passwd' });

    assert.ok(
      traversalAttempt.status === 400 || traversalAttempt.status === 404,
      'Path traversal in an image URL is refused'
    );
    log('Image upload: RBAC, content sniffing, WebP conversion, thumbnails and safe deletion all verified');
  } finally {
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
    fs.rmSync(uploadTmp, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------------------
  // 7. Persistence wiring (ADR-010) — snapshot contains the live collections
  // ---------------------------------------------------------------------------
  const snapshot = db.snapshot();
  assert.ok(Array.isArray(snapshot.orders) && Array.isArray(snapshot.products), 'The persistence snapshot exposes the core collections');
  assert.ok(snapshot.orders.length >= 2, 'Orders created during this suite are part of the snapshot that gets written to disk');

  const persistence = db.persistenceInfo();
  assert.strictEqual(persistence.enabled, false, 'Persistence is disabled inside the test environment so suites stay hermetic');
  log('Persistence is wired and correctly disabled under test');

  // ---------------------------------------------------------------------------
  // 8. Whole-order price integrity over HTTP (ADR-003 + ADR-008)
  // ---------------------------------------------------------------------------
  const tamperedCheckout = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${wholesaleToken}`)
    .send({
      items: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
      shippingAddress: { recipientName: 'کاربر تست', phone: '09120000002', province: 'تهران', city: 'تهران', fullAddress: 'خیابان تست پلاک ۴۰' },
      payableAmount: 1000,
      totalAmount: 1000,
      userId: 'usr-admin-01'
    });

  if (tamperedCheckout.status === 201) {
    assert.notStrictEqual(tamperedCheckout.body.data.payableAmount, 1000, 'Server-calculated amount overrides the client-supplied value');
    assert.notStrictEqual(tamperedCheckout.body.data.userId, 'usr-admin-01', 'Client-supplied identity is ignored; the JWT subject is used');
    log('Client-supplied price and identity are discarded over real HTTP');
  } else {
    assert.strictEqual(tamperedCheckout.status, 409, 'Or the tampered request is refused outright (out of stock)');
    log('Tampered checkout refused by the inventory guard');
  }

  log('Operations suite complete');
}
