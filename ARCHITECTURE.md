# ARCHITECTURE.md — System Architecture & Technical Specifications

This document defines the complete architectural design, domain models, database schema, and component layout for the **Manto Moda** platform.

---

## 1. High-Level Architecture Diagram

```
                        ┌────────────────────────┐
                        │      Client Web App    │
                        │ (React / Next.js / UI) │
                        │  Mobile First Design   │
                        └───────────┬────────────┘
                                    │ HTTPS / JSON API
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                          API Gateway / Server                     │
│                                                                   │
│  ┌───────────────────────┐             ┌───────────────────────┐  │
│  │   Auth Middleware     │             │  RBAC & Price Filter  │  │
│  │   (JWT / Session)     │             │  (REGULAR/WHOLESALE)  │  │
│  └───────────┬───────────┘             └───────────┬───────────┘  │
│              │                                     │              │
│  ┌───────────▼─────────────────────────────────────▼───────────┐  │
│  │                       API Controllers                       │  │
│  │  - Auth & Profile        - Products & Catalog               │  │
│  │  - Wholesale Application - Cart & Pricing Engine            │  │
│  │  - Orders & Checkout     - Admin Management                 │  │
│  └───────────────────────────┬─────────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│                        Data Layer & Storage                       │
│                                                                   │
│  - Relational Database (Users, Roles, Products, Orders, Cart)     │
│  - Media / Static Assets Storage                                  │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory & File Structure

```
manto-moda/
├── src/
│   ├── client/                  # Frontend Application
│   │   ├── components/          # Reusable UI components
│   │   │   ├── common/          # Buttons, Inputs, Modals, Badges
│   │   │   ├── layout/          # Header, Navbar, Footer, Sidebar
│   │   │   ├── products/        # ProductCard, ProductGrid, Filters
│   │   │   ├── cart/            # CartDrawer, CartSummary
│   │   │   └── admin/           # Admin Tables, StatusBadges, FormDrawers
│   │   ├── pages/               # Application Pages / Routes
│   │   │   ├── Home
│   │   │   ├── Catalog / Products
│   │   │   ├── ProductDetails
│   │   │   ├── WholesaleApply
│   │   │   ├── Cart & Checkout
│   │   │   ├── UserProfile & Orders
│   │   │   └── AdminDashboard
│   │   ├── hooks/               # Custom React hooks (useAuth, useCart, useProducts)
│   │   ├── context/             # React contexts (AuthContext, CartContext, ThemeContext)
│   │   ├── lib/                 # Client utilities & API client (fetcher, formatters)
│   │   └── types/               # TypeScript interfaces & types for frontend
│   │
│   ├── server/                  # Backend API & Business Logic
│   │   ├── config/              # Environment config & constants
│   │   ├── controllers/         # Request handlers (auth, product, wholesale, order, admin)
│   │   ├── middlewares/         # authMiddleware, roleGuard, errorHandler, priceSanitizer
│   │   ├── services/            # Core business logic (pricing, inventory, order processing)
│   │   ├── models/              # Database schema & query interfaces
│   │   ├── routes/              # Express / API route definitions
│   │   └── utils/               # Password hashing, token sign/verify, response helpers
│   │
│   └── shared/                  # Shared types, validation schemas (Zod), constants
│       ├── types/               # Shared domain entities
│       └── validations/         # Zod schemas for request validation
│
├── tests/                       # Test suites
│   ├── unit/                    # Unit tests for services, pricing & utils
│   ├── integration/             # API endpoint tests with auth & role guards
│   └── security/                # Price leakage tests, role bypass tests
│
├── docs/                        # Detailed guides & diagrams
├── .env.example                 # Template for required environment variables
├── PROJECT_STATE.md             # Active project state tracker
├── TASKS.md                     # Roadmap task tracking
├── ARCHITECTURE.md              # This architecture document
├── DECISIONS.md                 # ADRs
├── CHANGELOG.md                 # Release log
├── AGENTS.md                    # Core agent collaboration rules
├── CLAUDE.md                    # Claude instructions
├── CODEX.md                     # Codex instructions
├── PROJECT_HANDOFF.md           # Handoff snapshot
└── project-state.json           # Machine-readable state
```

---

## 3. Data Models & Database Schema

### 3.1 User & Roles
- **Roles**: `REGULAR`, `WHOLESALE`, `ADMIN`
- **User Entity**:
  - `id`: UUID / String
  - `email`: String (Unique)
  - `phone`: String (Unique, Persian/International format)
  - `passwordHash`: String (bcrypt hashed)
  - `fullName`: String
  - `role`: Enum (`REGULAR`, `WHOLESALE`, `ADMIN`)
  - `isWholesaleVerified`: Boolean (default: false)
  - `createdAt`, `updatedAt`: Timestamp

### 3.2 Wholesale Application
- `id`: UUID
- `userId`: Foreign Key -> User
- `companyName`: String
- `nationalId` / `economicCode`: String
- `businessAddress`: String
- `city`: String
- `province`: String
- `businessPhone`: String
- `storeType`: Enum (`PHYSICAL_STORE`, `ONLINE_SHOP`, `BOTH`)
- `status`: Enum (`PENDING`, `APPROVED`, `REJECTED`)
- `adminNotes`: String (Optional)
- `reviewedBy`: Foreign Key -> User (Admin)
- `reviewedAt`: Timestamp
- `createdAt`, `updatedAt`: Timestamp

### 3.3 Products & Variants
- **Product Entity**:
  - `id`: UUID
  - `sku`: String (Unique)
  - `title`: String (Persian title, e.g., «مانتو کتی ژاکارد مجلسی»)
  - `slug`: String (SEO friendly)
  - `description`: String (Markdown/HTML)
  - `categoryId`: Foreign Key -> Category
  - `material`: String (e.g., ژاکارد، لینن، کرپ)
  - `season`: Enum (`SPRING`, `SUMMER`, `AUTUMN`, `WINTER`, `FOUR_SEASONS`)
  - `retailPrice`: Integer / Decimal (IRR or Tomans)
  - `wholesalePrice`: Integer / Decimal (Protected — visible only to WHOLESALE & ADMIN)
  - `wholesaleMinQuantity`: Integer (Minimum order threshold for wholesale, default e.g. 6)
  - `isFeatured`: Boolean
  - `isActive`: Boolean (default: true)
  - `images`: JSON Array of URLs
  - `createdAt`, `updatedAt`: Timestamp

- **ProductVariant Entity**:
  - `id`: UUID
  - `productId`: Foreign Key -> Product
  - `color`: String (e.g., مشکی، کرم، سرمه‌ای)
  - `colorHex`: String (e.g., `#000000`)
  - `size`: String (e.g., 36, 38, 40, 42, 44, Free Size)
  - `stockQuantity`: Integer
  - `sku`: String

