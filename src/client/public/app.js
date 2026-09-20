/**
 * Manto Moda — Client Application Controller
 * Handles Navigation, State, Catalog, RBAC Role Swapping, Cart, Orders & Admin Portal
 */

// Application State
const state = {
  currentUser: null,
  token: null,
  products: [],
  categories: [],
  cart: JSON.parse(localStorage.getItem('mm_cart') || '[]'),
  cartCalculation: null,
  activeCategory: 'ALL',
  activeSeason: '',
  activeSort: 'featured',
  searchQuery: '',
  currentView: 'catalog',
  activeAdminTab: 'wholesale',
  couponCode: sessionStorage.getItem('mm_coupon') || '',
  selectedProduct: null,
  // Catalog pagination (ADR-014). The grid renders the first page and appends
  // more on demand, so the first paint stays small on mobile connections.
  productPage: 1,
  productMeta: { page: 1, limit: 12, total: 0, totalPages: 1, hasMore: false },
  productsLoading: false
};

// Helper: Format Iranian Rial / Tomans into Persian Numbers
function formatPrice(amount) {
  if (amount === undefined || amount === null) return '';
  const formatted = new Intl.NumberFormat('fa-IR').format(amount);
  return `${formatted} تومان`;
}

function toPersianDigits(n) {
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.toString().replace(/\d/g, (x) => farsiDigits[x]);
}

// Helper: API Client with Auth headers (Enforces cryptographic JWT only, zero header spoofing)
async function apiFetch(url, options = {}) {
  // FormData uploads must let the browser set the multipart boundary itself:
  // sending a fixed application/json header would break the upload.
  const isFormData = options.isFormData === true || options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}),
    ...options.headers
  };

  const { isFormData: _ignored, ...fetchOptions } = options;

  try {
    const res = await fetch(url, { ...fetchOptions, headers });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('API Fetch Error:', error);
    showToast('خطا در برقراری ارتباط با سرور', 'error');
    return { success: false, error: 'NETWORK_ERROR' };
  }
}

// Helper: Toast Notifications
/**
 * Escape a value before it is interpolated into an HTML template.
 * Product titles come from the admin panel and end up in attributes (alt,
 * aria-label), so an unescaped quote would break the markup.
 */
function escapeAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-emerald-600 text-white' :
                  type === 'error' ? 'bg-rose-600 text-white' :
                  'bg-slate-900 text-white';

  toast.className = `${bgClass} text-xs px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 transition transform translate-y-2 pointer-events-auto border border-white/10`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Navigation Handler
