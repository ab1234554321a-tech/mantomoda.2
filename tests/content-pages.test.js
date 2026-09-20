import assert from 'assert';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { db } from '../src/server/db/store.js';
import { PAGES, PAGE_SLUGS } from '../src/server/content/pages.js';
import { siteUrl } from '../src/server/routes/seo.routes.js';

/**
 * Level 12 — the editorial pages (ADR-025).
 *
 * These are not decoration: an Iranian payment gateway will not approve a shop
 * that does not publish its return rules, its terms and a way to contact it, and
 * a customer deciding whether to trust an unknown storefront reads exactly these
 * pages. They also used to be dead text in the footer, so the tests check the
 * content, the linking and the machine-readable side.
 */

const app = createApp();

export async function runContentPageTests() {
  console.log('\n📄 Running Editorial Page Tests — terms, returns, privacy, sizing, contact (Level 12)...');

  // --- 1. Every page exists, renders standalone and carries its metadata ---
  for (const slug of PAGE_SLUGS) {
    const res = await request(app).get(`/page/${slug}`);
    assert.strictEqual(res.status, 200, `/page/${slug} must render`);
    assert.match(res.headers['content-type'], /text\/html/, 'served as HTML');

    const page = PAGES[slug];
    assert.ok(res.text.includes(page.title), 'the page shows its own title');
    assert.ok(res.text.includes(`<title>${page.title}`), 'and puts it in the document title (SEO)');
    assert.ok(res.text.includes(`content="${page.summary}"`), 'and in the meta description');
    assert.ok(res.text.includes(`/page/${slug}"`), 'with a canonical URL');
    assert.ok(res.text.includes('dir="rtl"') && res.text.includes('lang="fa"'), 'RTL Persian document');
    assert.ok(res.text.includes('name="viewport"'), 'mobile viewport (the shop is mobile-first)');
    console.log(`  ✔ Passed: /page/${slug} renders with title, description, canonical and RTL markup.`);
  }

  // --- 2. The content is real, not a stub ---
  const wordCount = (slug) => JSON.stringify(PAGES[slug]).split(/\s+/).length;
  for (const slug of PAGE_SLUGS) {
    assert.ok(wordCount(slug) > 60, `/page/${slug} must carry real content, not a placeholder`);
  }
  assert.ok(PAGES.returns.sections.some((s) => /۷ روز|7 روز/.test(JSON.stringify(s))),
    'the return window must be stated explicitly (customers and gateways both look for it)');
  assert.ok(PAGES.terms.sections.some((s) => /۶.?۴|۶|بازگشت/.test(JSON.stringify(s))),
    'terms must cover what happens with money');
  console.log('  ✔ Passed: each page states the rules a customer (and a gateway reviewer) looks for.');

  // --- 3. Contact details come from the shop settings, not a second copy ---
  const support = db.settings.shop.supportPhone;
  const address = db.settings.shop.address;
  db.settings.shop.supportPhone = '02112345678';
  db.settings.shop.address = 'تهران، خیابان ولیعصر، پلاک ۱';
  try {
    const contact = await request(app).get('/page/contact');
    assert.ok(contact.text.includes('02112345678'),
      'the contact page shows the phone number configured in the panel');
    assert.ok(contact.text.includes('تهران، خیابان ولیعصر، پلاک ۱'),
      'and the address the invoice also prints — one source of truth (ADR-017)');
  } finally {
    db.settings.shop.supportPhone = support;
    db.settings.shop.address = address;
  }
  console.log('  ✔ Passed: contact details follow the shop settings (no second copy to forget to update).');

  // --- 4. They are reachable the way a customer (or a crawler) arrives ---
  const home = await request(app).get('/');
  assert.strictEqual(home.status, 200, 'the shell still serves');
  const shell = home.text;
  for (const slug of PAGE_SLUGS) {
    assert.ok(shell.includes(`href="/page/${slug}"`),
      `the storefront footer must link to /page/${slug} — an unreachable page protects nobody`);
  }
  console.log('  ✔ Passed: every page is linked from the storefront footer.');

  const sitemap = await request(app).get('/sitemap.xml');
  assert.strictEqual(sitemap.status, 200, 'the sitemap still serves');
  for (const slug of PAGE_SLUGS) {
    assert.ok(sitemap.text.includes(`/page/${slug}`), `the sitemap lists /page/${slug}`);
  }
  console.log('  ✔ Passed: the sitemap lists all of them, so search engines index the rules too.');

  // --- 5. Unknown slugs answer honestly ---
  const missing = await request(app).get('/page/does-not-exist');
  assert.strictEqual(missing.status, 404, 'an unknown editorial page is a 404, not a blank SPA shell');
  console.log('  ✔ Passed: unknown page slugs return 404 instead of a misleading empty page.');

  // --- 6. Nothing unescaped leaks into these pages -------------------------
  const shopName = db.settings.shop.name;
  db.settings.shop.name = '<script>alert(1)</script>';
  try {
    const res = await request(app).get('/page/terms');
    assert.ok(!res.text.includes('<script>alert(1)</script>'),
      'the shop name is encoded in the page (same rule as ADR-022)');
  } finally {
    db.settings.shop.name = shopName;
  }
  console.log('  ✔ Passed: page text is encoded — the ADR-022 rule holds for the new surface too.');

  // --- 7. The canonical host is the configured public site -----------------
  const configured = process.env.PUBLIC_SITE_URL;
  process.env.PUBLIC_SITE_URL = 'https://manto.example.ir';
  try {
    const res = await request(app).get('/page/terms');
    assert.ok(res.text.includes('https://manto.example.ir/page/terms'),
      'canonical URLs follow PUBLIC_SITE_URL, so links do not point at a staging host');
  } finally {
    if (configured === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = configured;
  }
  assert.strictEqual(typeof siteUrl({ protocol: 'http', get: () => 'x' }), 'string',
    'siteUrl still resolves a host from the request when nothing is configured');
  console.log('  ✔ Passed: canonical URLs follow the configured public site.');
}
