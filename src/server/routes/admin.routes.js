import { Router } from 'express';
import { db, ORDER_STATUSES } from '../db/store.js';
import { notifyStatusChange } from '../services/notification.service.js';
import { validate } from '../middlewares/validate.js';
import { productCreateSchema, productUpdateSchema, normalizeProductInput, productStats } from '../services/catalog/product.service.js';
import { buildOrdersCsv } from '../services/reporting/csv.service.js';
import { checkLowStock } from '../services/inventory-alert.service.js';
import { auditAdminWrite } from '../middlewares/admin-audit.js';
import { requireRole } from '../middlewares/auth.js';

const router = Router();

// Guard all admin routes with requireRole('ADMIN')
router.use(requireRole('ADMIN'));

// Admin Dashboard Overview Statistics
router.get('/stats', (req, res) => {
  const revenue = db.revenueSummary();
  const applications = db.listApplications();
  const products = db.listProducts({ includeArchived: true });

  const activeProducts = products.filter(p => p.isActive && !p.isArchived);

  res.json({
    success: true,
    data: {
      // Revenue counts only paid/confirmed orders — cancelled ones are excluded
      // (the previous version summed everything, including cancellations).
      revenueToday: revenue.revenueToday,
      revenueThisMonth: revenue.revenueThisMonth,
      revenueAllTime: revenue.revenueAllTime,
      averageOrderValue: revenue.averageOrderValue,
      ordersToday: revenue.ordersToday,
      ordersThisMonth: revenue.ordersThisMonth,
      billableOrders: revenue.billableOrders,
      cancelledOrders: revenue.cancelledOrders,
      pendingOrdersCount: db.listOrders().filter(o => o.status === 'PENDING' || o.status === 'CONFIRMED' || o.status === 'PROCESSING').length,
      awaitingPayment: revenue.awaitingPayment,
      pendingWholesaleCount: applications.filter(a => a.status === 'PENDING').length,
      verifiedWholesaleCount: db.users.filter(u => u.role === 'WHOLESALE' && u.isWholesaleVerified).length,
      productsCount: activeProducts.length,
      archivedProductsCount: products.length - activeProducts.length,
      usersCount: db.users.length,
      outOfStockVariants: activeProducts.reduce((sum, p) => sum + productStats(p).outOfStockVariants, 0),
      lowStock: db.listLowStockVariants(),
      topProducts: revenue.topProducts
    }
  });
});

// ---------------------------------------------------------------------------
// Shop settings (ADR-017): shipping tariffs, thresholds, owner mobile, shop info
// ---------------------------------------------------------------------------
router.get('/settings', (req, res) => {
  res.json({ success: true, data: db.getSettings() });
});

router.put('/settings', (req, res) => {
  const updated = db.updateSettings(req.body || {});
  res.json({ success: true, data: updated, message: 'تنظیمات فروشگاه ذخیره شد.' });
});

// ---------------------------------------------------------------------------
// Coupons (ADR-018)
// ---------------------------------------------------------------------------
router.get('/coupons', (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  res.json({ success: true, data: db.listCoupons({ includeArchived }) });
});

router.post('/coupons', (req, res) => {
  const { code, type, value, minBasket, maxDiscount, appliesTo, usageLimit, perUserLimit, expiresAt, isActive } = req.body || {};

  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9\u0600-\u06FF_-]{3,30}$/.test(normalizedCode)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_COUPON_CODE',
      message: 'کد تخفیف باید ۳ تا ۳۰ کاراکتر انگلیسی/عدد باشد (بدون فاصله).'
    });
  }

  if (!['PERCENT', 'FIXED'].includes(type)) {
    return res.status(400).json({ success: false, error: 'INVALID_COUPON_TYPE', message: 'نوع تخفیف باید درصدی یا مبلغی باشد.' });
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return res.status(400).json({ success: false, error: 'INVALID_COUPON_VALUE', message: 'مقدار تخفیف باید عددی بزرگ‌تر از صفر باشد.' });
  }

  if (type === 'PERCENT' && numericValue > 90) {
    return res.status(400).json({ success: false, error: 'INVALID_COUPON_VALUE', message: 'درصد تخفیف نمی‌تواند بیشتر از ۹۰٪ باشد.' });
  }

  if (db.findCouponByCode(normalizedCode)) {
    return res.status(409).json({ success: false, error: 'COUPON_EXISTS', message: 'این کد تخفیف قبلاً ساخته شده است.' });
  }

  const coupon = db.createCoupon({
    code: normalizedCode, type, value: numericValue, minBasket, maxDiscount, appliesTo,
    usageLimit, perUserLimit, expiresAt, isActive
  });

  res.status(201).json({ success: true, data: coupon, message: `کد تخفیف ${coupon.code} ساخته شد.` });
});

