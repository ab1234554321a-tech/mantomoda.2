// =============================================================================
//  Product catalog service (ADR-018 / Phase 10)
//
//  Responsibilities:
//    1. Validate what an admin submits (the previous check was "has a title and
//       a price" — so a negative price, a text stock or a duplicate SKU could be
//       stored and would then corrupt pricing and inventory).
//    2. Normalise it into the shape the store keeps (toman as integers, trimmed
//       strings, generated slug/SKU, bounded variant list).
//    3. Guarantee identifier uniqueness, because the slug ends up in a public URL
//       (ADR-015) and the SKU ends up in the warehouse.
// =============================================================================
import { z } from 'zod';
import { db } from '../../db/store.js';

const MAX_VARIANTS = 40;
const MAX_IMAGES = 8;

const price = (label) =>
  z.coerce.number({ invalid_type_error: `${label} باید عدد باشد` })
    .int(`${label} باید عدد صحیح (تومان) باشد`)
    .positive(`${label} باید بزرگ‌تر از صفر باشد`)
    .max(5_000_000_000, `${label} غیرواقعی است`);

export const variantSchema = z.object({
  id: z.string().max(60).optional(),
  color: z.string().min(1, 'رنگ تنوع کالا الزامی است').max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'کد رنگ باید مانند #000000 باشد').optional(),
  size: z.string().min(1, 'سایز تنوع کالا الزامی است').max(20),
  stock: z.coerce.number({ invalid_type_error: 'موجودی باید عدد باشد' })
    .int('موجودی باید عدد صحیح باشد')
    .min(0, 'موجودی نمی‌تواند منفی باشد')
    .max(100000, 'موجودی غیرواقعی است')
});