function navigate(viewName) {
  state.currentView = viewName;

  // Views
  document.getElementById('view-catalog').classList.toggle('hidden', viewName !== 'catalog');
  document.getElementById('hero-banner').classList.toggle('hidden', viewName !== 'catalog');
  document.getElementById('view-wholesale').classList.toggle('hidden', viewName !== 'wholesale');
  document.getElementById('view-orders').classList.toggle('hidden', viewName !== 'orders');
  document.getElementById('view-admin').classList.toggle('hidden', viewName !== 'admin');
  document.getElementById('view-payment-result')?.classList.toggle('hidden', viewName !== 'payment-result');

  // Nav Buttons active highlight
  ['catalog', 'wholesale', 'orders', 'admin'].forEach(tab => {
    const btn = document.getElementById(`nav-${tab}`);
    if (btn) {
      if (tab === viewName) {
        btn.classList.add('bg-brand-50', 'text-brand-700', 'font-bold');
      } else {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'font-bold');
      }
    }
  });

  if (viewName === 'catalog') {
    fetchProducts();
  } else if (viewName === 'wholesale') {
    checkWholesaleStatus();
  } else if (viewName === 'orders') {
    fetchOrders();
  } else if (viewName === 'admin') {
    if (state.currentUser?.role !== 'ADMIN') {
      showToast('دسترسی به پنل مدیریت فقط برای کاربر مدیر مجاز است.', 'error');
      navigate('catalog');
      return;
    }
    loadAdminDashboard();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToProducts() {
  const el = document.getElementById('products-grid');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// Role Switcher Simulator
async function setupRoleSwitcher() {
  const select = document.getElementById('role-switcher-select');
  select.addEventListener('change', async (e) => {
    const targetRole = e.target.value;
    const res = await apiFetch('/api/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ targetRole })
    });

    if (res.success) {
      state.token = res.data.token;
      state.currentUser = res.data.user;
      updateUserProfileUI();
      showToast(res.message, 'success');
      
      // Refresh current active view
      if (state.currentView === 'admin' && state.currentUser?.role !== 'ADMIN') {
        navigate('catalog');
      } else {
        navigate(state.currentView);
      }
      recalculateCart();
    }
  });
}

function updateUserProfileUI() {
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-role-label');
  const avatarEl = document.getElementById('user-avatar-initial');
  const adminNav = document.getElementById('nav-admin');
  const adminNavMobile = document.getElementById('nav-admin-mobile');
  const wholesaleBanner = document.getElementById('wholesale-active-banner');

  if (!state.currentUser) {
    nameEl.textContent = 'کاربر مهمان';
    roleEl.textContent = 'ورود / ثبت‌نام';
    avatarEl.textContent = 'م';
    if (adminNav) adminNav.classList.add('hidden');
    if (adminNavMobile) adminNavMobile.classList.add('hidden');
    if (wholesaleBanner) wholesaleBanner.classList.add('hidden');
    return;
  }

  nameEl.textContent = state.currentUser.fullName || state.currentUser.email;
  avatarEl.textContent = (state.currentUser.fullName || 'ک')[0];

  const isWholesale = state.currentUser.role === 'WHOLESALE' && state.currentUser.isWholesaleVerified;
  const isAdmin = state.currentUser.role === 'ADMIN';

  if (isAdmin) {
    roleEl.textContent = '👑 مدیر ارشد سیستم';
    roleEl.className = 'text-[10px] text-purple-600 font-bold';
    if (adminNav) adminNav.classList.remove('hidden');
    if (adminNavMobile) adminNavMobile.classList.remove('hidden');
    if (wholesaleBanner) wholesaleBanner.classList.remove('hidden');
  } else if (isWholesale) {
    roleEl.textContent = '💼 خریدار عمده تاییدشده';
    roleEl.className = 'text-[10px] text-amber-600 font-bold';
    if (adminNav) adminNav.classList.add('hidden');
    if (adminNavMobile) adminNavMobile.classList.add('hidden');
    if (wholesaleBanner) wholesaleBanner.classList.remove('hidden');
  } else {
    roleEl.textContent = '🛍️ مشتری خرده‌فروشی';
    roleEl.className = 'text-[10px] text-slate-500 font-medium';
    if (adminNav) adminNav.classList.add('hidden');
    if (adminNavMobile) adminNavMobile.classList.add('hidden');
    if (wholesaleBanner) wholesaleBanner.classList.add('hidden');
  }
}

// Fetch Categories & Products
async function fetchCategories() {
  const res = await apiFetch('/api/products/categories');
  if (res.success) {
    state.categories = res.data;
    renderCategoryPills();
  }
}

function renderCategoryPills() {
  const container = document.getElementById('category-pills');
  if (!container) return;

  const pillsHtml = state.categories.map(cat => `
    <button onclick="setCategoryFilter('${cat.id}')" id="pill-${cat.id}" class="category-pill px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition bg-slate-100 hover:bg-slate-200 text-slate-700">
      ${cat.name}
    </button>
  `).join('');

  container.innerHTML = `
    <button onclick="setCategoryFilter('ALL')" id="pill-ALL" class="category-pill active px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition bg-slate-900 text-white shadow-sm">
      همه محصولات
    </button>
    ${pillsHtml}
  `;
}

function setCategoryFilter(catId) {
  state.activeCategory = catId;
  document.querySelectorAll('.category-pill').forEach(el => el.classList.remove('active', 'bg-slate-900', 'text-white'));
  const activeBtn = document.getElementById(`pill-${catId}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-slate-900', 'text-white');
  }
  fetchProducts();
}

function applyFilters() {
  state.activeSeason = document.getElementById('season-filter').value;
  state.activeSort = document.getElementById('sort-filter').value;
  fetchProducts();
}

async function fetchProducts({ append = false } = {}) {
  if (state.productsLoading) return;
  state.productsLoading = true;

  if (!append) state.productPage = 1;

  let url = `/api/products?sort=${state.activeSort}&page=${state.productPage}&limit=${state.productMeta.limit || 12}`;
  if (state.activeCategory && state.activeCategory !== 'ALL') {
    url += `&category=${encodeURIComponent(state.activeCategory)}`;
  }
  if (state.activeSeason) {
    url += `&season=${encodeURIComponent(state.activeSeason)}`;
  }
  if (state.searchQuery) {
    url += `&search=${encodeURIComponent(state.searchQuery)}`;
  }

  try {
    const res = await apiFetch(url);
    if (res.success) {
      state.products = append ? [...state.products, ...res.data] : res.data;
      state.productMeta = res.meta || state.productMeta;
      renderProductsGrid();
      renderLoadMore();
    }
  } finally {
    state.productsLoading = false;
  }
}

function loadMoreProducts() {
  if (!state.productMeta.hasMore) return;
  state.productPage += 1;
  fetchProducts({ append: true });
}

/** "Load more" control + result counter under the grid. */
function renderLoadMore() {
  const container = document.getElementById('load-more-container');
  if (!container) return;

  const { total, hasMore } = state.productMeta || {};
  const shown = state.products.length;

  if (!total) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col items-center gap-3 pt-2">
      <p class="text-xs text-slate-500">
        نمایش <span class="font-bold text-slate-700">${toPersianDigits(shown)}</span>
        از <span class="font-bold text-slate-700">${toPersianDigits(total)}</span> محصول
      </p>
      ${hasMore ? `
        <button type="button" onclick="loadMoreProducts()"
          class="px-6 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          نمایش محصولات بیشتر
        </button>
      ` : ''}
    </div>
  `;
}

function renderProductsGrid() {
  const grid = document.getElementById('products-grid');
  const empty = document.getElementById('products-empty');
  if (!grid) return;

  if (state.products.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  const isWholesale = state.currentUser?.role === 'ADMIN' || (state.currentUser?.role === 'WHOLESALE' && state.currentUser?.isWholesaleVerified);

  grid.innerHTML = state.products.map(product => {
    const hasWholesalePrice = product.wholesalePrice !== undefined;

    return `
      <div class="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition group flex flex-col">
        
        <!-- IMAGE & BADGES -->
        <div class="relative aspect-[3/4] bg-slate-100 overflow-hidden cursor-pointer" onclick="openProductModal('${product.id}')">
          <img src="${product.images[0]}" alt="${escapeAttr(product.title)}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
          <div class="absolute top-3 right-3 flex flex-col gap-1.5">
            ${product.isFeatured ? `<span class="bg-brand-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow">پیشنهاد ویژه</span>` : ''}
            <span class="bg-slate-900/80 backdrop-blur text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">${product.season}</span>
          </div>
          ${hasWholesalePrice ? `
            <div class="absolute bottom-3 left-3 right-3 bg-amber-500/95 backdrop-blur text-slate-950 font-black text-xs px-3 py-1.5 rounded-xl shadow-lg flex items-center justify-between">
              <span>قیمت خرید عمده:</span>
              <span class="font-mono text-sm">${formatPrice(product.wholesalePrice)}</span>
            </div>
          ` : ''}
        </div>

        <!-- PRODUCT DETAILS -->
        <div class="p-5 flex-grow flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>${product.category}</span>
              <span class="font-mono text-[11px]">${product.sku}</span>
            </div>
            <h3 class="font-bold text-slate-900 text-sm leading-snug mb-2">
              <a href="/product/${encodeURIComponent(product.slug || product.id)}"
                 data-product-link="${product.id}"
                 onclick="return handleProductLink(event, '${product.id}')"
                 class="hover:text-brand-600 transition-colors">
                ${product.title}
              </a>
            </h3>
            <p class="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">${product.material}</p>
          </div>

          <div>
            <!-- PRICING DISPLAY -->
            <div class="pt-3 border-t border-slate-100 flex items-end justify-between">
              <div>
                <span class="text-[10px] text-slate-400 block">${hasWholesalePrice ? 'قیمت تک‌فروشی:' : 'قیمت:'}</span>
                <span class="font-black ${hasWholesalePrice ? 'text-xs price-strike text-slate-500' : 'text-base text-brand-700'} font-mono">
                  ${formatPrice(product.retailPrice)}
                </span>
              </div>
              <button onclick="openProductModal('${product.id}')" class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-brand-600 text-white text-xs font-bold transition flex items-center gap-1">
                <span>انتخاب و سفارش</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    `;
  }).join('');
}

// Product Detail Modal
/**
 * Product links are real `<a href="/product/slug">` URLs so that search engines
 * and social previews work (ADR-015), while a normal click stays instantaneous
 * inside the SPA. Modified clicks (new tab) keep the browser's default behaviour.
 */
function handleProductLink(event, productId) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return true;
  event.preventDefault();
  openProductModal(productId);
  window.history.pushState({ productId }, '', `/product/${encodeURIComponent(productId)}`);
  return false;
}

function openProductModal(productId) {
  // Deep-link support: /product/:slug and ?product=slug open the modal directly
  // (the server pre-renders that URL for search engines — ADR-015).
  if (typeof productId === 'string' && !state.products.some(p => p.id === productId || p.slug === productId)) {
    const known = state.products.find(p => p.slug === productId || p.id === productId);
    if (!known) {
      apiFetch(`/api/products/${encodeURIComponent(productId)}`).then((res) => {
        if (res.success) {
          state.products = [res.data, ...state.products.filter(p => p.id !== res.data.id)];
          openProductModal(res.data.id);
        } else {
          showToast('محصول مورد نظر یافت نشد.', 'error');
        }
      });
      return;
    }
  }

  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  state.selectedProduct = {
    ...product,
    selectedVariant: product.variants[0],
    selectedQuantity: (product.wholesalePrice !== undefined && state.currentUser?.role === 'WHOLESALE') ? (product.wholesaleMinQuantity || 6) : 1
  };

  const modal = document.getElementById('product-modal');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  renderModalContent();
  modal.classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('product-modal')?.classList.add('hidden');
}

function renderModalContent() {
  const p = state.selectedProduct;
  const content = document.getElementById('modal-content');
  const isWholesale = p.wholesalePrice !== undefined;

  content.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
      
      <!-- IMAGE GALLERY -->
      <div class="space-y-3">
        <div class="aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
          <img id="modal-main-img" src="${p.images[0]}" alt="${escapeAttr(p.title)} - تصویر اصلی" class="w-full h-full object-cover">
        </div>
        ${p.images.length > 1 ? `
          <div class="flex gap-2">
            ${p.images.map((img, idx) => `
              <img src="${img}" alt="${escapeAttr(p.title)} - تصویر ${index + 1}" role="button" tabindex="0" aria-label="نمایش تصویر ${index + 1} از ${escapeAttr(p.title)}" onclick="document.getElementById('modal-main-img').src='${img}'" class="w-16 h-20 object-cover rounded-xl border border-slate-200 cursor-pointer hover:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            `).join('')}
          </div>
        ` : ''}
      </div>

      <!-- DETAILS & VARIANT SELECTOR -->
      <div class="flex flex-col justify-between">
        <div>
          <span class="text-xs text-brand-600 font-bold bg-brand-50 px-2 py-0.5 rounded">${p.category}</span>
          <h2 class="text-lg font-black text-slate-900 mt-2 mb-1">${p.title}</h2>
          <div class="text-xs text-slate-500 mb-4 font-mono">کد محصول: ${p.sku} | جنس: ${p.material}</div>
          <p class="text-xs text-slate-600 leading-relaxed mb-4">${p.description}</p>

          <!-- COLOR VARIANTS -->
          <div class="mb-4">
            <label class="block text-xs font-bold text-slate-700 mb-2">رنگ انتخابی:</label>
            <div class="flex flex-wrap gap-2">
              ${p.variants.map(v => `
                <button onclick="selectVariant('${v.id}')" class="px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${state.selectedProduct.selectedVariant?.id === v.id ? 'border-brand-600 bg-brand-50 text-brand-700 font-bold ring-1 ring-brand-500' : 'border-slate-200 bg-white text-slate-700'}">
                  <span class="w-3 h-3 rounded-full border border-black/20" style="background-color: ${v.colorHex || '#000'}"></span>
                  <span>${v.color} (سایز ${v.size})</span>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- QUANTITY -->
          <div class="mb-6">
            <div class="flex justify-between items-center mb-1.5">
              <label class="text-xs font-bold text-slate-700">تعداد سفارش:</label>
              ${isWholesale ? `<span class="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">حداقل عمده: ${p.wholesaleMinQuantity || 6} عدد</span>` : ''}
            </div>
            <div class="flex items-center gap-3">
              <button onclick="updateModalQuantity(-1)" class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">-</button>
              <input type="number" id="modal-qty-input" value="${state.selectedProduct.selectedQuantity}" min="1" onchange="state.selectedProduct.selectedQuantity = Math.max(1, parseInt(this.value)||1)" class="w-16 text-center bg-slate-50 border border-slate-200 rounded-xl py-1.5 text-sm font-bold font-mono">
              <button onclick="updateModalQuantity(1)" class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">+</button>
            </div>
          </div>
        </div>

        <!-- PRICE & ADD TO CART -->
        <div class="pt-4 border-t border-slate-100 space-y-3">
          <div class="flex justify-between items-baseline">
            <span class="text-xs text-slate-500">قیمت واحد:</span>
            <div class="text-left">
              ${isWholesale ? `
                <div class="text-xs price-strike text-slate-400 font-mono">${formatPrice(p.retailPrice)}</div>
                <div class="text-lg font-black text-amber-600 font-mono">${formatPrice(p.wholesalePrice)} <span class="text-xs font-normal text-slate-500">(عمده)</span></div>
              ` : `
                <div class="text-lg font-black text-brand-700 font-mono">${formatPrice(p.retailPrice)}</div>
              `}
            </div>
          </div>

          <button onclick="addToCartFromModal()" class="w-full py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-lg shadow-brand-600/30 transition flex items-center justify-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
            <span>افزودن به سبد خرید</span>
          </button>
        </div>

      </div>

    </div>
  `;
}

function selectVariant(variantId) {
  const variant = state.selectedProduct.variants.find(v => v.id === variantId);
  if (variant) {
    state.selectedProduct.selectedVariant = variant;
    renderModalContent();
  }
}

function updateModalQuantity(delta) {
  const newQty = Math.max(1, state.selectedProduct.selectedQuantity + delta);
  state.selectedProduct.selectedQuantity = newQty;
  const input = document.getElementById('modal-qty-input');
  if (input) input.value = newQty;
}

// Cart System & Live Backend Validation
async function addToCartFromModal() {
  const p = state.selectedProduct;
  const variant = p.selectedVariant || p.variants[0];
  const qty = state.selectedProduct.selectedQuantity || 1;

  const existingIdx = state.cart.findIndex(i => i.productId === p.id && i.variantId === variant.id);
  if (existingIdx > -1) {
    state.cart[existingIdx].quantity += qty;
  } else {
    state.cart.push({
      productId: p.id,
      variantId: variant.id,
      quantity: qty
    });
  }

  saveCart();
  closeProductModal();
  showToast(`«${p.title}» به سبد خرید اضافه شد.`, 'success');
  await recalculateCart();
  toggleCartDrawer(true);
}

function saveCart() {
  localStorage.setItem('mm_cart', JSON.stringify(state.cart));
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  if (badge) {
    badge.textContent = toPersianDigits(count);
    badge.classList.toggle('hidden', count === 0);
  }
}

function toggleCartDrawer(forceOpen = null) {
  const drawer = document.getElementById('cart-drawer');
  const overlay = document.getElementById('cart-drawer-overlay');
  if (!drawer || !overlay) return;

  const isOpen = !drawer.classList.contains('-translate-x-full');
  const shouldOpen = forceOpen !== null ? forceOpen : !isOpen;

  if (shouldOpen) {
    drawer.classList.remove('-translate-x-full');
    overlay.classList.remove('hidden');
    recalculateCart();
  } else {
    drawer.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }
}

async function recalculateCart() {
  if (state.cart.length === 0) {
    state.cartCalculation = null;
    renderCartUI();
    return;
  }

  const res = await apiFetch('/api/cart/calculate', {
    method: 'POST',
    body: JSON.stringify({
      items: state.cart,
      couponCode: state.couponCode || undefined,
      // The shipping tariff depends on the destination province, so the cart
      // asks for it as soon as the customer has entered one.
      shippingAddress: { province: state.checkoutProvince || '' }
    })
  });

  if (res.success) {
    state.cartCalculation = res.data;
    renderCartUI();
  }
}

/**
 * Applies a coupon locally then re-asks the server, which is the only authority
 * on whether the code is valid for this basket (ADR-018).
 */
async function applyCouponCode() {
  const input = document.getElementById('cart-coupon-input');
  const code = (input?.value || '').trim().toUpperCase();
  const messageEl = document.getElementById('cart-coupon-message');

  if (!code) {
    state.couponCode = '';
    sessionStorage.removeItem('mm_coupon');
    if (messageEl) messageEl.classList.add('hidden');
    return recalculateCart();
  }

  state.couponCode = code;
  sessionStorage.setItem('mm_coupon', code);

  await recalculateCart();

  const coupon = state.cartCalculation?.coupon;
  if (messageEl && coupon) {
    messageEl.textContent = coupon.message || '';
    messageEl.className = `text-[11px] mt-1.5 ${coupon.applied ? 'text-emerald-700' : 'text-rose-600'}`;
    messageEl.classList.remove('hidden');
  }

  if (coupon && !coupon.applied) {
    state.couponCode = '';
    sessionStorage.removeItem('mm_coupon');
  }
}

function clearCoupon() {
  state.couponCode = '';
  sessionStorage.removeItem('mm_coupon');
  const input = document.getElementById('cart-coupon-input');
  if (input) input.value = '';
  const messageEl = document.getElementById('cart-coupon-message');
  if (messageEl) messageEl.classList.add('hidden');
  recalculateCart();
}

function renderCartUI() {
  const list = document.getElementById('cart-items-list');
  const notices = document.getElementById('cart-notices-container');
  const subtotalEl = document.getElementById('cart-subtotal');
  const savingsRow = document.getElementById('cart-savings-row');
  const savingsEl = document.getElementById('cart-savings');
  const shippingEl = document.getElementById('cart-shipping');
  const payableEl = document.getElementById('cart-payable');
  const discountRow = document.getElementById('cart-discount-row');
  const discountEl = document.getElementById('cart-discount');
  const couponCodeEl = document.getElementById('cart-coupon-code');
  const couponInput = document.getElementById('cart-coupon-input');
  const checkoutBtn = document.getElementById('cart-checkout-btn');

  if (!list) return;

  if (!state.cartCalculation || state.cartCalculation.items.length === 0) {
    list.innerHTML = `
      <div class="text-center py-12 text-slate-400 space-y-3">
        <svg class="w-12 h-12 mx-auto text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
        <p class="text-xs font-bold text-slate-500">سبد خرید شما در حال حاضر خالی است.</p>
      </div>
    `;
    if (notices) notices.innerHTML = '';
    subtotalEl.textContent = '۰ تومان';
    if (savingsRow) savingsRow.classList.add('hidden');
    shippingEl.textContent = 'رایگان';
    payableEl.textContent = '۰ تومان';
    if (checkoutBtn) checkoutBtn.disabled = true;
    return;
  }

  if (checkoutBtn) checkoutBtn.disabled = false;

  const data = state.cartCalculation;

  // Render Items
  list.innerHTML = data.items.map(item => `
    <div class="pt-3 pb-3 flex gap-3">
      <img src="${item.productImage}" alt="${escapeAttr(item.productTitle)}" class="w-16 h-20 object-cover rounded-xl border border-slate-200">
      <div class="flex-grow flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start">
            <h4 class="font-bold text-xs text-slate-900 leading-snug">${item.productTitle}</h4>
            <button onclick="removeCartItem('${item.productId}', '${item.variantId}')" class="text-slate-400 hover:text-rose-600 text-xs px-1">✕</button>
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5">رنگ: ${item.color} | سایز: ${item.size}</div>
          ${item.isWholesalePriceApplied ? `
            <span class="inline-block mt-1 bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded">نرخ عمده اعمال شد</span>
          ` : ''}
        </div>

        <div class="flex justify-between items-center mt-2">
          <div class="flex items-center gap-2">
            <button onclick="updateCartItemQty('${item.productId}', '${item.variantId}', -1)" class="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">-</button>
            <span class="text-xs font-mono font-bold w-6 text-center">${toPersianDigits(item.quantity)}</span>
            <button onclick="updateCartItemQty('${item.productId}', '${item.variantId}', 1)" class="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">+</button>
          </div>
          <span class="font-bold font-mono text-xs text-slate-900">${formatPrice(item.itemTotal)}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Wholesale notices
  if (notices) {
    if (data.wholesaleNotices && data.wholesaleNotices.length > 0) {
      notices.innerHTML = data.wholesaleNotices.map(n => `
        <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
          ⚠️ ${n.message}
        </div>
      `).join('');
    } else {
      notices.innerHTML = '';
    }
  }

  // Summary
  subtotalEl.textContent = formatPrice(data.subtotal);
  if (data.totalSavings > 0) {
    if (savingsRow) savingsRow.classList.remove('hidden');
    savingsEl.textContent = formatPrice(data.totalSavings);
  } else {
    if (savingsRow) savingsRow.classList.add('hidden');
  }

  shippingEl.textContent = data.shippingFee === 0
    ? (data.shipping?.isFree ? 'رایگان ✓' : 'رایگان')
    : formatPrice(data.shippingFee);

  if (data.shipping?.description) shippingEl.title = data.shipping.description;

  // Discount row: only visible when a coupon actually reduced the basket.
  if (discountRow && discountEl) {
    if (data.discountAmount > 0) {
      discountRow.classList.remove('hidden');
      discountRow.classList.add('flex');
      discountEl.textContent = `− ${formatPrice(data.discountAmount)}`;
      if (couponCodeEl) couponCodeEl.textContent = data.coupon?.code ? `(${data.coupon.code})` : '';
    } else {
      discountRow.classList.add('hidden');
    }
  }

  if (couponInput && !couponInput.value && state.couponCode) couponInput.value = state.couponCode;

  payableEl.textContent = formatPrice(data.payableAmount);
}

function updateCartItemQty(productId, variantId, delta) {
  const item = state.cart.find(i => i.productId === productId && i.variantId === variantId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter(i => !(i.productId === productId && i.variantId === variantId));
  }
  saveCart();
  recalculateCart();
}

function removeCartItem(productId, variantId) {
  state.cart = state.cart.filter(i => !(i.productId === productId && i.variantId === variantId));
  saveCart();
  recalculateCart();
}

// Checkout & Order Submission
function openCheckoutModal() {
  if (state.cart.length === 0) {
    showToast('سبد خرید شما خالی است.', 'error');
    return;
  }
  toggleCartDrawer(false);

  // Pre-fill user data if available
  if (state.currentUser) {
    document.getElementById('chk-name').value = state.currentUser.fullName || '';
    document.getElementById('chk-phone').value = state.currentUser.phone || '';
  }

  document.getElementById('checkout-form-container').classList.remove('hidden');
  document.getElementById('checkout-success').classList.add('hidden');
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal')?.classList.add('hidden');
}

async function submitOrder(e) {
  e.preventDefault();

  const recipientName = document.getElementById('chk-name').value;
  const phone = document.getElementById('chk-phone').value;
  const province = document.getElementById('chk-province').value;
  const city = document.getElementById('chk-city').value;
  const fullAddress = document.getElementById('chk-address').value;
  const postalCode = document.getElementById('chk-postal').value;
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'ONLINE_GATEWAY';

  const orderPayload = {
    items: state.cart,
    shippingAddress: { recipientName, phone, province, city, fullAddress, postalCode },
    paymentMethod,
    // The coupon is re-validated server-side; a stale or invented code fails the
    // checkout with a clear message rather than silently charging full price.
    ...(state.couponCode ? { couponCode: state.couponCode } : {})
  };

  const res = await apiFetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload)
  });

  if (res.success) {
    state.cart = [];
    saveCart();
    state.cartCalculation = null;
    state.couponCode = '';
    sessionStorage.removeItem('mm_coupon');

    const order = res.data;

    // Online orders must actually be paid: ask the backend for a gateway link.
    if (order.paymentMethod === 'ONLINE_GATEWAY' && order.paymentStatus !== 'PAID') {
      const payRes = await apiFetch('/api/payments/request', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id })
      });

      if (payRes.success && payRes.data?.paymentUrl) {
        showToast('در حال انتقال به درگاه پرداخت…', 'info');
        window.location.href = payRes.data.paymentUrl;
        return;
      }

      showToast(payRes.message || 'ایجاد لینک پرداخت ناموفق بود.', 'error');
      // Fall through to the receipt so the order is never lost from the UI.
    }

    document.getElementById('checkout-form-container').classList.add('hidden');
    document.getElementById('checkout-success').classList.remove('hidden');
    document.getElementById('confirmed-order-number').textContent = order.orderNumber;

    const paymentNote = document.getElementById('confirmed-payment-note');
    if (paymentNote) {
      if (order.paymentStatus === 'PAID') {
        paymentNote.textContent = 'پرداخت این سفارش تأیید شده است.';
      } else if (order.paymentMethod === 'BANK_TRANSFER_RECEIPT') {
        paymentNote.textContent = 'این سفارش در انتظار بررسی فیش بانکی توسط پشتیبانی است.';
      } else {
        paymentNote.textContent = 'این سفارش در انتظار پرداخت است.';
      }
    }

    showToast('سفارش شما با موفقیت ثبت شد.', 'success');
  } else {
    showToast(res.message || 'خطا در ثبت سفارش', 'error');
  }
}

