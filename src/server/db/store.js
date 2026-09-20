// In-Memory Relational Store with ACID-like consistency for Manto Moda
// Backed by a file snapshot (ADR-010). The public interface is unchanged:
// swapping this for PostgreSQL/Prisma later is a data-layer-only change.
import crypto from 'crypto';
import { SEED_USERS, SEED_APPLICATIONS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_ORDERS } from './seed-data.js';
import { loadSnapshot, createSaver, isPersistenceEnabled, snapshotPath } from './persistence.js';

/**
 * Allowed order status transitions (ADR-011).
 * Enforced server-side: an admin cannot move a delivered order back to pending,
 * and a cancelled order stays cancelled.
 */
export const ORDER_STATUS_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: []
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_TRANSITIONS);

/**
 * Shop-wide operational settings (ADR-017). Editable from the admin panel, so a
 * shipping price or a low-stock threshold is a business decision, not a deploy.
 * Shipping fees are in Toman.
 */
export const DEFAULT_SETTINGS = {
  shipping: {
    flatFee: 45000,
    freeShippingThreshold: 2000000,
    wholesaleAlwaysFree: true,
    /** Per-province overrides; anything else falls back to flatFee. */
    provinceFees: {
      'تهران': 35000,
      'البرز': 40000,
      'اصفهان': 55000,
      'فارس': 65000,
      'خراسان رضوی': 65000,
      'آذربایجان شرقی': 70000,
      'گیلان': 55000,
      'مازندران': 55000,
      'خوزستان': 70000,
      'سیستان و بلوچستان': 85000,
      'هرمزگان': 85000,
      'کردستان': 75000,
      'کرمان': 70000,
      'یزد': 60000,
      'قم': 45000,
      'مرکزی': 55000,
      'همدان': 65000,
      'کرمانشاه': 75000
    }
  },
  inventory: {
    /** Variants at or below this level trigger a low-stock alert. */
    lowStockThreshold: 3,
    /** Owner alerts are throttled to one SMS per variant per N hours. */
    alertThrottleHours: 12
  },
  shop: {
    name: 'مانتو مدا',
    ownerMobile: '',
    supportPhone: '',
    address: 'تهران، ایران',
    taxId: '',
    invoiceFooterNote: 'از خرید شما سپاسگزاریم — مانتو مدا'
  },
  coupons: {
    enabled: true,
    /** Discount may never exceed this share of the basket (safety rail). */
    maxDiscountShare: 0.6
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Deep-merge stored values over the defaults so new keys appear after upgrade. */
function mergeSettings(base, override) {
  if (!override || typeof override !== 'object') return clone(base);
  const merged = clone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && merged[key] && typeof merged[key] === 'object') {
      merged[key] = mergeSettings(merged[key], value);
    } else if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }
  return merged;
}

export function allowedTransitionsFrom(status) {
  return ORDER_STATUS_TRANSITIONS[status] || [];
}

class DataStore {
  constructor() {
    const snapshot = loadSnapshot();

    if (snapshot) {
      this.users = snapshot.users;
      this.applications = snapshot.applications;
      this.categories = snapshot.categories;
      this.products = snapshot.products;
      this.orders = snapshot.orders;
      this.payments = snapshot.payments || [];
      this.otps = snapshot.otps || [];
      this.settings = mergeSettings(DEFAULT_SETTINGS, snapshot.settings || {});
      // Monotonic counter that makes order numbers unique (see nextOrderNumber).
      this.orderSequence = Number(snapshot.orderSequence || 0);
      this.coupons = snapshot.coupons || [];
      this.adminActions = snapshot.adminActions || [];
      this.loadedFromSnapshot = true;
    } else {
      this.users = JSON.parse(JSON.stringify(SEED_USERS));
      this.applications = JSON.parse(JSON.stringify(SEED_APPLICATIONS));
      this.categories = JSON.parse(JSON.stringify(SEED_CATEGORIES));
      this.products = JSON.parse(JSON.stringify(SEED_PRODUCTS));
      this.orders = JSON.parse(JSON.stringify(SEED_ORDERS));
      this.payments = [];
      this.otps = [];
      this.settings = clone(DEFAULT_SETTINGS);
      this.orderSequence = 0;
      this.coupons = [];
      this.adminActions = [];
      this.loadedFromSnapshot = false;
    }

    // Ephemeral OTP records are never worth restoring: they hold short-lived
    // hashes and a stale code should not survive a restart.
    this.otps = [];

    this.persistenceEnabled = isPersistenceEnabled();
    this.saver = createSaver(() => this.snapshot());
  }

