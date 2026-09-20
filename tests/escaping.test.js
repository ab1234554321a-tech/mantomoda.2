import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { db } from '../src/server/db/store.js';

/**
 * Output-encoding tests (ADR-022).
 *
 * The back-office panel renders text that customers typed: the wholesale
 * application form is customer input, the product copy is admin input, and the
 * order list mixes both. If any of it reaches innerHTML unencoded then a
 * crafted company name becomes script running in the admin's browser while her
 * session is open — which is a data-leak, not a cosmetic bug.
 *
 * Two layers are checked here:
 *   1. behaviour  — the encoder really neutralises markup/attribute breakouts
 *   2. wiring     — every risky interpolation in app.js actually calls it
 * The wiring check is the regression guard: a future edit that adds
 * `${app.companyName}` back without the encoder fails this suite.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();

/** The payload a hostile customer would type into a free-text field. */
const PAYLOAD = '<img src=x onerror="alert(1)">';
const ESCAPED_PAYLOAD = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;';
const CLIENT_APP = path.join(here, '..', 'src', 'client', 'public', 'app.js');

/** Pull the real encoder out of the shipped client bundle. */
function loadEncoders() {
  const src = fs.readFileSync(CLIENT_APP, 'utf8');
  const pick = (name) => {
    const start = src.indexOf(`function ${name}(`);
    assert.notStrictEqual(start, -1, `${name}() must exist in app.js`);
    const end = src.indexOf('\n}', start);
    assert.notStrictEqual(end, -1, `${name}() must be complete`);
    return src.slice(start, end + 2);
  };
  const body = `${pick('escapeAttr')}\n${pick('escapeHtml')}\nreturn { escapeAttr, escapeHtml };`;
  return new Function(body)();
}

/**
 * Expressions that carry text typed by a human (customer or admin) and are
 * interpolated into the browser's HTML. Each must be wrapped.
 */
const RISKY_INTERPOLATIONS = [
  // storefront product card + detail modal (admin-entered copy)
  'product.title',
  'product.material',
  'product.category',
  'product.sku',
  'product.season',
  'p.title',
  'p.material',
  'p.description',
  'p.category',
  'p.sku',
  'v.color',
  'v.size',
  // customer's own order view
  'order.shippingAddress?.city',
  'order.shippingAddress?.fullAddress',
  // wholesale status card shown to the customer
  'app.companyName',
  'app.adminNotes',
  // back-office: wholesale applications (CUSTOMER-supplied → admin's browser)
  'app.userFullName',
  'app.city',
  'app.businessPhone',
  'app.economicCode',
  'app.businessAddress',
  // back-office: order list (customer name/email + admin product titles)
  'order.userFullName',
  'order.userEmail',
  'i.productTitle',
  // toasts relay server messages that quote product names
  'message'
];

