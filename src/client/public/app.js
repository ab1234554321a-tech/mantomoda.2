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
  selectedProduct: null
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
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}),
    ...options.headers
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('API Fetch Error:', error);
    showToast('خطا در برقراری ارتباط با سرور', 'error');
    return { success: false, error: 'NETWORK_ERROR' };
  }
}

// Helper: Toast Notifications
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

async function fetchProducts() {
  let url = `/api/products?sort=${state.activeSort}`;
  if (state.activeCategory && state.activeCategory !== 'ALL') {
    url += `&category=${encodeURIComponent(state.activeCategory)}`;
  }
  if (state.activeSeason) {
    url += `&season=${encodeURIComponent(state.activeSeason)}`;
  }
  if (state.searchQuery) {
    url += `&search=${encodeURIComponent(state.searchQuery)}`;
  }

  const res = await apiFetch(url);
  if (res.success) {
    state.products = res.data;
    renderProductsGrid();
  }
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
          <img src="${product.images[0]}" alt="${product.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
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
            <h3 class="font-bold text-slate-900 text-sm leading-snug mb-2 group-hover:text-brand-600 transition cursor-pointer" onclick="openProductModal('${product.id}')">
              ${product.title}
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
function openProductModal(productId) {
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
          <img id="modal-main-img" src="${p.images[0]}" class="w-full h-full object-cover">
        </div>
        ${p.images.length > 1 ? `
          <div class="flex gap-2">
            ${p.images.map((img, idx) => `
              <img src="${img}" onclick="document.getElementById('modal-main-img').src='${img}'" class="w-16 h-20 object-cover rounded-xl border border-slate-200 cursor-pointer hover:border-brand-500">
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
    body: JSON.stringify({ items: state.cart })
  });

  if (res.success) {
    state.cartCalculation = res.data;
    renderCartUI();
  }
}

function renderCartUI() {
  const list = document.getElementById('cart-items-list');
  const notices = document.getElementById('cart-notices-container');
  const subtotalEl = document.getElementById('cart-subtotal');
  const savingsRow = document.getElementById('cart-savings-row');
  const savingsEl = document.getElementById('cart-savings');
  const shippingEl = document.getElementById('cart-shipping');
  const payableEl = document.getElementById('cart-payable');
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
      <img src="${item.productImage}" class="w-16 h-20 object-cover rounded-xl border border-slate-200">
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

  shippingEl.textContent = data.shippingFee === 0 ? 'رایگان' : formatPrice(data.shippingFee);
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
    paymentMethod
  };

  const res = await apiFetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload)
  });

  if (res.success) {
    state.cart = [];
    saveCart();
    state.cartCalculation = null;

    document.getElementById('checkout-form-container').classList.add('hidden');
    document.getElementById('checkout-success').classList.remove('hidden');
    document.getElementById('confirmed-order-number').textContent = res.data.orderNumber;
    showToast('سفارش شما با موفقیت ثبت شد.', 'success');
  } else {
    showToast(res.message || 'خطا در ثبت سفارش', 'error');
  }
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
function switchAdminTab(tab) {
  state.activeAdminTab = tab;

  document.getElementById('admin-tab-wholesale').classList.toggle('hidden', tab !== 'wholesale');
  document.getElementById('admin-tab-orders').classList.toggle('hidden', tab !== 'orders');
  document.getElementById('admin-tab-products').classList.toggle('hidden', tab !== 'products');

  ['wholesale', 'orders', 'products'].forEach(t => {
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
}

async function loadAdminDashboard() {
  const res = await apiFetch('/api/admin/stats');
  if (res.success) {
    const s = res.data;
    document.getElementById('kpi-revenue').textContent = formatPrice(s.totalRevenue);
    document.getElementById('kpi-pending-wholesale').textContent = toPersianDigits(s.pendingWholesaleCount);
    document.getElementById('admin-kpi-pending-badge').textContent = toPersianDigits(s.pendingWholesaleCount);
    document.getElementById('kpi-orders-count').textContent = toPersianDigits(s.ordersCount);
    document.getElementById('kpi-products-count').textContent = toPersianDigits(s.productsCount);
  }
  switchAdminTab(state.activeAdminTab);
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

async function loadAdminOrders() {
  const container = document.getElementById('admin-orders-table');
  const res = await apiFetch('/api/admin/orders');

  if (res.success) {
    container.innerHTML = res.data.map(order => `
      <div class="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-sm">
        <div class="flex flex-wrap justify-between items-center gap-2">
          <div>
            <span class="font-mono text-xs font-bold text-slate-800">${order.orderNumber}</span>
            <div class="text-xs text-slate-600 mt-0.5">مشتری: ${order.userFullName} (${order.userEmail})</div>
          </div>
          <div class="flex items-center gap-2">
            <select onchange="updateOrderStatusAdmin('${order.id}', this.value)" class="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 font-medium outline-none">
              <option value="PENDING" ${order.status === 'PENDING' ? 'selected' : ''}>در انتظار تایید</option>
              <option value="CONFIRMED" ${order.status === 'CONFIRMED' ? 'selected' : ''}>تایید شده</option>
              <option value="PROCESSING" ${order.status === 'PROCESSING' ? 'selected' : ''}>در حال آماده‌سازی</option>
              <option value="SHIPPED" ${order.status === 'SHIPPED' ? 'selected' : ''}>تحویل باربری/پست</option>
              <option value="DELIVERED" ${order.status === 'DELIVERED' ? 'selected' : ''}>تحویل گردید</option>
              <option value="CANCELLED" ${order.status === 'CANCELLED' ? 'selected' : ''}>لغو شده</option>
            </select>
          </div>
        </div>

        <div class="text-xs text-slate-600">
          اقلام: ${order.items.map(i => `${i.productTitle} (${i.quantity} عدد)`).join('، ')}
        </div>

        <div class="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
          <span class="text-slate-500">نوع: ${order.orderType === 'WHOLESALE' ? 'عمده‌فروشی' : 'خرده‌فروشی'}</span>
          <span class="font-bold font-mono text-slate-900">${formatPrice(order.payableAmount)}</span>
        </div>
      </div>
    `).join('');
  }
}

async function updateOrderStatusAdmin(orderId, status) {
  const res = await apiFetch(`/api/admin/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });

  if (res.success) {
    showToast(res.message, 'success');
  } else {
    showToast(res.message || 'خطا در تغییر وضعیت', 'error');
  }
}

async function loadAdminProducts() {
  const container = document.getElementById('admin-products-table');
  const res = await apiFetch('/api/admin/products');

  if (res.success) {
    container.innerHTML = res.data.map(p => `
      <div class="p-4 rounded-2xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3">
          <img src="${p.images[0]}" class="w-12 h-16 object-cover rounded-xl border border-slate-200">
          <div>
            <h4 class="font-bold text-xs text-slate-900">${p.title}</h4>
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
        </div>
      </div>
    `).join('');
  }
}

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
}

document.addEventListener('DOMContentLoaded', initApp);