export const productCreateSchema = z.object({
  title: z.string().min(3, 'عنوان محصول باید حداقل ۳ کاراکتر باشد').max(150),
  slug: z.string().max(120).regex(/^[^/?#\s]+$/, 'اسلاگ نمی‌تواند فاصله یا کاراکترهای / ? # داشته باشد').optional(),
  sku: z.string().max(60).optional(),
  category: z.string().min(2, 'دسته‌بندی الزامی است').max(60),
  categoryId: z.string().max(60).optional(),
  material: z.string().max(120).optional().default(''),
  season: z.string().max(40).optional().default('چهار فصل'),
  description: z.string().max(3000, 'توضیحات بیش از حد طولانی است').optional().default(''),
  retailPrice: price('قیمت خرده‌فروشی'),
  wholesalePrice: price('قیمت عمده‌فروشی').optional(),
  wholesaleMinQuantity: z.coerce.number().int().min(1, 'حداقل تعداد عمده باید ۱ یا بیشتر باشد').max(1000).optional().default(6),
  isFeatured: z.coerce.boolean().optional().default(false),
  images: z.array(
    z.string().max(500).refine(
      (value) => value.startsWith('/uploads/') || /^https?:\/\//.test(value),
      'آدرس تصویر باید با /uploads/ یا http(s):// شروع شود'
    )
  ).max(MAX_IMAGES, `حداکثر ${MAX_IMAGES} تصویر برای هر محصول`).optional().default([]),
  variants: z.array(variantSchema).max(MAX_VARIANTS, `حداکثر ${MAX_VARIANTS} تنوع کالا`).optional().default([])
});

// Update = every field optional, but the same rules apply to whatever is sent.
export const productUpdateSchema = productCreateSchema.partial();

/** Slug-safe: keeps Persian/Arabic letters and digits so URLs stay readable. */
export function slugify(input = '') {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[\u200c\u200f\u200e]/g, '')            // zero-width joiners
    .replace(/[\s_]+/g, '-')
    .replace(/[^0-9a-z\u0600-\u06FF-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `product-${Date.now().toString(36)}`;
}

export function uniqueSlug(base, { excludeId = null } = {}) {
  const taken = new Set(
    db.products.filter(p => p.id !== excludeId).map(p => p.slug).filter(Boolean)
  );
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

export function uniqueSku(base, { excludeId = null } = {}) {
  const taken = new Set(
    db.products.filter(p => p.id !== excludeId).flatMap(p => [p.sku, ...(p.variants || []).map(v => v.sku)]).filter(Boolean)
  );
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

/**
 * Warehouse-friendly SKU: Latin letters, digits and dashes only.
 *
 * Persian titles are transliterated through a small map (enough for the words
 * that actually appear in product names here); anything unmapped is dropped, and
 * a title that leaves nothing usable falls back to a short stable code derived
 * from the title itself, so the same product always gets the same SKU.
 */
const TRANSLITERATION = {
  'مانتو': 'manto', 'کت': 'kot', 'کتی': 'koti', 'ترنچ': 'trench', 'کتان': 'kerman',
  'لینن': 'linen', 'جیر': 'jir', 'کرپ': 'crepe', 'حریر': 'harir', 'مخمل': 'makhmal',
  'کژوال': 'casual', 'اسپرت': 'sport', 'اداری': 'office', 'شب': 'night', 'مجلسی': 'formal',
  'بهاره': 'spring', 'تابستانه': 'summer', 'پاییزه': 'autumn', 'زمستانه': 'winter',
  'بلند': 'long', 'کوتاه': 'short', 'دبل‌برست': 'db', 'یقه': 'collar', 'انگلیسی': 'eng',
  'دکمه': 'button', 'کمربند': 'belt', 'طرح': 'design', 'راه': 'stripe', 'راه‌راه': 'stripe',
  'مشکی': 'black', 'سفید': 'white', 'کرم': 'cream', 'نود': 'nude', 'زغالی': 'charcoal',
  'سبز': 'green', 'آبی': 'blue', 'قرمز': 'red', 'صورتی': 'pink', 'بنفش': 'purple',
  'زرد': 'yellow', 'قهوه‌ای': 'brown', 'طوسی': 'grey', 'ژاکارد': 'jacquard'
};

function transliterate(text) {
  let out = String(text);
  for (const [fa, en] of Object.entries(TRANSLITERATION)) {
    out = out.split(fa).join(` ${en} `);
  }
  return out.replace(/[\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stableCode(text) {
  // Deterministic: the same title always yields the same code (no random noise).
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.codePointAt(0)) % 1679616; // 36^4
  return hash.toString(36).padStart(4, '0').toUpperCase();
}

function buildSkuFromTitle(category, title) {
  const categoryPart = (db.categories.find(c => c.name === category)?.id || 'GEN')
    .replace(/^cat-/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'GEN';

  const latinPart = transliterate(title)
    .replace(/[^0-9A-Za-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.toUpperCase())
    .join('-')
    .slice(0, 18);

  const titlePart = latinPart || stableCode(title);
  return `MM-${categoryPart}-${titlePart}`.replace(/-+/g, '-').replace(/-$/, '');
}

/** Fills in defaults and normalises variant identifiers/SKUs. */
export function normalizeProductInput(input, { existing = null } = {}) {
  const normalized = { ...input };

  normalized.title = String(normalized.title).trim();
  normalized.slug = normalized.slug
    ? uniqueSlug(slugify(normalized.slug), { excludeId: existing?.id })
    : uniqueSlug(slugify(normalized.title), { excludeId: existing?.id });

  normalized.sku = uniqueSku(
    (normalized.sku || existing?.sku || buildSkuFromTitle(normalized.category, normalized.title)).trim(),
    { excludeId: existing?.id }
  );

  normalized.material = String(normalized.material || '').trim();
  normalized.season = String(normalized.season || 'چهار فصل').trim();
  normalized.description = String(normalized.description || '').trim();

  normalized.retailPrice = Math.round(Number(normalized.retailPrice));
  normalized.wholesalePrice = normalized.wholesalePrice ? Math.round(Number(normalized.wholesalePrice)) : 0;
  if (normalized.wholesalePrice > 0 && normalized.wholesalePrice >= normalized.retailPrice) {
    // Not fatal, but almost always a data-entry mistake worth stopping.
    throw Object.assign(
      new Error('قیمت عمده‌فروشی باید کمتر از قیمت خرده‌فروشی باشد.'),
      { code: 'WHOLESALE_PRICE_NOT_LOWER' }
    );
  }

  const variants = (normalized.variants || []).map((variant, index) => ({
    id: variant.id || `var-${Date.now().toString(36)}-${index + 1}`,
    color: String(variant.color).trim(),
    colorHex: variant.colorHex || '#000000',
    size: String(variant.size).trim(),
    stock: Math.floor(Number(variant.stock)),
    sku: variant.sku || `${normalized.sku}-${String(variant.color).trim().slice(0, 3)}-${variant.size}`
  }));

  if (variants.length === 0) {
    throw Object.assign(
      new Error('حداقل یک تنوع کالا (رنگ و سایز) با موجودی لازم است.'),
      { code: 'NO_VARIANTS' }
    );
  }

  const duplicate = variants.find((variant, index) =>
    variants.findIndex(other => other.color === variant.color && other.size === variant.size) !== index
  );
  if (duplicate) {
    throw Object.assign(
      new Error(`تنوع تکراری «${duplicate.color} / ${duplicate.size}» مجاز نیست.`),
      { code: 'DUPLICATE_VARIANT' }
    );
  }

  normalized.variants = variants;
  normalized.images = (normalized.images || []).slice(0, MAX_IMAGES);
  normalized.isFeatured = Boolean(normalized.isFeatured);
  normalized.wholesaleMinQuantity = Math.floor(Number(normalized.wholesaleMinQuantity || 6));
  normalized.updatedAt = new Date().toISOString();

  return normalized;
}

/** Small helper for the admin panel tables. */
export function productStats(product) {
  const variants = product.variants || [];
  return {
    variantCount: variants.length,
    totalStock: variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0),
    outOfStockVariants: variants.filter(v => Number(v.stock) <= 0).length
  };
}
