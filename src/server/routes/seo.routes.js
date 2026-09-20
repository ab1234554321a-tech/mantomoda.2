// =============================================================================
//  SEO Routes (ADR-015)
//  robots.txt, sitemap.xml and the pre-rendered product page.
//
//  Why pre-rendering instead of a full SSR rewrite: the storefront is a Vanilla
//  JS SPA, so search engines see an empty shell for every product. Pre-rendering
//  /product/:slug server-side injects real title/description/OpenGraph/JSON-LD
//  (plus a <noscript> body) into the existing shell, which is what both Google
//  and social link previews actually need. It costs one HTML file, not a
//  framework migration — a Next.js move (TD-005) stays optional.
// =============================================================================
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/store.js';
import { pageList } from './pages.routes.js';
import { publicPath } from '../paths.js';

const router = Router();

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Absolute site origin, used for canonical URLs and the sitemap. */
export function siteUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.PAYMENT_CALLBACK_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function tomanToRial(toman) {
  return Math.round(Number(toman) || 0) * 10;
}

function stripHtmlTagsForMeta(text = '', max = 300) {
  const clean = String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------
router.get('/robots.txt', (req, res) => {
  const base = siteUrl(req);
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /uploads/private/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    ''
  ].join('\n');

  res.type('text/plain').send(body);
});

// ---------------------------------------------------------------------------
// sitemap.xml — built from live data, so a new product is discoverable at once
// ---------------------------------------------------------------------------
router.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  const now = new Date().toISOString().slice(0, 10);

  const products = db.listProducts().filter((p) => p.isActive);
  const categories = db.listCategories();

  const urls = [
    { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
    { loc: `${base}/?view=wholesale`, priority: '0.8', changefreq: 'weekly' },
    ...categories.map((c) => ({
      loc: `${base}/?category=${encodeURIComponent(c.id)}`,
      priority: '0.7',
      changefreq: 'weekly'
    })),
    ...products.map((p) => ({
      loc: `${base}/product/${encodeURIComponent(p.slug || p.id)}`,
      priority: '0.9',
      changefreq: 'weekly'
    }))
  ];
  // The editorial pages are part of the public site, so they belong in the
  // sitemap for the same reason the products do (ADR-025).
  for (const page of pageList()) {
    urls.push({ loc: `${siteUrl(req)}${page.url}`, changefreq: 'monthly', priority: '0.4' });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  res.type('application/xml').send(body);
});

/**
 * Tags in the static shell that describe the *storefront* (generic title,
 * description, canonical "/", OpenGraph/Twitter titles). On a product page they
 * must be replaced, not duplicated: two conflicting og:title tags make social
 * previews unpredictable.
 */
const OVERRIDDEN_SHELL_TAGS = [
  /<meta\s+name="description"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
  /<meta\s+property="og:(?:title|description|url|type)"[^>]*>\s*/gi,
  /<meta\s+name="twitter:(?:title|description)"[^>]*>\s*/gi
];

function stripOverriddenShellTags(html) {
  return OVERRIDDEN_SHELL_TAGS.reduce((acc, pattern) => acc.replace(pattern, ''), html);
}

// ---------------------------------------------------------------------------
// Pre-rendered product page: /product/:slug
// ---------------------------------------------------------------------------
router.get('/product/:slug', (req, res, next) => {
  const product = db.findProductById(req.params.slug);

  if (!product || !product.isActive) {
    return next(); // fall through to the SPA, which shows a "not found" state
  }

  const base = siteUrl(req);
  const canonical = `${base}/product/${encodeURIComponent(product.slug || product.id)}`;
  const title = `${product.title} | مانتو مدا`;
  const description = stripHtmlTagsForMeta(
    product.description ||
      `${product.title} از جنس ${product.material || 'پارچه درجه یک'} — خرید آنلاین با ارسال سریع از مانتو مدا.`
  );
  const image = product.images?.[0] || '';

  // schema.org Product: this is what puts price/availability into Google results
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description,
    sku: product.sku,
    brand: { '@type': 'Brand', name: 'مانتو مدا' },
    category: product.category,
    material: product.material,
    ...(image ? { image: [image] } : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'IRR',
      price: tomanToRial(product.retailPrice),
      availability: (product.variants || []).some((v) => Number(v.stock) > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };

  const head = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="product">
    <meta property="og:site_name" content="مانتو مدا">
    <meta property="og:title" content="${escapeHtml(product.title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(product.title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ''}
    <meta property="product:price:amount" content="${product.retailPrice}">
    <meta property="product:price:currency" content="IRR">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

  const noscript = `
    <noscript>
      <div style="padding:24px;font-family:Tahoma,sans-serif;direction:rtl">
        <h1>${escapeHtml(product.title)}</h1>
        <p>${escapeHtml(description)}</p>
        <p>جنس: ${escapeHtml(product.material || '')} — دسته: ${escapeHtml(product.category || '')}</p>
        <p>قیمت: ${Number(product.retailPrice).toLocaleString('fa-IR')} تومان</p>
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}">` : ''}
        <p><a href="/">مشاهده کاتالوگ کامل مانتو مدا</a></p>
      </div>
    </noscript>`;

  let html;
  try {
    html = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8');
  } catch (error) {
    return next(error);
  }

  // Inject head metadata + noscript content into the static shell.
  html = stripOverriddenShellTags(html);
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace('</head>', `${head}\n</head>`)
    .replace('<!-- SEO_MAIN_ANCHOR -->', noscript);

  res.type('text/html').send(html);
});

export default router;