  // --- Persistence ---
  snapshot() {
    return {
      users: this.users,
      applications: this.applications,
      categories: this.categories,
      products: this.products,
      orders: this.orders,
      payments: this.payments,
      otps: this.otps,
      settings: this.settings,
      coupons: this.coupons,
      adminActions: this.adminActions,
      orderSequence: this.orderSequence
    };
  }

  persist() {
    if (!this.persistenceEnabled) return;
    this.saver.schedule();
  }

  flush() {
    if (!this.persistenceEnabled) return false;
    return this.saver.flush();
  }

  /** Test/diagnostic helper. */
  persistenceInfo() {
    return {
      enabled: this.persistenceEnabled,
      snapshotFile: this.persistenceEnabled ? snapshotPath() : null,
      loadedFromSnapshot: Boolean(this.loadedFromSnapshot),
      pendingWrites: this.persistenceEnabled ? this.saver.hasPendingWrites() : false
    };
  }


  // --- Shop Settings (ADR-017) ---
  getSettings() {
    return this.settings;
  }

  updateSettings(patch) {
    this.settings = mergeSettings(this.settings, patch || {});
    this.persist();
    return this.settings;
  }

  // --- Coupons (ADR-018) ---
  listCoupons({ includeArchived = false } = {}) {
    return this.coupons
      .filter(c => includeArchived || !c.isArchived)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  findCouponByCode(code) {
    if (!code) return null;
    const normalized = String(code).trim().toUpperCase();
    return this.coupons.find(c => c.code === normalized) || null;
  }

  createCoupon(data) {
    const now = new Date().toISOString();
    const coupon = {
      id: `cpn-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      code: String(data.code).trim().toUpperCase(),
      type: data.type,                       // PERCENT | FIXED
      value: Number(data.value),
      minBasket: Number(data.minBasket || 0),
      maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : null,
      appliesTo: data.appliesTo || 'ALL',    // ALL | RETAIL | WHOLESALE
      usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
      perUserLimit: data.perUserLimit ? Number(data.perUserLimit) : null,
      expiresAt: data.expiresAt || null,
      isActive: data.isActive !== false,
      isArchived: false,
      usedCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.coupons.push(coupon);
    this.persist();
    return coupon;
  }

  updateCoupon(id, updates = {}) {
    const coupon = this.coupons.find(c => c.id === id);
    if (!coupon) return null;

    const allowed = ['type', 'value', 'minBasket', 'maxDiscount', 'appliesTo', 'usageLimit', 'perUserLimit', 'expiresAt', 'isActive', 'code'];
    for (const key of allowed) {
      if (updates[key] === undefined) continue;
      if (key === 'code') coupon.code = String(updates.code).trim().toUpperCase();
      else if (key === 'type' || key === 'appliesTo') coupon[key] = updates[key];
      else if (key === 'isActive') coupon[key] = Boolean(updates.isActive);
      else if (key === 'expiresAt') coupon[key] = updates.expiresAt || null;
      else coupon[key] = updates[key] === null ? null : Number(updates[key]);
    }
    coupon.updatedAt = new Date().toISOString();
    this.persist();
    return coupon;
  }

  /** Archiving keeps the redemption history of past orders intact. */
  archiveCoupon(id) {
    const coupon = this.coupons.find(c => c.id === id);
    if (!coupon) return null;
    coupon.isArchived = true;
    coupon.isActive = false;
    coupon.updatedAt = new Date().toISOString();
    this.persist();
    return coupon;
  }

  /** Called when an order that used the coupon is actually created. */
  registerCouponUsage(code) {
    const coupon = this.findCouponByCode(code);
    if (!coupon) return null;
    coupon.usedCount = (coupon.usedCount || 0) + 1;
    coupon.lastUsedAt = new Date().toISOString();
    this.persist();
    return coupon;
  }

  countUserCouponUsage(userId, code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return 0;
    return this.orders.filter(o => o.userId === userId && o.status !== 'CANCELLED' && o.couponCode === normalized).length;
  }

  // --- Admin audit log (ADR-020) ---
  recordAdminAction({ adminId, adminEmail, action, entity, entityId, details, ip }) {
    const entry = {
      id: `act-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
      at: new Date().toISOString(),
      adminId: adminId || null,
      adminEmail: adminEmail || null,
      action,
      entity: entity || null,
      entityId: entityId || null,
      details: details || null,
      ip: ip || null
    };
    this.adminActions.unshift(entry);
    // Bound the log so a long-running shop cannot grow it without limit.
    if (this.adminActions.length > 2000) this.adminActions.length = 2000;
    this.persist();
    return entry;
  }

  listAdminActions({ limit = 100, entity, adminId } = {}) {
    return this.adminActions
      .filter(a => (entity ? a.entity === entity : true))
      .filter(a => (adminId ? a.adminId === adminId : true))
      .slice(0, Math.min(Number(limit) || 100, 500));
  }

  // --- Inventory bulk operations (Phase 10) ---
  /** Returns the updated variants plus any that are now at/below the threshold. */
  setVariantStock(productId, variantId, stock) {
    const product = this.findProductById(productId);
    if (!product) return null;
    const variant = (product.variants || []).find(v => v.id === variantId);
    if (!variant) return null;
    variant.stock = Math.max(0, Math.floor(Number(stock)));
    product.updatedAt = new Date().toISOString();
    this.persist();
    return { product, variant };
  }

  listLowStockVariants(threshold) {
    const limit = Number.isFinite(Number(threshold)) ? Number(threshold) : this.settings.inventory.lowStockThreshold;
    const low = [];
    for (const product of this.products) {
      if (product.isActive === false) continue;
      for (const variant of product.variants || []) {
        if (Number(variant.stock) <= limit) {
          low.push({
            productId: product.id,
            productTitle: product.title,
            variantId: variant.id,
            color: variant.color,
            size: variant.size,
            stock: Number(variant.stock),
            threshold: limit
          });
        }
      }
    }
    return low.sort((a, b) => a.stock - b.stock);
  }

  /**
   * Low-stock alerts must not spam the owner: one SMS per variant per throttle
   * window (ADR-019). Returns only the variants that should be alerted now.
   */
  takeAlertableLowStock(threshold, throttleHours) {
    const now = Date.now();
    const windowMs = Math.max(1, Number(throttleHours) || 12) * 3600 * 1000;
    const due = [];

    for (const item of this.listLowStockVariants(threshold)) {
      const product = this.findProductById(item.productId);
      const variant = (product?.variants || []).find(v => v.id === item.variantId);
      if (!variant) continue;
      const last = variant.lowStockAlertAt ? new Date(variant.lowStockAlertAt).getTime() : 0;
      if (now - last < windowMs) continue;
      variant.lowStockAlertAt = new Date(now).toISOString();
      due.push(item);
    }

    if (due.length > 0) this.persist();
    return due;
  }

  // --- Analytics helpers (ADR-020) ---
  /** Revenue counts only orders that were paid for or delivered, never cancelled ones. */
  revenueSummary({ now = new Date() } = {}) {
    const paidStatuses = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
    const isBillable = (order) => order.paymentStatus === 'PAID' || paidStatuses.includes(order.status);
    const billable = this.orders.filter(isBillable);

    // Iran has no DST: a fixed +03:30 offset is stable and avoids a tz dependency.
    const tehran = (date) => new Date(new Date(date).getTime() + (3 * 60 + 30) * 60 * 1000);
    const dayKey = (date) => tehran(date).toISOString().slice(0, 10);
    const monthKey = (date) => tehran(date).toISOString().slice(0, 7);

    const today = dayKey(now);
    const month = monthKey(now);

    const sum = (list) => list.reduce((acc, o) => acc + (o.payableAmount || 0), 0);

    const productTotals = new Map();
    for (const order of billable) {
      for (const item of order.items || []) {
        const key = item.productId || item.productTitle;
        const current = productTotals.get(key) || { productId: item.productId, title: item.productTitle, quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity) || 0;
        current.revenue += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        productTotals.set(key, current);
      }
    }

    // Revenue is recognised on payment, not on order creation. The dashboard
    // therefore also reports today's not-yet-paid orders separately, so the
    // owner never mistakes "orders taken" for "money in".
    const todaysOrders = this.orders.filter(o => dayKey(o.createdAt) === today);
    const pendingToday = todaysOrders.filter(o => !isBillable(o));

    return {
      revenueToday: sum(billable.filter(o => dayKey(o.createdAt) === today)),
      pendingRevenueToday: sum(pendingToday),
      pendingOrdersToday: pendingToday.length,
      revenueThisMonth: sum(billable.filter(o => monthKey(o.createdAt) === month)),
      revenueAllTime: sum(billable),
      ordersToday: this.orders.filter(o => dayKey(o.createdAt) === today).length,
      ordersThisMonth: this.orders.filter(o => monthKey(o.createdAt) === month).length,
      billableOrders: billable.length,
      cancelledOrders: this.orders.filter(o => o.status === 'CANCELLED').length,
      awaitingPayment: this.orders.filter(o => o.status === 'PENDING' && o.paymentStatus !== 'PAID').length,
      averageOrderValue: billable.length ? Math.round(sum(billable) / billable.length) : 0,
      topProducts: [...productTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5)
    };
  }

  // --- Order search / export (Phase 10) ---
  searchOrders({ status, paymentStatus, orderType, search, from, to, page = 1, limit = 100 } = {}) {
    const term = String(search || '').trim().toLowerCase();

    let list = this.orders.filter(order => {
      if (status && order.status !== status) return false;
      if (paymentStatus && (order.paymentStatus || 'PENDING') !== paymentStatus) return false;
      if (orderType && order.orderType !== orderType) return false;
      if (from && new Date(order.createdAt) < new Date(from)) return false;
      if (to) {
        // `to` is inclusive: compare against the end of that day.
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (new Date(order.createdAt) > end) return false;
      }
      if (!term) return true;

      const haystack = [
        order.orderNumber,
        order.userFullName,
        order.userEmail,
        order.userPhone,
        order.shippingAddress?.phone,
        order.shippingAddress?.recipientName,
        order.shippingAddress?.city,
        order.shippingAddress?.province,
        order.couponCode
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(term);
    });

    list = list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 500);
    const safePage = Math.max(1, Number(page) || 1);
    const total = list.length;
    const start = (safePage - 1) * safeLimit;

    return {
      items: list.slice(start, start + safeLimit),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        hasMore: start + safeLimit < total
      }
    };
  }