// ---------------------------------------------------------------------------
// Payment result screen: the PSP redirects back to /?payment=success|failed
// ---------------------------------------------------------------------------
function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('payment');
  if (!result) return false;

  const orderNumber = params.get('order') || '';
  const refId = params.get('ref') || '';

  const success = result === 'success';
  const html = `
    <div class="max-w-lg mx-auto bg-white p-8 rounded-3xl border ${success ? 'border-emerald-200' : 'border-rose-200'} shadow-sm text-center space-y-4">
      <div class="text-5xl">${success ? '✅' : '⚠️'}</div>
      <h2 class="text-xl font-black ${success ? 'text-emerald-700' : 'text-rose-700'}">
        ${success ? 'پرداخت با موفقیت انجام شد' : 'پرداخت انجام نشد'}
      </h2>
      ${orderNumber ? `<p class="text-sm text-slate-600">شماره سفارش: <span class="font-mono font-bold">${orderNumber}</span></p>` : ''}
      ${refId ? `<p class="text-xs text-slate-500">کد پیگیری پرداخت: <span class="font-mono">${refId}</span></p>` : ''}
      <p class="text-xs text-slate-500">
        ${success ? 'سفارش شما ثبت شد و در حال آماده‌سازی است.' : 'مبلغی از حساب شما کسر نشده است. می‌توانید مجدداً تلاش کنید.'}
      </p>
      <div class="flex gap-2 justify-center pt-2">
        <button onclick="navigate('orders')" class="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold">سفارش‌های من</button>
        <button onclick="navigate('catalog')" class="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">ادامه خرید</button>
      </div>
    </div>
  `;

  // Render into the dedicated result view (all other views stay untouched).
  document.querySelectorAll('#view-catalog, #view-wholesale, #view-orders, #view-admin')
    .forEach(el => el.classList.add('hidden'));
  document.getElementById('hero-banner')?.classList.add('hidden');

  const view = document.getElementById('view-payment-result');
  const container = document.getElementById('payment-result-container');
  if (view && container) {
    container.innerHTML = html;
    view.classList.remove('hidden');
  } else {
    document.body.insertAdjacentHTML('afterbegin', html);
  }

  window.history.replaceState({}, '', window.location.pathname);
  return true;
}