export async function runEscapingTests() {
  console.log('\n🧼 Running Output-Encoding / Back-Office XSS Tests (ADR-022)...');

  const { escapeAttr, escapeHtml } = loadEncoders();

  // --- Layer 1: the encoder itself -------------------------------------
  const hostile = [
    '<img src=x onerror=alert(1)>',
    '<script>fetch("/api/admin/orders/export.csv")</script>',
    '" onmouseover="alert(1)',
    "' onfocus='alert(1)",
    '</textarea><svg onload=alert(1)>',
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  ];
  for (const payload of hostile) {
    const encoded = escapeHtml(payload);
    assert.ok(!/[<>"']/.test(encoded), `escapeHtml must remove markup and quotes: ${payload} → ${encoded}`);
    assert.ok(!encoded.includes('<img'), 'no raw tag may survive encoding');
    // The common back-office breakout attempt: closing the surrounding tag.
    assert.ok(!encoded.includes('</'), 'no closing tag may survive encoding');
  }
  assert.strictEqual(escapeHtml("شرکت «پوشاک» & دوستان"), 'شرکت «پوشاک» &amp; دوستان',
    'Persian text and guillemets must pass through untouched (only & is encoded)');
  assert.strictEqual(escapeHtml(''), '', 'empty string stays empty');
  assert.strictEqual(escapeAttr(undefined), '', 'undefined must not print "undefined"');
  assert.strictEqual(escapeHtml('<b>رنگ</b>'), '&lt;b&gt;رنگ&lt;/b&gt;', 'tags are shown as text, not applied');
  console.log('  ✔ Passed: markup, quote-breakouts and entity payloads are neutralised.');

  // --- Layer 2: wiring in the shipped client ---------------------------
  const src = fs.readFileSync(CLIENT_APP, 'utf8');
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let wrapped = 0;
  const unescaped = [];

  for (const expr of RISKY_INTERPOLATIONS) {
    // A bare `${expr}` is the vulnerable form; `${escapeHtml(expr)}` is not a
    // match for this pattern because the encoder name sits in between.
    const bare = new RegExp('\\$\\{' + escapeRegex(expr) + '\\}', 'g');
    let match;
    while ((match = bare.exec(src)) !== null) {
      const line = src.slice(0, match.index).split('\n').length;
      const lineEnd = src.indexOf('\n', match.index);
      const lineText = src.slice(src.lastIndexOf('\n', match.index) + 1, lineEnd === -1 ? undefined : lineEnd);
      // Two sinks are safe by construction and must not be double-encoded:
      //   * textContent/value/innerText assign the string as text, never as markup
      //   * showToast() is the single toast sink and encodes its message once
      const assignedAsText = /\.(?:textContent|value|innerText)\s*=\s*`/.test(lineText);
      const toastOpen = src.lastIndexOf('showToast(', match.index);
      const insideToastCall = toastOpen !== -1 && !src.slice(toastOpen, match.index).includes(')');
      if (assignedAsText || insideToastCall) continue;
      unescaped.push(`app.js:${line} → \${${expr}}`);
    }
    // Prefix match: the encoder must wrap an expression *rooted at* this field,
    // so `${escapeHtml(app.adminNotes || '…')}` counts as encoded.
    const encoded = new RegExp(
      '\\$\\{(?:escapeHtml|escapeAttr)\\(' + escapeRegex(expr) + '(?![\\w$.])', 'g');
    const encodedCount = (src.match(encoded) || []).length;
    assert.ok(encodedCount > 0,
      `expected ${expr} to be rendered through an encoder somewhere (did the UI get renamed?)`);
    wrapped += encodedCount;
  }

  assert.deepStrictEqual(unescaped, [],
    `these interpolations render human-entered text without encoding:\n    ${unescaped.join('\n    ')}`);
  console.log(`  ✔ Passed: all ${wrapped} human-entered interpolations in app.js are encoded.`);

  // The specific back-office paths that were exploitable before ADR-022.
  const adminWholesaleBlock = src.slice(src.indexOf('async function loadAdminWholesale'), src.indexOf('async function reviewWholesaleApp'));
  assert.ok(adminWholesaleBlock.includes('escapeHtml(app.companyName)'),
    'admin wholesale list must encode the customer-supplied company name');
  assert.ok(adminWholesaleBlock.includes('escapeHtml(app.businessAddress)'),
    'admin wholesale list must encode the customer-supplied address');
  const adminOrdersBlock = src.slice(src.indexOf('async function loadAdminOrders'), src.indexOf('function applyOrderFilters'));
  assert.ok(adminOrdersBlock.includes('escapeHtml(order.userFullName)'),
    'admin order list must encode the customer name');
  console.log('  ✔ Passed: back-office customer-data paths are encoded (was: stored XSS).');

  // --- Layer 3: the pages the SERVER renders, tested on real responses ---
  // Source greps are too weak here (they flag harmless intermediate variables),
  // so this drives the actual HTTP stack with hostile input and inspects the
  // HTML that leaves the server.
  const adminToken = (await request(app).post('/api/auth/switch-role').send({ targetRole: 'ADMIN' })).body.data.token;
  const retailToken = (await request(app).post('/api/auth/switch-role').send({ targetRole: 'REGULAR' })).body.data.token;
  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  // (a) Admin types a hostile product title → the pre-rendered public page must
  //     show it as text, never as a tag.
  const created = await request(app)
    .post('/api/admin/products')
    .set(auth(adminToken))
    .send({
      title: `مانتو تست ${PAYLOAD}`,
      category: 'مانتو کتی و اداری',
      retailPrice: 990000,
      material: 'کرپ',
      description: `توضیح ${PAYLOAD}`,
      variants: [{ color: 'مشکی', size: '38', stock: 3 }]
    });
  assert.strictEqual(created.status, 201, 'The hostile product is created so the render path can be probed');
  const toxicProduct = created.body.data;

  const page = await request(app).get(`/product/${encodeURIComponent(toxicProduct.slug || toxicProduct.id)}`);
  assert.strictEqual(page.status, 200, 'The pre-rendered product page is served');
  assert.ok(!page.text.includes(PAYLOAD), 'the raw payload must never appear in served HTML');
  assert.ok(page.text.includes('&lt;img src=x onerror='), 'the payload is served in its escaped form');

  await request(app).delete(`/api/admin/products/${toxicProduct.id}`).set(auth(adminToken));
  console.log('  ✔ Passed: pre-rendered product page encodes admin-entered copy.');

  // (b) Customer types a hostile delivery address → the invoice page must not
  //     execute it in the browser that opens the link (the customer's mail, or
  //     the shop's own support machine).
  const sellable = db.products.find((p) => !p.isArchived && p.variants.some((v) => Number(v.stock) > 0));
  assert.ok(sellable, 'a sellable product must exist to place the probe order');
  const variant = sellable.variants.find((v) => Number(v.stock) > 0);

  const orderRes = await request(app)
    .post('/api/orders')
    .set(auth(retailToken))
    .send({
      items: [{ productId: sellable.id, variantId: variant.id, quantity: 1 }],
      shippingAddress: {
        recipientName: `سارا ${PAYLOAD}`,
        phone: '09121112233',
        province: 'تهران',
        city: 'تهران',
        fullAddress: `خیابان ولیعصر ${PAYLOAD} پلاک ۱`
      },
      paymentMethod: 'ONLINE_GATEWAY'
    });
  assert.strictEqual(orderRes.status, 201, 'The probe order is accepted');
  const probeOrder = orderRes.body.data;

  const link = await request(app).get(`/api/orders/${probeOrder.id}/invoice-link`).set(auth(retailToken));
  assert.strictEqual(link.status, 200, 'The customer can mint their own invoice link');
  const invoicePage = await request(app).get(link.body.data.url);
  assert.strictEqual(invoicePage.status, 200, 'The printable invoice renders');
  assert.ok(invoicePage.text.includes('فاکتور فروش'), 'it is the invoice, not the SPA shell');
  assert.ok(!invoicePage.text.includes(PAYLOAD), 'the raw address payload must never reach the invoice HTML');
  assert.ok(invoicePage.text.includes('&lt;img src=x onerror='), 'the address is printed as escaped text');
  console.log('  ✔ Passed: invoice page encodes customer-entered identity and address.');
}