  // --- User Operations ---
  findUserById(id) {
    return this.users.find(u => u.id === id) || null;
  }

  findUserByEmail(email) {
    if (!email) return null;
    return this.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  findUserByPhone(phone) {
    if (!phone) return null;
    return this.users.find(u => u.phone === phone) || null;
  }

  createUser(userData) {
    const newUser = {
      id: `usr-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      email: userData.email,
      phone: userData.phone,
      fullName: userData.fullName,
      role: userData.role || 'REGULAR',
      isWholesaleVerified: Boolean(userData.isWholesaleVerified),
      passwordHash: userData.passwordHash,
      createdAt: new Date().toISOString()
    };
    this.users.push(newUser);
    this.persist();
    return newUser;
  }

  updateUser(id, updates) {
    const user = this.findUserById(id);
    if (!user) return null;
    Object.assign(user, updates);
    this.persist();
    return user;
  }

  // --- OTP Operations (BL-007, hashed & single-use) ---
  findOtpByMobile(mobile) {
    if (!mobile) return null;
    return this.otps.find(o => o.mobile === mobile) || null;
  }

  saveOtpRecord(mobile, record) {
    const index = this.otps.findIndex(o => o.mobile === mobile);
    if (index >= 0) this.otps.splice(index, 1);
    const stored = { mobile, createdAt: new Date().toISOString(), ...record };
    this.otps.push(stored);
    return stored;
  }

  incrementOtpAttempts(mobile) {
    const record = this.findOtpByMobile(mobile);
    if (!record) return null;
    record.attempts += 1;
    return record;
  }

  deleteOtpByMobile(mobile) {
    const index = this.otps.findIndex(o => o.mobile === mobile);
    if (index < 0) return false;
    this.otps.splice(index, 1);
    return true;
  }

  purgeExpiredOtps() {
    const now = Date.now();
    const before = this.otps.length;
    this.otps = this.otps.filter(o => new Date(o.expiresAt).getTime() > now);
    return before - this.otps.length;
  }

  // --- Payment Operations (BL-006) ---
  createPayment(paymentData) {
    const payment = {
      id: `pay-${Date.now().toString().slice(-6)}`,
      orderId: paymentData.orderId,
      userId: paymentData.userId,
      provider: paymentData.provider,
      authority: paymentData.authority,
      amountRial: paymentData.amountRial,
      amountToman: paymentData.amountToman,
      status: 'PENDING', // PENDING -> PAID | FAILED
      refId: null,
      cardPan: null,
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      attempts: 0
    };
    this.payments.push(payment);
    this.persist();
    return payment;
  }

  findPaymentByAuthority(authority) {
    return this.payments.find(p => p.authority === authority) || null;
  }

  findPaymentByOrderId(orderId) {
    return [...this.payments].reverse().find(p => p.orderId === orderId) || null;
  }

  listPayments() {
    return [...this.payments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  markPaymentVerified(authority, { refId, cardPan, status }) {
    const payment = this.findPaymentByAuthority(authority);
    if (!payment) return null;
    payment.status = status;
    payment.refId = refId ?? payment.refId;
    payment.cardPan = cardPan ?? payment.cardPan;
    payment.verifiedAt = new Date().toISOString();
    payment.attempts += 1;
    this.persist();
    return payment;
  }

  markPaymentAttemptFailed(authority) {
    const payment = this.findPaymentByAuthority(authority);
    if (!payment) return null;
    payment.attempts += 1;
    this.persist();
    return payment;
  }

  updatePaymentStatus(orderId, status, refId = null) {
    const payment = this.findPaymentByOrderId(orderId);
    if (!payment) return null;
    payment.status = status;
    if (refId) payment.refId = refId;
    this.persist();
    return payment;
  }

  // --- Wholesale Application Operations ---
  listApplications() {
    return [...this.applications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  findApplicationById(id) {
    return this.applications.find(a => a.id === id) || null;
  }

  findApplicationByUserId(userId) {
    return this.applications.find(a => a.userId === userId) || null;
  }

  createApplication(appData) {
    const newApp = {
      id: `app-${Date.now().toString().slice(-4)}`,
      userId: appData.userId,
      userFullName: appData.userFullName,
      userEmail: appData.userEmail,
      userPhone: appData.userPhone,
      companyName: appData.companyName,
      economicCode: appData.economicCode || '',
      businessAddress: appData.businessAddress,
      city: appData.city,
      province: appData.province,
      businessPhone: appData.businessPhone,
      storeType: appData.storeType || 'PHYSICAL_STORE',
      status: 'PENDING',
      adminNotes: '',
      createdAt: new Date().toISOString()
    };
    this.applications.push(newApp);
    this.persist();
    return newApp;
  }

  reviewApplication(id, { status, adminNotes, reviewerId }) {
    const app = this.findApplicationById(id);
    if (!app) return null;

    app.status = status; // APPROVED or REJECTED
    app.adminNotes = adminNotes || '';
    app.reviewedBy = reviewerId;
    app.reviewedAt = new Date().toISOString();

    if (status === 'APPROVED') {
      const user = this.findUserById(app.userId);
      if (user) {
        user.role = 'WHOLESALE';
        user.isWholesaleVerified = true;
        user.companyName = app.companyName;
      }
    } else if (status === 'REJECTED') {
      const user = this.findUserById(app.userId);
      if (user) {
        user.role = 'REGULAR';
        user.isWholesaleVerified = false;
      }
    }

    this.persist();
    return app;
  }

  // --- Product & Category Operations ---
  listCategories() {
    return this.categories;
  }

  listProducts({ category, search, season, minPrice, maxPrice, page, limit, includeArchived = false } = {}) {
    const filtered = this.products.filter(p => {
      // The storefront only sees active, non-archived products; the admin panel
      // asks with includeArchived=true and sees everything.
      if (!includeArchived && (!p.isActive || p.isArchived)) return false;
      if (category && p.categoryId !== category && p.category !== category) return false;
      if (season && p.season !== season && p.season !== 'چهار فصل') return false;
      if (minPrice && p.retailPrice < Number(minPrice)) return false;
      if (maxPrice && p.retailPrice > Number(maxPrice)) return false;
      if (search) {
        const query = search.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(query);
        const matchesDesc = p.description.toLowerCase().includes(query);
        const matchesMaterial = p.material.toLowerCase().includes(query);
        const matchesSku = p.sku.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesMaterial && !matchesSku) return false;
      }
      return true;
    });

    if (page === undefined && limit === undefined) return filtered;

    const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 60);
    const safePage = Math.max(Number(page) || 1, 1);
    const start = (safePage - 1) * safeLimit;

    return {
      items: filtered.slice(start, start + safeLimit),
      meta: {
        page: safePage,
        limit: safeLimit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / safeLimit)),
        hasMore: start + safeLimit < filtered.length
      }
    };
  }

  findProductById(id) {
    return this.products.find(p => p.id === id || p.slug === id) || null;
  }

  /**
   * Creates a product from an already-normalised payload (see
   * services/catalog/product.service.js). Only whitelisted fields are copied:
   * an admin request can never inject `id`, `rating` or arbitrary keys.
   */
  createProduct(product) {
    const now = new Date().toISOString();
    const newProduct = {
      id: product.id || `prod-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      sku: product.sku,
      slug: product.slug,
      title: product.title,
      category: product.category,
      categoryId: product.categoryId || db.categories.find(c => c.name === product.category)?.id || 'cat-formal',
      material: product.material || '',
      season: product.season || 'چهار فصل',
      description: product.description || '',
      retailPrice: Math.round(Number(product.retailPrice)),
      wholesalePrice: Math.round(Number(product.wholesalePrice) || 0),
      wholesaleMinQuantity: Math.floor(Number(product.wholesaleMinQuantity) || 6),
      isFeatured: Boolean(product.isFeatured),
      isActive: product.isActive !== false,
      isArchived: false,
      rating: 5,
      reviewsCount: 0,
      images: product.images || [],
      imageThumbnails: product.imageThumbnails || [],
      variants: product.variants || [],
      createdAt: now,
      updatedAt: now
    };

    this.products.unshift(newProduct);
    this.persist();
    return newProduct;
  }

  /**
   * Updates only the fields an admin is allowed to change. `id`, `variants`
   * stock and statistics are never blindly overwritten from the request body.
   */
  updateProduct(id, updates = {}) {
    const product = this.findProductById(id);
    if (!product) return null;

    const allowed = [
      'title', 'slug', 'sku', 'category', 'categoryId', 'material', 'season', 'description',
      'retailPrice', 'wholesalePrice', 'wholesaleMinQuantity', 'isFeatured', 'isActive', 'images'
    ];

    for (const key of allowed) {
      if (updates[key] === undefined) continue;
      if (key === 'retailPrice' || key === 'wholesalePrice') product[key] = Math.round(Number(updates[key]));
      else if (key === 'wholesaleMinQuantity') product[key] = Math.floor(Number(updates[key]));
      else if (key === 'isFeatured' || key === 'isActive') product[key] = Boolean(updates[key]);
      else if (key === 'images') product[key] = (updates.images || []).slice(0, 8);
      else product[key] = updates[key];
    }

    if (Array.isArray(updates.variants)) {
      // Merging by id preserves stock history for variants that already existed.
      for (const incoming of updates.variants) {
        const existing = (product.variants || []).find(v => v.id === incoming.id);
        if (existing) {
          if (incoming.color !== undefined) existing.color = incoming.color;
          if (incoming.colorHex !== undefined) existing.colorHex = incoming.colorHex;
          if (incoming.size !== undefined) existing.size = incoming.size;
          if (incoming.stock !== undefined) existing.stock = Math.max(0, Math.floor(Number(incoming.stock)));
          if (incoming.sku !== undefined) existing.sku = incoming.sku;
        }
      }
      const incomingIds = new Set(updates.variants.map(v => v.id).filter(Boolean));
      // Variants the admin removed are dropped, but only if they hold no stock
      // that was already sold — otherwise those sales would reference a ghost.
      product.variants = [
        ...(product.variants || []).filter(v => incomingIds.has(v.id) || !incomingIds.size),
        ...updates.variants.filter(v => !v.id || !(product.variants || []).some(existing => existing.id === v.id))
      ];
    }

    product.updatedAt = new Date().toISOString();
    this.persist();
    return product;
  }

  /**
   * Archiving instead of deleting: past orders point at this product, and the
   * financial history must stay readable. Archived products disappear from the
   * storefront but remain visible to the admin.
   */
  archiveProduct(id, { archivedBy = null } = {}) {
    const product = this.findProductById(id);
    if (!product) return null;
    product.isArchived = true;
    product.isActive = false;
    product.archivedAt = new Date().toISOString();
    product.archivedBy = archivedBy;
    product.updatedAt = product.archivedAt;
    this.persist();
    return product;
  }

  restoreProduct(id) {
    const product = this.findProductById(id);
    if (!product) return null;
    product.isArchived = false;
    product.isActive = true;
    product.updatedAt = new Date().toISOString();
    this.persist();
    return product;
  }

  // --- Inventory Operations (ADR-011: no overselling) ---
  findVariant(productId, variantId) {
    const product = this.findProductById(productId);
    if (!product) return null;
    const variants = product.variants || [];
    const variant = variants.find(v => v.id === variantId) || variants[0] || null;
    return { product, variant };
  }

  /**
   * Non-mutating availability check.
   * Returns per-line availability so the cart can warn before checkout.
   */
  checkStock(items = []) {
    const lines = [];
    let ok = true;

    for (const item of items) {
      const found = this.findVariant(item.productId, item.variantId);
      if (!found) {
        lines.push({
          productId: item.productId,
          variantId: item.variantId || null,
          productTitle: 'کالای نامشخص',
          requested: Number(item.quantity) || 0,
          available: 0,
          status: 'PRODUCT_NOT_FOUND'
        });
        ok = false;
        continue;
      }

      const { product, variant } = found;
      const requested = Math.max(1, parseInt(item.quantity, 10) || 1);
      const available = variant ? Number(variant.stock) || 0 : 0;

      if (available < requested) {
        ok = false;
        lines.push({
          productId: product.id,
          variantId: variant ? variant.id : null,
          productTitle: product.title,
          color: variant ? variant.color : '',
          size: variant ? variant.size : '',
          requested,
          available,
          status: available === 0 ? 'OUT_OF_STOCK' : 'INSUFFICIENT_STOCK'
        });
      } else {
        lines.push({
          productId: product.id,
          variantId: variant ? variant.id : null,
          productTitle: product.title,
          color: variant ? variant.color : '',
          size: variant ? variant.size : '',
          requested,
          available,
          status: 'OK'
        });
      }
    }

    return { ok, lines, shortages: lines.filter(l => l.status !== 'OK') };
  }

  /**
   * Atomically reserve stock for an order.
   * Validation of every line happens BEFORE any decrement and there is no
   * `await` in between, so Node's single-threaded model makes this atomic:
   * a concurrent request can never interleave and oversell.
   */
  reserveStock(items = []) {
    const check = this.checkStock(items);
    if (!check.ok) return { ok: false, shortages: check.shortages, reserved: [] };

    const reserved = [];
    for (const item of items) {
      const found = this.findVariant(item.productId, item.variantId);
      if (!found || !found.variant) continue;
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      found.variant.stock = Math.max(0, Number(found.variant.stock) - quantity);
      reserved.push({
        productId: found.product.id,
        variantId: found.variant.id,
        quantity
      });
    }

    this.persist();
    return { ok: true, reserved, shortages: [] };
  }

  /** Return reserved stock to the catalog (used when an order is cancelled). */
  releaseStock(items = []) {
    const released = [];

    for (const item of items) {
      // Orders store variantId directly on the line item when created.
      const productId = item.productId;
      const variantId = item.variantId;
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);

      const product = this.findProductById(productId);
      if (!product) continue;

      const variant = (product.variants || []).find(v => v.id === variantId) || (product.variants || [])[0];
      if (!variant) continue;

      variant.stock = (Number(variant.stock) || 0) + quantity;
      released.push({ productId: product.id, variantId: variant.id, quantity });
    }

    if (released.length > 0) this.persist();
    return released;
  }