// User Orders View
async function fetchOrders() {
  const container = document.getElementById('orders-list-container');
  if (!container) return;

  const res = await apiFetch('/api/orders/my-orders');
  if (res.success) {
    if (res.data.length === 0) {
      container.innerHTML = `
        <div class="bg-white p-12 text-center rounded-3xl border border-slate-200 text-slate-400 space-y-2">
          <p class="font-bold text-slate-600">هنوز سفارشی ثبت نکرده‌اید.</p>
          <button onclick="navigate('catalog')" class="text-xs px-4 py-2 rounded-xl bg-slate-900 text-white font-bold">مشاهده کاتالوگ و خرید</button>
        </div>
      `;
      return;
    }

    container.innerHTML = res.data.map(order => `
      <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div class="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-slate-100">
          <div>
            <span class="text-xs text-slate-400 font-mono">شناسه سفارش: ${order.orderNumber}</span>
            <div class="font-bold text-sm text-slate-900 mt-0.5">نوع سفارش: ${order.orderType === 'WHOLESALE' ? '💼 عمده‌فروشی' : '🛍️ خرده‌فروشی'}</div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 rounded-full text-xs font-bold ${getOrderStatusBadge(order.status)}">${translateOrderStatus(order.status)}</span>
            <span class="text-xs text-slate-400">${new Date(order.createdAt).toLocaleDateString('fa-IR')}</span>
          </div>
        </div>

        <div class="space-y-2">
          ${order.items.map(item => `
            <div class="flex justify-between items-center text-xs py-1">
              <div>
                <span class="font-bold text-slate-800">${item.productTitle}</span>
                <span class="text-slate-400 mr-2">(${item.color} - سایز ${item.size}) × ${toPersianDigits(item.quantity)}</span>
              </div>
              <span class="font-mono font-bold text-slate-700">${formatPrice(item.totalPrice)}</span>
            </div>
          `).join('')}
        </div>

        <div class="pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
          <span class="text-slate-500">نشانی تحویل: ${order.shippingAddress?.city}، ${order.shippingAddress?.fullAddress}</span>
          <div class="text-right">
            <span class="text-slate-400 text-[11px] block">مبلغ پرداختی:</span>
            <span class="text-sm font-black text-brand-700 font-mono">${formatPrice(order.payableAmount)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }
}

function getOrderStatusBadge(status) {
  switch (status) {
    case 'PENDING': return 'bg-amber-100 text-amber-800';
    case 'CONFIRMED': return 'bg-blue-100 text-blue-800';
    case 'PROCESSING': return 'bg-purple-100 text-purple-800';
    case 'SHIPPED': return 'bg-indigo-100 text-indigo-800';
    case 'DELIVERED': return 'bg-emerald-100 text-emerald-800';
    case 'CANCELLED': return 'bg-rose-100 text-rose-800';
    default: return 'bg-slate-100 text-slate-800';
  }
}

function translateOrderStatus(status) {
  const map = {
    'PENDING': 'در انتظار تایید',
    'CONFIRMED': 'تایید شده',
    'PROCESSING': 'در حال آماده‌سازی و بسته‌بندی',
    'SHIPPED': 'تحویل باربری / پست شده',
    'DELIVERED': 'تحویل گردید',
    'CANCELLED': 'لغو شده'
  };
  return map[status] || status;
}

// Wholesale Application Flow
async function checkWholesaleStatus() {
  const statusCard = document.getElementById('wholesale-status-card');
  const formWrapper = document.getElementById('wholesale-form-wrapper');

  if (!state.currentUser) {
    if (statusCard) statusCard.classList.add('hidden');
    if (formWrapper) formWrapper.classList.remove('hidden');
    return;
  }

  const res = await apiFetch('/api/wholesale/my-application');
  if (res.success && res.data.hasApplication) {
    const app = res.data.application;
    statusCard.classList.remove('hidden');

    if (app.status === 'APPROVED') {
      statusCard.className = 'mb-6 p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900';
      statusCard.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">✓</div>
          <div>
            <h4 class="font-bold text-sm">حساب عمده‌فروشی شما تایید شده است</h4>
            <p class="text-xs text-emerald-700 mt-0.5">شما می‌توانید با مراجعه به کاتالوگ، کلیه اقلام را با نرخ ویژه تولیدی و تخفیف همکار سفارش دهید.</p>
          </div>
        </div>
      `;
      formWrapper.classList.add('hidden');
    } else if (app.status === 'PENDING') {
      statusCard.className = 'mb-6 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900';
      statusCard.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-lg">⏳</div>
          <div>
            <h4 class="font-bold text-sm">درخواست شما در دست بررسی کارشناسان مدا است</h4>
            <p class="text-xs text-amber-700 mt-0.5">اطلاعات کسب‌وکار (${app.companyName}) با موفقیت ثبت شد. تایید مدارک معمولاً ظرف ۲۴ ساعت کاری انجام می‌شود.</p>
          </div>
        </div>
      `;
      formWrapper.classList.add('hidden');
    } else if (app.status === 'REJECTED') {
      statusCard.className = 'mb-6 p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900';
      statusCard.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-lg">✕</div>
          <div>
            <h4 class="font-bold text-sm">درخواست همکاری عمده تایید نگردید</h4>
            <p class="text-xs text-rose-700 mt-0.5">${app.adminNotes || 'مدارک ارائه‌شده ناقص می‌باشد. می‌توانید مجدداً اقدام نمایید.'}</p>
          </div>
        </div>
      `;
      formWrapper.classList.remove('hidden');
    }
  } else {
    statusCard.classList.add('hidden');
    formWrapper.classList.remove('hidden');
  }
}

