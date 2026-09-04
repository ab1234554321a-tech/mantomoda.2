// In-Memory Relational Store with ACID-like consistency for Manto Moda
import { SEED_USERS, SEED_APPLICATIONS, SEED_CATEGORIES, SEED_PRODUCTS, SEED_ORDERS } from './seed-data.js';

class DataStore {
  constructor() {
    this.users = JSON.parse(JSON.stringify(SEED_USERS));
    this.applications = JSON.parse(JSON.stringify(SEED_APPLICATIONS));
    this.categories = JSON.parse(JSON.stringify(SEED_CATEGORIES));
    this.products = JSON.parse(JSON.stringify(SEED_PRODUCTS));
    this.orders = JSON.parse(JSON.stringify(SEED_ORDERS));
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
      isWholesaleVerified: false,
      password: userData.password,
      createdAt: new Date().toISOString()
    };
    this.users.push(newUser);
    return newUser;
  }

  updateUser(id, updates) {
    const user = this.findUserById(id);
    if (!user) return null;
    Object.assign(user, updates);
    return user;
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

    return app;
  }

  // --- Product & Category Operations ---
  listCategories() {
    return this.categories;
  }

  listProducts({ category, search, season, minPrice, maxPrice } = {}) {
    return this.products.filter(p => {
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
    return newProduct;
  }

  updateProduct(id, updates) {
    const product = this.findProductById(id);
    if (!product) return null;
    Object.assign(product, updates);
    return product;
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
    const newOrder = {
      id: `ord-${Date.now().toString().slice(-4)}`,
      orderNumber: `MM-ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      userId: orderData.userId,
      userFullName: orderData.userFullName,
      userEmail: orderData.userEmail,
      orderType: orderData.orderType || 'RETAIL',
      status: 'PENDING',
      items: orderData.items,
      totalAmount: orderData.totalAmount,
      discountAmount: orderData.discountAmount || 0,
      payableAmount: orderData.payableAmount,
      paymentStatus: 'PAID', // Simulated instant checkout
      paymentMethod: orderData.paymentMethod || 'ONLINE_GATEWAY',
      shippingAddress: orderData.shippingAddress,
      createdAt: new Date().toISOString()
    };
    this.orders.unshift(newOrder);
    return newOrder;
  }

  updateOrderStatus(orderId, status) {
    const order = this.findOrderById(orderId);
    if (!order) return null;
    order.status = status;
    return order;
  }
}

export const db = new DataStore();