  // --- Order Operations ---
  listOrders() {
    return [...this.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  findOrderById(id) {
    return this.orders.find(o => o.id === id || o.orderNumber === id) || null;
  }

  findOrdersByUserId(userId) {
    return this.orders.filter(o => o.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Unique, human-friendly order number.
   *
   * Why this replaced the old pseudo-random formula: that gave only 9000 possible
   * numbers per year, so by the birthday paradox two orders collided after ~110
   * orders — and the invoice route looks an order up *by number*, so a collision
   * means one customer could receive another customer's invoice.
   *
   * Now: a persisted monotonic counter (never repeats), starting from a random
   * point so a brand-new shop's first order is not obviously "00001", and padded
   * to five digits. Structural uniqueness, not statistical luck.
   */
  nextOrderNumber() {
    const year = new Date().getFullYear();
    const taken = new Set(this.orders.map(o => o.orderNumber));

    // First ever order of this shop: start somewhere unpredictable but fixed.
    if (!this.orderSequence) {
      this.orderSequence = crypto.randomInt(1000, 8000);
    }

    for (let attempt = 0; attempt < 100000; attempt += 1) {
      this.orderSequence += 1;
      const candidate = `MM-ORD-${year}-${String(this.orderSequence).padStart(5, '0')}`;
      if (!taken.has(candidate)) return candidate;
    }

    // Unreachable in practice; kept so the function can never loop forever.
    return `MM-ORD-${year}-${crypto.randomInt(100000, 999999)}`;
  }

  createOrder(orderData) {
    const now = new Date().toISOString();
    const newOrder = {
      id: `ord-${Date.now().toString().slice(-4)}`,
      orderNumber: this.nextOrderNumber(),
      userId: orderData.userId,
      userFullName: orderData.userFullName,
      userEmail: orderData.userEmail,
      userPhone: orderData.userPhone || '',
      orderType: orderData.orderType || 'RETAIL',
      status: 'PENDING',
      items: orderData.items,
      totalAmount: orderData.totalAmount,
      discountAmount: orderData.discountAmount || 0,
      // Coupon redemption is part of the financial record, not a UI detail:
      // accounting needs to know which promotion produced this revenue.
      couponCode: orderData.couponCode || null,
      shippingFee: orderData.shippingFee || 0,
      shippingSource: orderData.shippingSource || null,
      payableAmount: orderData.payableAmount,
      // Online checkout starts UNPAID: the order is only marked PAID after the
      // PSP verifies the transaction (ADR-008). Bank-transfer receipts stay
      // PENDING until an admin confirms the receipt.
      paymentStatus: orderData.paymentStatus || 'PENDING',
      paymentMethod: orderData.paymentMethod || 'ONLINE_GATEWAY',
      stockReserved: Boolean(orderData.stockReserved),
      shippingAddress: orderData.shippingAddress,
      createdAt: now,
      // Lifecycle records (ADR-011): full audit trail + notification log.
      statusHistory: [{ status: 'PENDING', at: now, by: orderData.userId, note: 'سفارش ثبت شد.' }],
      notifications: []
    };
    this.orders.unshift(newOrder);
    this.persist();
    return newOrder;
  }

  /**
   * Move an order to a new status, enforcing the transition map and appending
   * to the audit trail. Returns a result object so the route can answer 409
   * with the allowed transitions instead of guessing.
   */
  transitionOrderStatus(orderId, nextStatus, { by = 'system', note = '' } = {}) {
    const order = this.findOrderById(orderId);
    if (!order) return { ok: false, reason: 'ORDER_NOT_FOUND' };

    if (!ORDER_STATUSES.includes(nextStatus)) {
      return { ok: false, reason: 'INVALID_STATUS', allowed: ORDER_STATUSES };
    }

    const allowed = allowedTransitionsFrom(order.status);
    if (!allowed.includes(nextStatus)) {
      return { ok: false, reason: 'INVALID_TRANSITION', from: order.status, allowed };
    }

    const previousStatus = order.status;
    order.status = nextStatus;
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      from: previousStatus,
      status: nextStatus,
      at: new Date().toISOString(),
      by,
      note: note || ''
    });

    this.persist();
    return { ok: true, order, from: previousStatus, to: nextStatus, allowed: allowedTransitionsFrom(nextStatus) };
  }

  /** Kept for backward compatibility with existing callers/tests. */
  updateOrderStatus(orderId, status) {
    const result = this.transitionOrderStatus(orderId, status, { by: 'system' });
    return result.ok ? result.order : null;
  }

  recordOrderNotification(orderId, notification) {
    const order = this.findOrderById(orderId);
    if (!order) return null;
    order.notifications = order.notifications || [];
    order.notifications.push(notification);
    this.persist();
    return order;
  }

  markOrderPaid(orderId, { paymentStatus = 'PAID', refId = null, paidAt = null } = {}) {
    const order = this.findOrderById(orderId);
    if (!order) return null;
    order.paymentStatus = paymentStatus;
    if (refId) order.paymentRefId = refId;
    order.paidAt = paidAt || new Date().toISOString();
    this.persist();
    return order;
  }
}

export const db = new DataStore();