router.put('/coupons/:id', (req, res) => {
  const coupon = db.updateCoupon(req.params.id, req.body || {});
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'COUPON_NOT_FOUND', message: 'کد تخفیف یافت نشد.' });
  }
  res.json({ success: true, data: coupon, message: 'کد تخفیف به‌روزرسانی شد.' });
});

router.delete('/coupons/:id', (req, res) => {
  const coupon = db.archiveCoupon(req.params.id);
  if (!coupon) {
    return res.status(404).json({ success: false, error: 'COUPON_NOT_FOUND', message: 'کد تخفیف یافت نشد.' });
  }
  res.json({ success: true, data: coupon, message: 'کد تخفیف آرشیو شد (سابقه سفارش‌های قبلی حفظ می‌شود).' });
});

// ---------------------------------------------------------------------------
// Admin audit log (ADR-020)
// ---------------------------------------------------------------------------
router.get('/audit-log', (req, res) => {
  const { limit, entity } = req.query;
  res.json({ success: true, data: db.listAdminActions({ limit, entity }) });
});

// List Wholesale Applications with status filter
router.get('/wholesale/applications', (req, res) => {
  const { status } = req.query;
  let apps = db.listApplications();

  if (status) {
    apps = apps.filter(a => a.status === status);
  }

  res.json({
    success: true,
    data: apps
  });
});

// Review Wholesale Application (Approve or Reject)
router.post('/wholesale/applications/:id/review', (req, res) => {
  const { status, adminNotes } = req.body; // status: 'APPROVED' or 'REJECTED'

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STATUS',
      message: 'وضعیت باید APPROVED یا REJECTED باشد.'
    });
  }

  const updatedApp = db.reviewApplication(req.params.id, {
    status,
    adminNotes,
    reviewerId: req.user.id
  });

  if (!updatedApp) {
    return res.status(404).json({
      success: false,
      error: 'APPLICATION_NOT_FOUND',
      message: 'درخواست عمده‌فروشی مورد نظر یافت نشد.'
    });
  }

  res.json({
    success: true,
    data: updatedApp,
    message: status === 'APPROVED' 
      ? `درخواست خریدار عمده (${updatedApp.companyName}) تایید شد و دسترسی قیمت عمده فعال گردید.`
      : `درخواست خریدار عمده (${updatedApp.companyName}) رد شد.`
  });
});

// Admin Product Management
router.get('/products', (req, res) => {
  const { search, category, archived } = req.query;
  // Admin sees archived products too, so a discontinued item is still findable.
  const all = db.listProducts({ search, category, includeArchived: true });
  const filtered = archived === 'true'
    ? all.filter(p => p.isArchived)
    : archived === 'false'
      ? all.filter(p => !p.isArchived)
      : all;

  res.json({
    success: true,
    data: filtered.map(p => ({ ...p, stats: productStats(p) })),
    count: filtered.length,
    meta: { archivedCount: all.filter(p => p.isArchived).length, activeCount: all.filter(p => !p.isArchived).length }
  });
});

router.post('/products', validate(productCreateSchema), (req, res) => {
  try {
    const normalized = normalizeProductInput(req.body);
    const created = db.createProduct(normalized);

    res.status(201).json({
      success: true,
      data: { ...created, stats: productStats(created) },
      message: `محصول «${created.title}» با کد کالا ${created.sku} ثبت شد.`
    });
  } catch (error) {
    if (['WHOLESALE_PRICE_NOT_LOWER', 'NO_VARIANTS', 'DUPLICATE_VARIANT'].includes(error.code)) {
      return res.status(400).json({ success: false, error: error.code, message: error.message });
    }
    throw error;
  }
});

router.put('/products/:id', validate(productUpdateSchema), (req, res) => {
  const existing = db.findProductById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: 'محصول یافت نشد.' });
  }

  try {
    // A slug is a public URL (ADR-015) already shared on social media: it stays
    // stable unless the admin explicitly sends a new one.
    const normalized = normalizeProductInput(
      { ...existing, ...req.body, slug: req.body.slug || existing.slug, sku: req.body.sku || existing.sku },
      { existing }
    );
    if (!req.body.slug) normalized.slug = existing.slug;

    const updated = db.updateProduct(req.params.id, normalized);
    res.json({
      success: true,
      data: { ...updated, stats: productStats(updated) },
      message: 'اطلاعات محصول به‌روزرسانی شد.'
    });
  } catch (error) {
    if (['WHOLESALE_PRICE_NOT_LOWER', 'NO_VARIANTS', 'DUPLICATE_VARIANT'].includes(error.code)) {
      return res.status(400).json({ success: false, error: error.code, message: error.message });
    }
    throw error;
  }
});

/**
 * DELETE archives the product instead of erasing it (Phase 10 decision):
 * historical orders reference it, and deleting would break the financial record.
 */
