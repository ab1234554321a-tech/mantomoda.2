import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/store.js';
import { PAGES, PAGE_SLUGS } from '../content/pages.js';
import { siteUrl } from './seo.routes.js';
import { publicPath } from '../paths.js';

/**
 * Editorial pages: terms, returns, privacy, sizing and contact (ADR-025).
 *
 * They are server-rendered rather than part of the SPA for three reasons:
 *  1. a payment gateway reviewer (and a customer deciding whether to trust the
 *     shop) reads them without JavaScript;
 *  2. they need their own title/description for search engines, which is exactly
 *     what the pre-rendered product page already does;
 *  3. the content is static — no state, no API, nothing that benefits from
 *     being a client-side view.
 *
 * The contact page mixes editorial text with live shop settings, so the phone
 * number published here is the same one printed on the invoice (ADR-017).
 */
const router = Router();

/** The confirmation marker is internal bookkeeping and never reaches a customer. */
function stripOwnerMarkers(text) {
  return String(text).replace(/^TODO-OWNER\s*/, '');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function contactBlock() {
  const shop = db.settings?.shop || {};
  const rows = [
    ['نام فروشگاه', shop.name],
    ['تلفن پشتیبانی', shop.supportPhone],
    ['نشانی', shop.address],
    ['شناسه/کد اقتصادی', shop.taxId]
  ].filter(([, value]) => value);

  if (!rows.length) return '';
  return `
    <table class="info">
      <tbody>
        ${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}
      </tbody>
    </table>`;
}

function tableBlock(table) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${table.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderPage(page, req) {
  const canonical = `${siteUrl(req)}/page/${page.slug}`;
  const body = page.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${(section.body || []).map((p) => `<p>${escapeHtml(stripOwnerMarkers(p))}</p>`).join('')}
      ${section.table ? tableBlock(section.table) : ''}
      ${section.dynamic === 'contact' ? contactBlock() : ''}
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} — ${escapeHtml(db.settings?.shop?.name || 'مانتو مدا')}</title>
  <meta name="description" content="${escapeHtml(page.summary)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.summary)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0 16px 64px;
      font-family: Vazirmatn, Tahoma, "Segoe UI", system-ui, sans-serif;
      background: #f8fafc; color: #0f172a; line-height: 2;
    }
    .wrap { max-width: 760px; margin: 0 auto; }
    header { padding: 28px 0 8px; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
    .brand span { font-weight: 900; font-size: 20px; }
    .logo { width: 34px; height: 34px; border-radius: 12px; background: #a1387f; color: #fff;
            display: grid; place-items: center; font-weight: 900; }
    h1 { font-size: 24px; margin: 22px 0 6px; }
    .lead { color: #475569; margin: 0 0 26px; font-size: 15px; }
    section { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 20px 22px; margin-bottom: 16px; }
    h2 { font-size: 16px; margin: 0 0 10px; }
    p { margin: 0 0 10px; font-size: 14px; color: #334155; }
    p:last-child { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; }
    thead th { background: #f1f5f9; }
    .info th { width: 40%; color: #475569; font-weight: 700; }
    .table-wrap { overflow-x: auto; margin-top: 8px; }
    footer { margin-top: 28px; font-size: 13px; color: #64748b; display: flex; flex-wrap: wrap; gap: 12px; }
    a { color: #a1387f; }
    .back { display: inline-block; margin-top: 8px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <a class="brand" href="/"><span class="logo">M</span><span>${escapeHtml(db.settings?.shop?.name || 'مانتو مدا')}</span></a>
    </header>
    <main>
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.summary)}</p>
      ${body}
    </main>
    <footer>
      ${PAGE_SLUGS.filter((slug) => slug !== page.slug)
        .map((slug) => `<a href="/page/${slug}">${escapeHtml(PAGES[slug].title)}</a>`).join('')}
      <a href="/">بازگشت به فروشگاه</a>
    </footer>
  </div>
</body>
</html>`;
}

/** The public list, so the sitemap and the footer stay in step with the content. */
export function pageList() {
  return PAGE_SLUGS.map((slug) => ({
    slug,
    title: PAGES[slug].title,
    summary: PAGES[slug].summary,
    url: `/page/${slug}`
  }));
}

router.get('/page/:slug', (req, res) => {
  const page = PAGES[req.params.slug];
  if (!page) {
    // Fall back to the SPA shell for unknown paths — but a wrong editorial URL
    // should say so rather than pretend to exist.
    return res.status(404).send(`<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
      <title>صفحه یافت نشد — مانتو مدا</title></head>
      <body style="font-family:Tahoma,sans-serif;padding:48px;text-align:center">
        <h1 style="font-size:20px">این صفحه پیدا نشد</h1>
        <p><a href="/">بازگشت به فروشگاه</a></p>
      </body></html>`);
  }
  res.type('html').send(renderPage(page, req));
});

export default router;