async function submitWholesaleForm(e) {
  e.preventDefault();

  const payload = {
    companyName: document.getElementById('ws-company-name').value,
    economicCode: document.getElementById('ws-economic-code').value,
    province: document.getElementById('ws-province').value,
    city: document.getElementById('ws-city').value,
    businessPhone: document.getElementById('ws-business-phone').value,
    storeType: document.getElementById('ws-store-type').value,
    businessAddress: document.getElementById('ws-business-address').value
  };

  const res = await apiFetch('/api/wholesale/apply', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (res.success) {
    showToast(res.message, 'success');
    checkWholesaleStatus();
  } else {
    showToast(res.message || 'خطا در ثبت درخواست', 'error');
  }
}

// Admin Dashboard Logic
const ADMIN_TABS = ['wholesale', 'orders', 'products', 'inventory', 'coupons', 'settings', 'audit'];

function switchAdminTab(tab) {
  state.activeAdminTab = tab;

  for (const t of ADMIN_TABS) {
    const panel = document.getElementById(`admin-tab-${t}`);
    if (panel) panel.classList.toggle('hidden', t !== tab);
  }
  // The dashboard is always visible above the tabs.
  document.getElementById('admin-dashboard')?.classList.remove('hidden');

  ADMIN_TABS.forEach(t => {
    const btn = document.getElementById(`admin-tab-btn-${t}`);
    if (btn) {
      if (t === tab) {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-purple-600 text-white shadow';
      } else {
        btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });

  if (tab === 'wholesale') loadAdminWholesale();
  if (tab === 'orders') loadAdminOrders();
  if (tab === 'products') loadAdminProducts();
  if (tab === 'inventory') loadLowStock();
  if (tab === 'coupons') loadCoupons();
  if (tab === 'settings') loadSettings();
  if (tab === 'audit') loadAuditLog();
}

async function loadAdminWholesale() {
  const container = document.getElementById('admin-applications-table');
  const res = await apiFetch('/api/admin/wholesale/applications');

  if (res.success) {
    if (res.data.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">هیچ درخواستی ثبت نشده است.</p>';
      return;
    }

    container.innerHTML = res.data.map(app => `
      <div class="p-5 rounded-2xl border ${app.status === 'PENDING' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50'} space-y-3">
        <div class="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h4 class="font-bold text-sm text-slate-900">${app.companyName} <span class="text-xs text-slate-500">(${app.userFullName})</span></h4>
            <div class="text-xs text-slate-500 mt-0.5">شهر: ${app.city} | تلفن: ${app.businessPhone} | شناسه اقتصادی: ${app.economicCode || 'ندارد'}</div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : app.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}">
            ${app.status === 'APPROVED' ? 'تایید شده' : app.status === 'PENDING' ? 'در انتظار بررسی' : 'رد شده'}
          </span>
        </div>
        <p class="text-xs text-slate-600">آدرس: ${app.businessAddress}</p>

        ${app.status === 'PENDING' ? `
          <div class="pt-2 border-t border-amber-200/60 flex items-center justify-end gap-2">
            <button onclick="reviewWholesaleApp('${app.id}', 'REJECTED')" class="px-3 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition">رد درخواست</button>
            <button onclick="reviewWholesaleApp('${app.id}', 'APPROVED')" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition">تایید و فعال‌سازی نقش عمده</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  }
}

async function reviewWholesaleApp(appId, status) {
  const notes = prompt(status === 'APPROVED' ? 'یادداشت تایید (اختیاری):' : 'دلیل رد درخواست (اختیاری):') || '';
  const res = await apiFetch(`/api/admin/wholesale/applications/${appId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, adminNotes: notes })
  });

  if (res.success) {
    showToast(res.message, 'success');
    loadAdminDashboard();
  } else {
    showToast(res.message || 'خطا در بررسی درخواست', 'error');
  }
}

async function loadAdminOrders(params = {}) {
  const container = document.getElementById('admin-orders-table');
  const controls = document.getElementById('admin-orders-controls');

  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);

  const res = await apiFetch(`/api/admin/orders?${query.toString()}`);

  if (controls) {
    controls.innerHTML = `
      <div class="flex flex-wrap items-end gap-2 mb-4">
        <label class="text-[11px] font-bold text-slate-600">جست‌وجو (شماره سفارش، نام، موبایل، شهر)
          <input id="order-search" value="${escapeAttr(params.search || '')}" aria-label="جست‌وجوی سفارش"
                 class="mt-1 block w-64 text-xs border border-slate-300 rounded-xl px-3 py-2 font-normal">
        </label>
        <label class="text-[11px] font-bold text-slate-600">وضعیت
          <select id="order-status-filter" aria-label="فیلتر وضعیت سفارش" class="mt-1 block text-xs border border-slate-300 rounded-xl px-3 py-2 font-normal">
            <option value="">همه</option>
            ${['PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED','CANCELLED'].map(st => `
              <option value="${st}" ${params.status === st ? 'selected' : ''}>${translateOrderStatus(st)}</option>`).join('')}
          </select>
        </label>
        <label class="text-[11px] font-bold text-slate-600">از تاریخ
          <input id="order-from" type="date" value="${escapeAttr(params.from || '')}" aria-label="از تاریخ" class="mt-1 block text-xs border border-slate-300 rounded-xl px-3 py-2 font-normal">
        </label>
        <label class="text-[11px] font-bold text-slate-600">تا تاریخ
          <input id="order-to" type="date" value="${escapeAttr(params.to || '')}" aria-label="تا تاریخ" class="mt-1 block text-xs border border-slate-300 rounded-xl px-3 py-2 font-normal">
        </label>
        <button type="button" onclick="applyOrderFilters()" class="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold">اعمال فیلتر</button>
        <button type="button" onclick="exportOrdersCsv()" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">خروجی اکسل (CSV)</button>
      </div>`;
  }

  if (res.success) {
    container.innerHTML = res.data.map(order => `
      <div class="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-sm">
        <div class="flex flex-wrap justify-between items-center gap-2">
          <div>
            <span class="font-mono text-xs font-bold text-slate-800">${order.orderNumber}</span>
            <div class="text-xs text-slate-600 mt-0.5">مشتری: ${order.userFullName} (${order.userEmail})</div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${getOrderStatusBadge(order.status)}">
              ${translateOrderStatus(order.status)}
            </span>
            <!-- Only the legal next steps are offered (ADR-011: the lifecycle is a
                 state machine, so the UI cannot even express an invalid jump). -->
            ${allowedTransitionsFor(order.status).map(next => `
              <button type="button"
                onclick="updateOrderStatusAdmin('${order.id}', '${next}')"
                class="text-[11px] font-bold px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                ${translateOrderStatus(next)}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="text-xs text-slate-600">
          اقلام: ${order.items.map(i => `${i.productTitle} (${i.quantity} عدد)`).join('، ')}
        </div>

        <div class="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span class="text-slate-500">
            نوع: ${order.orderType === 'WHOLESALE' ? 'عمده‌فروشی' : 'خرده‌فروشی'} | پرداخت: ${translatePaymentStatus(order.paymentStatus)}
            ${order.couponCode ? ` | کد تخفیف: <span class="font-mono font-bold">${escapeAttr(order.couponCode)}</span>` : ''}
          </span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="copyInvoiceLink('${order.id}')"
                    class="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-[11px] font-bold">لینک فاکتور</button>
            <a href="/api/orders/${order.id}/invoice-link" onclick="return false;" class="hidden" aria-hidden="true">—</a>
            <span class="font-bold font-mono text-slate-900">${formatPrice(order.payableAmount)}</span>
          </div>
        </div>

        ${renderOrderHistory(order)}${renderOrderNotifications(order)}
      </div>
    `).join('');
  }
}

function applyOrderFilters() {
  loadAdminOrders({
    search: document.getElementById('order-search')?.value.trim() || '',
    status: document.getElementById('order-status-filter')?.value || '',
    from: document.getElementById('order-from')?.value || '',
    to: document.getElementById('order-to')?.value || ''
  });
}

async function updateOrderStatusAdmin(orderId, status) {
  const res = await apiFetch(`/api/admin/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });

  if (res.success) {
    showToast(res.message, 'success');
  } else if (res.error === 'INVALID_STATUS_TRANSITION') {
    // The lifecycle is a state machine (ADR-011); tell the admin what IS allowed.
    const allowed = (res.allowedTransitions || []).join('، ') || 'بدون امکان تغییر';
    showToast(`${res.message} گذارهای مجاز: ${allowed}`, 'error');
  } else {
    showToast(res.message || 'خطا در تغییر وضعیت', 'error');
  }
}

/** Order status timeline (audit trail) for the admin order card. */
function renderOrderHistory(order) {
  if (!order.statusHistory || order.statusHistory.length === 0) return '';
  return `
    <details class="pt-2">
      <summary class="text-[11px] text-slate-500 cursor-pointer">تاریخچه تغییرات وضعیت (${toPersianDigits(order.statusHistory.length)})</summary>
      <ul class="mt-2 space-y-1 text-[11px] text-slate-500">
        ${order.statusHistory.map(h => `
          <li>• ${translateOrderStatus(h.status)} — ${new Date(h.at).toLocaleString('fa-IR')}${h.by ? ` — توسط ${h.by}` : ''}${h.note ? ` — ${h.note}` : ''}</li>
        `).join('')}
      </ul>
    </details>
  `;
}

async function loadAdminProducts() {
  const container = document.getElementById('admin-products-table');
  const res = await apiFetch('/api/admin/products');
  const filterBar = document.getElementById('admin-products-filter');

  if (res.success) {
    if (filterBar) {
      const counts = res.meta || {};
      filterBar.innerHTML = `
        <div class="flex items-center gap-2 text-[11px] mb-3">
          <button type="button" onclick="setProductFilter('all')" class="px-3 py-1.5 rounded-lg font-bold ${adminProductsFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}">
            همه (${toPersianDigits((counts.activeCount || 0) + (counts.archivedCount || 0))})
          </button>
          <button type="button" onclick="setProductFilter('active')" class="px-3 py-1.5 rounded-lg font-bold ${adminProductsFilter === 'active' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}">
            فعال (${toPersianDigits(counts.activeCount || 0)})
          </button>
          <button type="button" onclick="setProductFilter('archived')" class="px-3 py-1.5 rounded-lg font-bold ${adminProductsFilter === 'archived' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}">
            آرشیو (${toPersianDigits(counts.archivedCount || 0)})
          </button>
        </div>`;
    }

    const visible = adminProductsFilter === 'all'
      ? res.data
      : res.data.filter(p => (adminProductsFilter === 'archived' ? p.isArchived : !p.isArchived));

    if (visible.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400">محصولی در این فهرست نیست.</p>';
      return;
    }

    container.innerHTML = visible.map(p => `
      <div class="p-4 rounded-2xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3">
          <img src="${p.images[0]}" alt="${escapeAttr(p.title || 'تصویر محصول')}" class="w-12 h-16 object-cover rounded-xl border border-slate-200">
          <div>
            <h4 class="font-bold text-xs text-slate-900">
              ${escapeAttr(p.title)}
              ${p.isArchived ? '<span class="text-[10px] font-bold text-rose-600 mr-1">(آرشیو شده)</span>' : ''}
            </h4>
            <div class="text-[11px] text-slate-500 font-mono">${p.sku} | ${p.category}</div>
          </div>
        </div>
        <div class="flex items-center gap-6 text-xs">
          <div>
            <span class="text-slate-400 block text-[10px]">قیمت تک:</span>
            <span class="font-mono font-bold text-slate-800">${formatPrice(p.retailPrice)}</span>
          </div>
          <div>
            <span class="text-amber-600 block text-[10px]">قیمت عمده:</span>
            <span class="font-mono font-bold text-amber-700">${formatPrice(p.wholesalePrice)}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">موجودی کل:</span>
            <span class="font-mono font-bold ${totalStock(p) > 0 ? 'text-slate-800' : 'text-rose-600'}">${toPersianDigits(totalStock(p))}</span>
          </div>
        </div>

        <div class="flex items-center gap-2 text-[11px]">
          <button type="button" onclick="editProduct('${p.id}')"
                  class="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 font-bold hover:bg-slate-50">ویرایش</button>
          ${p.isArchived
            ? `<button type="button" onclick="restoreProduct('${p.id}')"
                       class="px-3 py-1.5 min-h-[36px] rounded-lg border border-emerald-200 text-emerald-700 font-bold">بازگرداندن به فروشگاه</button>`
            : `<button type="button" onclick="archiveProduct('${p.id}')"
                       class="px-3 py-1.5 min-h-[36px] rounded-lg border border-rose-200 text-rose-600 font-bold">برداشتن از فروشگاه</button>`}
        </div>

        <!-- Product image upload (ADR-013): the photo IS the product for a boutique -->
        <div class="w-full pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <label class="text-[11px] font-bold text-slate-600" for="upload-${p.id}">افزودن تصویر جدید:</label>
          <input type="file" id="upload-${p.id}" accept="image/jpeg,image/png,image/webp,image/avif"
                 aria-label="انتخاب تصویر جدید برای ${escapeAttr(p.title)}"
                 onchange="uploadProductImage('${p.id}', this)"
                 class="text-[11px] file:ml-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:text-[11px] file:font-bold">
          <span class="text-[11px] text-slate-400">
            تصاویر: ${toPersianDigits((p.images || []).length)} — فرمت‌های مجاز JPEG/PNG/WebP، حداکثر ۵ مگابایت
          </span>
        </div>
      </div>
    `).join('');
  }
}

/**
 * Mirrors the server-side state machine (ADR-011) so the admin UI never offers
 * an action the API would reject. The server remains the authority.
 */
const ORDER_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: []
};

function allowedTransitionsFor(status) {
  return ORDER_TRANSITIONS[status] || [];
}

function translatePaymentStatus(status) {
  return {
    PENDING: 'پرداخت‌نشده',
    PAID: 'پرداخت شده',
    FAILED: 'ناموفق',
    REFUNDED: 'بازگشت داده شده'
  }[status || 'PENDING'] || (status || 'پرداخت‌نشده');
}

/** Notification log for an order: did the customer actually get the SMS? */
function renderOrderNotifications(order) {
  if (!order.notifications || order.notifications.length === 0) return '';
  const failed = order.notifications.filter(n => !n.ok);
  return `
    <details class="pt-2">
      <summary class="text-[11px] text-slate-500 cursor-pointer">
        پیامک‌های ارسالی (${toPersianDigits(order.notifications.length)})
        ${failed.length ? `<span class="text-rose-600 font-bold">— ${toPersianDigits(failed.length)} ناموفق</span>` : ''}
      </summary>
      <ul class="mt-2 space-y-1 text-[11px] text-slate-500">
        ${order.notifications.slice().reverse().map(n => `
          <li class="${n.ok ? '' : 'text-rose-600'}">
            ${n.ok ? '✓' : '✗'} ${n.kind === 'OTP' ? 'کد ورود' : (n.status ? translateOrderStatus(n.status) : 'ثبت سفارش')}
            — ${new Date(n.at).toLocaleString('fa-IR')}${n.error ? ` — ${escapeAttr(n.error)}` : ''}
          </li>
        `).join('')}
      </ul>
    </details>
  `;
}

function setProductFilter(filter) {
  adminProductsFilter = filter;
  loadAdminProducts();
}

/** Total stock across all variants — the number an admin actually cares about. */
function totalStock(product) {
  return (product.variants || []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
}

/** Upload one image for a product and refresh the admin list. */
async function uploadProductImage(productId, inputEl) {
  const file = inputEl?.files?.[0];
  if (!file) return;

  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    showToast('حجم تصویر بیش از ۵ مگابایت است.', 'error');
    inputEl.value = '';
    return;
  }

  const form = new FormData();
  form.append('image', file);

  showToast('در حال بارگذاری تصویر…', 'info');

  try {
    const res = await apiFetch(`/api/admin/products/${productId}/images`, {
      method: 'POST',
      body: form,          // apiFetch must not set Content-Type for FormData
      isFormData: true
    });

    if (res.success) {
      showToast('تصویر با موفقیت بارگذاری شد.', 'success');
      await loadAdminProducts();
      await fetchProducts();
    } else {
      showToast(res.message || 'بارگذاری تصویر ناموفق بود.', 'error');
    }
  } catch (error) {
    showToast('خطای شبکه در بارگذاری تصویر.', 'error');
  } finally {
    inputEl.value = '';
  }
}


// =============================================================================
//  Admin panel logic (Phase 10)
//  Every action talks to the API, which re-validates everything: the UI is a
//  convenience layer, never the authority.
// =============================================================================

function persianNumber(value) {
  return Number(value || 0).toLocaleString('fa-IR');
}

function formatToman(value) {
  return `${persianNumber(value)} تومان`;
}

/** KPI cards answering the owner's morning questions. */
async function loadAdminDashboard() {
  const res = await apiFetch('/api/admin/stats');
  if (!res.success) return;

  const d = res.data;

  const cards = [
    { label: 'فروش تأییدشده امروز', value: formatToman(d.revenueToday), hint: `${persianNumber(d.ordersToday)} سفارش امروز${d.pendingOrdersToday ? ` — ${persianNumber(d.pendingOrdersToday)} در انتظار پرداخت (${formatToman(d.pendingRevenueToday)})` : ''}`, tone: 'emerald' },
    { label: 'فروش این ماه', value: formatToman(d.revenueThisMonth), hint: `میانگین هر سفارش: ${formatToman(d.averageOrderValue)}`, tone: 'brand' },
    { label: 'در انتظار اقدام', value: persianNumber(d.pendingOrdersCount), hint: `${persianNumber(d.pendingWholesaleCount)} درخواست عمده‌فروشی معلق`, tone: 'amber' },
    { label: 'موجودی بحرانی', value: persianNumber(d.lowStock?.length || 0), hint: `${persianNumber(d.outOfStockVariants)} تنوع ناموجود`, tone: 'rose' }
  ];

  const toneClass = {
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    brand: 'text-brand-700 bg-brand-50 border-brand-100',
    amber: 'text-amber-700 bg-amber-50 border-amber-100',
    rose: 'text-rose-700 bg-rose-50 border-rose-100'
  };

  const container = document.getElementById('admin-kpi-cards');
  if (container) {
    container.innerHTML = cards.map(c => `
      <div class="p-4 rounded-2xl border ${toneClass[c.tone]}">
        <div class="text-[11px] font-bold opacity-80">${c.label}</div>
        <div class="text-lg font-black mt-1">${c.value}</div>
        <div class="text-[10px] opacity-70 mt-1">${c.hint}</div>
      </div>
    `).join('');
  }

  const top = document.getElementById('admin-top-products');
  if (top) {
    top.innerHTML = (d.topProducts || []).length
      ? d.topProducts.map((p, i) => `
          <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span>${toPersianDigits(i + 1)}. ${escapeAttr(p.title || '—')}</span>
            <span class="font-bold text-slate-800">${toPersianDigits(p.quantity)} عدد — ${formatToman(p.revenue)}</span>
          </div>`).join('')
      : '<p class="text-slate-400">هنوز فروشی ثبت نشده است.</p>';
  }

  const low = document.getElementById('admin-low-stock');
  if (low) {
    low.innerHTML = (d.lowStock || []).length
      ? d.lowStock.slice(0, 6).map(item => `
          <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span>${escapeAttr(item.productTitle)} — ${escapeAttr(item.color || '')} ${escapeAttr(item.size || '')}</span>
            <span class="font-bold ${item.stock === 0 ? 'text-rose-600' : 'text-amber-600'}">${toPersianDigits(item.stock)} عدد</span>
          </div>`).join('')
      : '<p class="text-emerald-600 font-bold">موجودی همه اقلام سالم است ✅</p>';
  }

  // Legacy KPI tiles in the admin header (kept in sync with the new cards).
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('kpi-revenue', formatPrice(d.revenueAllTime));
  setText('kpi-pending-wholesale', toPersianDigits(d.pendingWholesaleCount));
  setText('admin-kpi-pending-badge', toPersianDigits(d.pendingWholesaleCount));
  setText('kpi-orders-count', toPersianDigits(d.ordersBillable || d.billableOrders));
  setText('kpi-products-count', toPersianDigits(d.productsCount));
}

// ---------------------------------------------------------------------------
// Product create / edit
// ---------------------------------------------------------------------------
let editingProductId = null;

function openAddProductModal() {
  editingProductId = null;
  document.getElementById('admin-product-modal-title').textContent = 'افزودن محصول جدید';
  document.getElementById('admin-product-form').reset();
  document.getElementById('pf-variants').innerHTML = '';
  addVariantRow();
  fillCategorySuggestions();
  document.getElementById('admin-product-modal').classList.remove('hidden');
  document.getElementById('pf-title')?.focus();
}

function closeAdminProductModal() {
  document.getElementById('admin-product-modal').classList.add('hidden');
}

async function fillCategorySuggestions() {
  if (state.categories.length === 0) await fetchCategories();
  const list = document.getElementById('pf-category-list');
  if (list) list.innerHTML = state.categories.map(c => `<option value="${escapeAttr(c.name)}"></option>`).join('');
}

function addVariantRow(variant = {}) {
  const container = document.getElementById('pf-variants');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'grid grid-cols-12 gap-2 items-center';
  row.innerHTML = `
    <input type="hidden" class="v-id" value="${escapeAttr(variant.id || '')}">
    <input class="v-color col-span-4 text-xs border border-slate-300 rounded-lg px-2 py-1.5" placeholder="رنگ (مثلاً مشکی)" aria-label="رنگ" value="${escapeAttr(variant.color || '')}">
    <input class="v-size col-span-2 text-xs border border-slate-300 rounded-lg px-2 py-1.5" placeholder="سایز" aria-label="سایز" value="${escapeAttr(variant.size || '')}">
    <input class="v-stock col-span-2 text-xs border border-slate-300 rounded-lg px-2 py-1.5" type="number" min="0" placeholder="موجودی" aria-label="موجودی" value="${variant.stock ?? 0}">
    <input class="v-hex col-span-2 text-xs border border-slate-300 rounded-lg px-2 py-1.5" placeholder="#000000" aria-label="کد رنگ" value="${escapeAttr(variant.colorHex || '#000000')}">
    <button type="button" class="col-span-2 text-[11px] font-bold text-rose-600 hover:text-rose-700" onclick="this.closest('div').remove()">حذف</button>
  `;
  container.appendChild(row);
}

function collectVariants() {
  return [...document.querySelectorAll('#pf-variants > div')].map(row => ({
    id: row.querySelector('.v-id')?.value || undefined,
    color: row.querySelector('.v-color')?.value.trim(),
    size: row.querySelector('.v-size')?.value.trim(),
    colorHex: row.querySelector('.v-hex')?.value.trim() || '#000000',
    stock: Number(row.querySelector('.v-stock')?.value || 0)
  })).filter(v => v.color && v.size);
}

async function editProduct(productId) {
  const res = await apiFetch(`/api/admin/products`);
  const product = (res.data || []).find(p => p.id === productId);
  if (!product) return showToast('محصول یافت نشد.', 'error');

  editingProductId = productId;
  document.getElementById('admin-product-modal-title').textContent = `ویرایش «${product.title}»`;
  document.getElementById('pf-title').value = product.title;
  document.getElementById('pf-category').value = product.category;
  document.getElementById('pf-retail').value = product.retailPrice;
  document.getElementById('pf-wholesale').value = product.wholesalePrice || '';
  document.getElementById('pf-wholesale-min').value = product.wholesaleMinQuantity || 6;
  document.getElementById('pf-material').value = product.material || '';
  document.getElementById('pf-season').value = product.season || 'چهار فصل';
  document.getElementById('pf-featured').checked = Boolean(product.isFeatured);
  document.getElementById('pf-description').value = product.description || '';

  const variants = document.getElementById('pf-variants');
  variants.innerHTML = '';
  (product.variants || []).forEach(v => addVariantRow(v));
  if (!(product.variants || []).length) addVariantRow();

  await fillCategorySuggestions();
  document.getElementById('admin-product-modal').classList.remove('hidden');
  document.getElementById('pf-title')?.focus();
}

async function saveProduct(event) {
  event.preventDefault();

  const variants = collectVariants();
  if (variants.length === 0) {
    return showToast('حداقل یک تنوع کالا با رنگ و سایز لازم است.', 'error');
  }

  const payload = {
    title: document.getElementById('pf-title').value.trim(),
    category: document.getElementById('pf-category').value.trim(),
    retailPrice: Number(document.getElementById('pf-retail').value),
    wholesalePrice: Number(document.getElementById('pf-wholesale').value) || undefined,
    wholesaleMinQuantity: Number(document.getElementById('pf-wholesale-min').value) || 6,
    material: document.getElementById('pf-material').value.trim(),
    season: document.getElementById('pf-season').value.trim() || 'چهار فصل',
    isFeatured: document.getElementById('pf-featured').checked,
    description: document.getElementById('pf-description').value.trim(),
    variants
  };

  const res = editingProductId
    ? await apiFetch(`/api/admin/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) })
    : await apiFetch('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });

  if (res.success) {
    showToast(res.message, 'success');
    closeAdminProductModal();
    await loadAdminProducts();
    await loadAdminDashboard();
    await fetchProducts();
  } else {
    const detail = res.details?.[0]?.message;
    showToast(detail || res.message || 'ثبت محصول ناموفق بود.', 'error');
  }
}

async function archiveProduct(productId) {
  if (!confirm('این محصول از فروشگاه برداشته می‌شود (سفارش‌های قبلی حفظ می‌شوند). مطمئنید؟')) return;
  const res = await apiFetch(`/api/admin/products/${productId}`, { method: 'DELETE' });
  showToast(res.message || 'انجام شد.', res.success ? 'success' : 'error');
  if (res.success) {
    await loadAdminProducts();
    await loadAdminDashboard();
    await fetchProducts();
  }
}

async function restoreProduct(productId) {
  const res = await apiFetch(`/api/admin/products/${productId}/restore`, { method: 'POST' });
  showToast(res.message || 'انجام شد.', res.success ? 'success' : 'error');
  if (res.success) {
    await loadAdminProducts();
    await loadAdminDashboard();
    await fetchProducts();
  }
}

let adminProductsFilter = 'all';

async function loadAdminProductsFilter(filter) {
  adminProductsFilter = filter;
  await loadAdminProducts();
}

// ---------------------------------------------------------------------------
// Inventory quick edit
// ---------------------------------------------------------------------------
async function loadLowStock() {
  const threshold = document.getElementById('low-stock-threshold')?.value;
  const res = await apiFetch(`/api/admin/inventory/low-stock${threshold !== undefined ? `?threshold=${encodeURIComponent(threshold)}` : ''}`);
  const container = document.getElementById('admin-low-stock-table');
  if (!container) return;

  if (!res.success || !res.data.length) {
    container.innerHTML = '<p class="text-emerald-600 font-bold text-xs">با این آستانه، موجودی هیچ قلمی بحرانی نیست ✅</p>';
    return;
  }

  container.innerHTML = res.data.map(item => `
    <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200">
      <div class="text-xs">
        <div class="font-bold text-slate-800">${escapeAttr(item.productTitle)}</div>
        <div class="text-slate-500">${escapeAttr(item.color || '')} — سایز ${escapeAttr(item.size || '')} | آستانه ${toPersianDigits(item.threshold)}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold ${item.stock === 0 ? 'text-rose-600' : 'text-amber-600'}">${toPersianDigits(item.stock)} عدد</span>
        <input type="number" min="0" value="${item.stock}" aria-label="موجودی جدید برای ${escapeAttr(item.productTitle)}"
               id="stock-${item.variantId}" class="w-20 text-xs border border-slate-300 rounded-lg px-2 py-1">
        <button type="button" onclick="saveVariantStock('${item.productId}', '${item.variantId}')"
                class="px-3 py-1.5 min-h-[36px] rounded-lg bg-slate-900 text-white text-[11px] font-bold">ثبت موجودی</button>
      </div>
    </div>
  `).join('');
}

async function saveVariantStock(productId, variantId) {
  const input = document.getElementById(`stock-${variantId}`);
  const stock = Number(input?.value || 0);

  const res = await apiFetch('/api/admin/inventory/bulk', {
    method: 'PUT',
    body: JSON.stringify({ updates: [{ productId, variantId, stock }] })
  });

  showToast(res.message || 'انجام شد.', res.success ? 'success' : 'error');
  await loadLowStock();
  await loadAdminDashboard();
  await fetchProducts();
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------
async function createCoupon(event) {
  event.preventDefault();

  const payload = {
    code: document.getElementById('coupon-code').value.trim(),
    type: document.getElementById('coupon-type').value,
    value: Number(document.getElementById('coupon-value').value),
    minBasket: Number(document.getElementById('coupon-min-basket').value) || 0,
    maxDiscount: Number(document.getElementById('coupon-max-discount').value) || null,
    expiresAt: document.getElementById('coupon-expires').value || null,
    usageLimit: Number(document.getElementById('coupon-usage-limit').value) || null,
    perUserLimit: Number(document.getElementById('coupon-per-user').value) || null,
    appliesTo: document.getElementById('coupon-applies').value
  };

  const res = await apiFetch('/api/admin/coupons', { method: 'POST', body: JSON.stringify(payload) });
  showToast(res.message || (res.success ? 'ساخته شد.' : 'ساخت کد ناموفق بود.'), res.success ? 'success' : 'error');

  if (res.success) {
    document.getElementById('admin-coupons-table')?.closest('form')?.reset();
    event.target.reset();
    await loadCoupons();
  }
}

async function loadCoupons() {
  const res = await apiFetch('/api/admin/coupons');
  const container = document.getElementById('admin-coupons-table');
  if (!container) return;

  if (!res.success || !res.data.length) {
    container.innerHTML = '<p class="text-slate-400 text-xs">هنوز کد تخفیفی ساخته نشده است.</p>';
    return;
  }

  container.innerHTML = res.data.map(c => `
    <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border ${c.isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50'}">
      <div class="text-xs">
        <div class="font-black font-mono text-slate-900">${escapeAttr(c.code)}
          <span class="font-normal text-slate-500">
            ${c.type === 'PERCENT' ? `${toPersianDigits(c.value)}٪` : formatToman(c.value)}
            ${c.minBasket ? ` | حداقل سبد ${formatToman(c.minBasket)}` : ''}
            ${c.maxDiscount ? ` | سقف ${formatToman(c.maxDiscount)}` : ''}
          </span>
        </div>
        <div class="text-slate-500 mt-0.5">
          استفاده‌شده: ${toPersianDigits(c.usedCount || 0)}${c.usageLimit ? ` از ${toPersianDigits(c.usageLimit)}` : ''}
          ${c.expiresAt ? ` | انقضا: ${new Date(c.expiresAt).toLocaleDateString('fa-IR')}` : ''}
          ${c.isActive ? '' : ' | <span class="text-rose-600 font-bold">غیرفعال</span>'}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" onclick="toggleCoupon('${c.id}', ${c.isActive})"
                class="px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 text-[11px] font-bold">
          ${c.isActive ? 'غیرفعال کردن' : 'فعال کردن'}
        </button>
        <button type="button" onclick="archiveCoupon('${c.id}')"
                class="px-3 py-1.5 min-h-[36px] rounded-lg border border-rose-200 text-rose-600 text-[11px] font-bold">آرشیو</button>
      </div>
    </div>
  `).join('');
}

async function toggleCoupon(id, isActive) {
  const res = await apiFetch(`/api/admin/coupons/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: !isActive }) });
  showToast(res.message || 'به‌روزرسانی شد.', res.success ? 'success' : 'error');
  await loadCoupons();
}

async function archiveCoupon(id) {
  if (!confirm('این کد تخفیف آرشیو شود؟ سابقه سفارش‌های قبلی حفظ می‌شود.')) return;
  const res = await apiFetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
  showToast(res.message || 'آرشیو شد.', res.success ? 'success' : 'error');
  await loadCoupons();
}

// ---------------------------------------------------------------------------
// Shop settings
// ---------------------------------------------------------------------------
async function loadSettings() {
  const res = await apiFetch('/api/admin/settings');
  const container = document.getElementById('admin-settings-form');
  if (!container || !res.success) return;

  const s = res.data;
  const field = (id, label, value, type = 'number', hint = '') => `
    <label class="block text-xs font-bold text-slate-700">${label}
      <input id="${id}" type="${type}" value="${escapeAttr(value ?? '')}" class="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-normal">
      ${hint ? `<span class="block text-[10px] font-normal text-slate-400 mt-0.5">${hint}</span>` : ''}
    </label>`;

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${field('set-flat-fee', 'تعرفه ارسال پیش‌فرض (تومان)', s.shipping.flatFee, 'number', 'برای استان‌هایی که تعرفه اختصاصی ندارند')}
      ${field('set-free-threshold', 'آستانه ارسال رایگان (تومان)', s.shipping.freeShippingThreshold, 'number', 'سفارش بالای این مبلغ ارسال رایگان دارد')}
      ${field('set-low-stock', 'آستانه هشدار موجودی (عدد)', s.inventory.lowStockThreshold, 'number', 'وقتی موجودی به این عدد رسید پیامک هشدار می‌آید')}
      ${field('set-alert-hours', 'فاصله بین هشدارها (ساعت)', s.inventory.alertThrottleHours, 'number')}
      ${field('set-owner-mobile', 'موبایل صاحب فروشگاه (برای هشدار موجودی)', s.shop.ownerMobile, 'tel', 'اگر خالی باشد هشدار پیامکی ارسال نمی‌شود')}
      ${field('set-support-phone', 'تلفن پشتیبانی (روی فاکتور)', s.shop.supportPhone, 'tel')}
      ${field('set-shop-name', 'نام فروشگاه', s.shop.name, 'text')}
      ${field('set-shop-address', 'نشانی (روی فاکتور)', s.shop.address, 'text')}
      ${field('set-tax-id', 'شناسه/کد اقتصادی (روی فاکتور)', s.shop.taxId, 'text')}
      ${field('set-invoice-note', 'متن پایانی فاکتور', s.shop.invoiceFooterNote, 'text')}
    </div>

    <details class="mt-5">
      <summary class="text-xs font-bold text-slate-600 cursor-pointer">تعرفه ارسال هر استان (تومان)</summary>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
        ${Object.entries(s.shipping.provinceFees || {}).map(([province, fee]) => `
          <label class="flex items-center gap-2 text-[11px]">
            <span class="w-20 text-slate-600">${escapeAttr(province)}</span>
            <input class="province-fee flex-1 border border-slate-200 rounded-lg px-2 py-1" data-province="${escapeAttr(province)}" value="${fee}" type="number" min="0" aria-label="تعرفه ارسال ${escapeAttr(province)}">
          </label>`).join('')}
      </div>
    </details>

    <div class="mt-5 flex items-center gap-2">
      <button type="button" onclick="saveSettings()" class="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold">ذخیره تنظیمات</button>
      <span class="text-[11px] text-slate-400">تغییرات بلافاصله روی سبد خرید و فاکتورها اعمال می‌شود.</span>
    </div>
  `;
}

async function saveSettings() {
  const provinceFees = {};
  document.querySelectorAll('.province-fee').forEach(input => {
    provinceFees[input.dataset.province] = Number(input.value);
  });

  const payload = {
    shipping: {
      flatFee: Number(document.getElementById('set-flat-fee').value),
      freeShippingThreshold: Number(document.getElementById('set-free-threshold').value),
      provinceFees
    },
    inventory: {
      lowStockThreshold: Number(document.getElementById('set-low-stock').value),
      alertThrottleHours: Number(document.getElementById('set-alert-hours').value)
    },
    shop: {
      name: document.getElementById('set-shop-name').value,
      address: document.getElementById('set-shop-address').value,
      supportPhone: document.getElementById('set-support-phone').value,
      ownerMobile: document.getElementById('set-owner-mobile').value.trim(),
      taxId: document.getElementById('set-tax-id').value,
      invoiceFooterNote: document.getElementById('set-invoice-note').value
    }
  };

  const res = await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
  showToast(res.message || 'ذخیره شد.', res.success ? 'success' : 'error');

  if (res.success) {
    await recalculateCart();
    await loadAdminDashboard();
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
async function loadAuditLog() {
  const res = await apiFetch('/api/admin/audit-log?limit=100');
  const container = document.getElementById('admin-audit-table');
  if (!container) return;

  if (!res.success || !res.data.length) {
    container.innerHTML = '<p class="text-slate-400">هنوز اقدام ثبت‌شده‌ای وجود ندارد.</p>';
    return;
  }

  container.innerHTML = res.data.map(a => `
    <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-100">
      <div>
        <span class="font-mono text-[11px] font-bold text-slate-800">${escapeAttr(a.action)}</span>
        <span class="text-slate-400 mx-1">|</span>
        <span class="text-slate-500">${escapeAttr(a.adminEmail || '—')}</span>
        ${a.entityId ? `<span class="text-slate-400 mx-1">|</span><span class="font-mono text-[10px] text-slate-500">${escapeAttr(a.entityId)}</span>` : ''}
      </div>
      <span class="text-[11px] text-slate-400">${new Date(a.at).toLocaleString('fa-IR')}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Invoice links (admin side)
// ---------------------------------------------------------------------------
async function copyInvoiceLink(orderId) {
  const res = await apiFetch(`/api/orders/${orderId}/invoice-link`);
  if (!res.success) return showToast(res.message || 'ساخت لینک ناموفق بود.', 'error');

  const url = `${window.location.origin}${res.data.url}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('لینک فاکتور کپی شد. می‌توانید برای مشتری بفرستید.', 'success');
  } catch {
    window.prompt('این لینک را کپی کنید:', url);
  }
}

async function exportOrdersCsv() {
  // A direct browser navigation keeps the auth header out of the way: the route
  // accepts the token via query less awkwardly through fetch + blob.
  const res = await fetch('/api/admin/orders/export.csv', {
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {}
  });

  if (!res.ok) return showToast('خروجی اکسل ناموفق بود.', 'error');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `manto-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('فایل اکسل سفارش‌ها دانلود شد.', 'success');
}

// Destination province drives the shipping tariff (ADR-017): keep it in state
// so the cart quote matches the checkout charge.
document.getElementById('chk-province')?.addEventListener('input', (event) => {
  state.checkoutProvince = event.target.value.trim();
  clearTimeout(state._provinceTimer);
  state._provinceTimer = setTimeout(() => recalculateCart(), 500);
});

// Search input debouncer
let searchTimer = null;
document.getElementById('header-search-input')?.addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.searchQuery = e.target.value.trim();
    if (state.currentView !== 'catalog') {
      navigate('catalog');
    } else {
      fetchProducts();
    }
  }, 300);
});

// App Initialization
async function initApp() {
  // Returning from the payment gateway? Show the result and stop here.
  if (handlePaymentReturn()) {
    updateCartBadge();
    return;
  }

  await setupRoleSwitcher();
  // Initialize with regular customer session
  const initialRoleRes = await apiFetch('/api/auth/switch-role', {
    method: 'POST',
    body: JSON.stringify({ targetRole: 'REGULAR' })
  });
  if (initialRoleRes.success) {
    state.token = initialRoleRes.data.token;
    state.currentUser = initialRoleRes.data.user;
  }
  updateUserProfileUI();
  updateCartBadge();
  await fetchCategories();
  await fetchProducts();
  await recalculateCart();

  // Open a product directly when arriving from a shared link
  // (/product/<slug> pre-rendered by the server, or /?product=<slug>).
  const pathMatch = window.location.pathname.match(/^\/product\/(.+)$/);
  const queryProduct = new URLSearchParams(window.location.search).get('product');
  const deepLink = pathMatch ? decodeURIComponent(pathMatch[1]) : queryProduct;

  if (deepLink) {
    await openProductModal(deepLink);
  }

  // Payment result / filter deep links
  const params = new URLSearchParams(window.location.search);
  const categoryParam = params.get('category');
  if (categoryParam) {
    state.activeCategory = categoryParam;
    state.productPage = 1;
    await fetchProducts();
  }
}

document.addEventListener('DOMContentLoaded', initApp);