router.delete('/products/:id', (req, res) => {
  const product = db.findProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: 'محصول یافت نشد.' });
  }

  if (product.isArchived) {
    return res.status(409).json({ success: false, error: 'ALREADY_ARCHIVED', message: 'این محصول قبلاً آرشیو شده است.' });
  }

  db.archiveProduct(product.id, { archivedBy: req.user?.email || 'admin' });
  res.json({
    success: true,
    data: product,
    message: `محصول «${product.title}» از فروشگاه برداشته شد (سفارش‌های قبلی دست‌نخورده می‌مانند).`
  });
});

router.post('/products/:id/restore', (req, res) => {
  const product = db.restoreProduct(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: 'محصول یافت نشد.' });
  }
  res.json({ success: true, data: product, message: `محصول «${product.title}» به فروشگاه برگشت.` });
});

// ---------------------------------------------------------------------------
// Inventory quick-edit (Phase 10 item 5): update many variants in one request.
// ---------------------------------------------------------------------------
router.put('/inventory/bulk', (req, res) => {
  const { updates } = req.body || {};
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ success: false, error: 'EMPTY_UPDATE', message: 'هیچ تغییری ارسال نشده است.' });
  }

  const applied = [];
  const rejected = [];

  for (const update of updates) {
    const { productId, variantId, stock } = update || {};
    const numericStock = Number(stock);

    if (!Number.isInteger(numericStock) || numericStock < 0) {
      rejected.push({ ...update, reason: 'INVALID_STOCK', message: 'موجودی باید عدد صحیح و نامنفی باشد.' });
      continue;
    }

    const result = db.setVariantStock(productId, variantId, numericStock);
    if (!result) {
      rejected.push({ ...update, reason: 'VARIANT_NOT_FOUND', message: 'محصول یا تنوع کالا یافت نشد.' });
      continue;
    }

    applied.push({ productId, variantId, productTitle: result.product.title, stock: result.variant.stock });
  }

  if (applied.length > 0) {
    // Alerts are throttled per variant, so this cannot spam the owner.
    checkLowStock().catch(() => { /* logged inside */ });
  }

  res.json({
    success: rejected.length === 0,
    data: { applied, rejected },
    message: `${applied.length} موجودی به‌روزرسانی شد${rejected.length ? ` — ${rejected.length} مورد رد شد` : ''}.`
  });
});

// Manual trigger so the owner can check critical stock on demand.
router.get('/inventory/low-stock', (req, res) => {
  res.json({
    success: true,
    data: db.listLowStockVariants(req.query.threshold),
    threshold: db.getSettings().inventory.lowStockThreshold
  });
});

// Admin Orders Management — search, filters, pagination and CSV export (Phase 10)
router.get('/orders', (req, res) => {
  const { status, paymentStatus, orderType, search, from, to, page, limit } = req.query;
  const result = db.searchOrders({ status, paymentStatus, orderType, search, from, to, page, limit });

  res.json({
    success: true,
    data: result.items,
    meta: result.meta,
    count: result.items.length
  });
});

// Accounting export: Excel opens UTF-8 CSV correctly when it starts with a BOM,
// and the column headers are Persian so the file is usable without a manual step.
router.get('/orders/export.csv', (req, res) => {
  const { status, paymentStatus, orderType, search, from, to } = req.query;
  const result = db.searchOrders({ status, paymentStatus, orderType, search, from, to, page: 1, limit: 500 });

  const csv = buildOrdersCsv(result.items);
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="manto-orders-${stamp}.csv"`);
  res.send(csv);
});

router.put('/orders/:id/status', (req, res) => {
  const { status, note } = req.body || {};

  const result = db.transitionOrderStatus(req.params.id, status, {
    by: req.user?.id || 'admin',
    note: note || ''
  });

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'سفارش یافت نشد.' });
    }

    if (result.reason === 'INVALID_STATUS') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: `وضعیت سفارش نامعتبر است. وضعیت‌های مجاز: ${ORDER_STATUSES.join(', ')}`,
        allowedStatuses: ORDER_STATUSES
      });
    }

    // Invalid transition (ADR-011): the order lifecycle is a state machine, not
    // a free-form field. A delivered order cannot go back to pending, etc.
    return res.status(409).json({
      success: false,
      error: 'INVALID_STATUS_TRANSITION',
      message: `گذار از وضعیت «${result.from}» به «${status}» مجاز نیست.`,
      from: result.from,
      allowedTransitions: result.allowed
    });
  }

  // Cancelling returns the reserved stock to the catalog.
  if (status === 'CANCELLED' && result.order.stockReserved) {
    const released = db.releaseStock(result.order.items);
    result.order.stockReleased = released;
    result.order.stockReserved = false;
    db.persist();
  }

  // Customer SMS (ADR-012) — fire and forget, never blocks the admin request.
  notifyStatusChange(result.order, status);

  res.json({
    success: true,
    data: result.order,
    message: `وضعیت سفارش از «${result.from}» به «${status}» تغییر یافت.`,
    allowedTransitions: result.allowed
  });
});

export default router;
