// In-Memory Relational Store with ACID-like consistency for Manto Moda
// Backed by a file snapshot (ADR-010). The public interface is unchanged:
// swapping this for PostgreSQL/Prisma later is a data-layer-only change.
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
      this.loadedFromSnapshot = true;
    } else {
      this.users = JSON.parse(JSON.stringify(SEED_USERS));
      this.applications = JSON.parse(JSON.stringify(SEED_APPLICATIONS));
      this.categories = JSON.parse(JSON.stringify(SEED_CATEGORIES));
      this.products = JSON.parse(JSON.stringify(SEED_PRODUCTS));
      this.orders = JSON.parse(JSON.stringify(SEED_ORDERS));
      this.payments = [];
      this.otps = [];
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
      otps: this.otps
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
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

  listProducts({ category, search, season, minPrice, maxPrice, page, limit } = {}) {
    const filtered = this.products.filter(p => {
      if (!p.isActive) return false;
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

  createProduct(productData) {
    const newProduct = {
      id: `prod-${Date.now().toString().slice(-4)}`,
      sku: productData.sku || `MM-PROD-${Date.now().toString().slice(-4)}`,
      title: productData.title,
      slug: productData.slug || `manto-${Date.now().toString().slice(-4)}`,
      category: productData.category || 'مانتو کتی و اداری',
      categoryId: productData.categoryId || 'cat-formal',
      material: productData.material || 'کرپ درجه یک',
      season: productData.season || 'چهار فصل',
      description: productData.description || '',
      retailPrice: Number(productData.retailPrice) || 0,
      wholesalePrice: Number(productData.wholesalePrice) || 0,
      wholesaleMinQuantity: Number(productData.wholesaleMinQuantity) || 6,
      isFeatured: Boolean(productData.isFeatured),
      isActive: true,
      rating: 5.0,
      reviewsCount: 0,
      images: productData.images && productData.images.length > 0 ? productData.images : ["https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=800&q=80"],
      variants: productData.variants || [
        { id: `var-${Date.now()}-1`, color: 'مشکی', colorHex: '#000000', size: '40', stock: 20, sku: `${productData.sku || 'SKU'}-BLK-40` }
      ]
    };
    this.products.unshift(newProduct);
    this.persist();
    return newProduct;
  }

  updateProduct(id, updates) {
    const product = this.findProductById(id);
    if (!product) return null;
    Object.assign(product, updates);
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

  createOrder(orderData) {
    const now = new Date().toISOString();
    const newOrder = {
      id: `ord-${Date.now().toString().slice(-4)}`,
      orderNumber: `MM-ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      userId: orderData.userId,
      userFullName: orderData.userFullName,
      userEmail: orderData.userEmail,
      userPhone: orderData.userPhone || '',
      orderType: orderData.orderType || 'RETAIL',
      status: 'PENDING',
      items: orderData.items,
      totalAmount: orderData.totalAmount,
      discountAmount: orderData.discountAmount || 0,
      shippingFee: orderData.shippingFee || 0,
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