### 3.4 Cart & CartItems
- `id`: UUID
- `userId`: Foreign Key -> User (or guest session identifier)
- `items`:
  - `id`: UUID
  - `variantId`: Foreign Key -> ProductVariant
  - `quantity`: Integer
  - `unitPrice`: Calculated dynamically by server based on user role and tier thresholds.

### 3.5 Orders & OrderItems
- **Order Entity**:
  - `id`: UUID
  - `orderNumber`: String (Unique, e.g., `MM-2026-09-1001`)
  - `userId`: Foreign Key -> User
  - `orderType`: Enum (`RETAIL`, `WHOLESALE`)
  - `status`: Enum (`PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`)
  - `shippingAddress`: JSON
  - `totalAmount`: Integer
  - `discountAmount`: Integer
  - `payableAmount`: Integer
  - `paymentStatus`: Enum (`UNPAID`, `PAID`, `FAILED`, `REFUNDED`)
  - `paymentMethod`: Enum (`ONLINE_GATEWAY`, `BANK_TRANSFER_RECEIPT`)
  - `createdAt`, `updatedAt`: Timestamp

---

## 4. Authentication & RBAC Authorization Architecture

### 4.1 Token / Session Lifecycle
1. User logs in with `phone/email` + `password`.
2. Server validates credentials against `passwordHash`.
3. Server generates cryptographically signed JWT containing `{ userId, role, isWholesaleVerified }`.
4. Stored securely via HTTP-only Cookies or Authorization Bearer header.

### 4.2 Backend Price Sanitization Pipeline
When product data is fetched via API (`GET /api/products` or `GET /api/products/:id`):
```
Request
  │
  ▼
authMiddleware (Extracts session & role)
  │
  ▼
productController (Fetches product from database)
  │
  ▼
priceSanitizerMiddleware:
  ├── IF user.role === 'WHOLESALE' (and isWholesaleVerified === true) OR user.role === 'ADMIN':
  │     Return { ...product, wholesalePrice, wholesaleMinQuantity }
  └── ELSE:
        Omit `wholesalePrice` completely from JSON response payload.
```

---

## 5. Responsive Mobile-First UI Guidelines
- Primary breakpoints: Mobile (`< 640px`), Tablet (`640px - 1024px`), Desktop (`> 1024px`).
- RTL layout support with standard Persian typography (e.g., Vazirmatn / Shabnam font stack).
- Touch-friendly tap targets (minimum 44px) and fluid product image galleries.
