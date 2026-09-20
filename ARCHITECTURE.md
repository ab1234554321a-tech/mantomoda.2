# ARCHITECTURE.md — System Architecture & Technical Specifications

This document defines the complete architectural design, domain models, database schema, and component layout for the **Manto Moda** platform.

---

## 1. High-Level Architecture Diagram

```
                        ┌────────────────────────┐
                        │      Client Web App    │
                        │  (Vanilla JS SPA + UI) │
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
│   │   ├── app.js               # Single-file SPA controller (routing, state, views, API client)
│   │   ├── index.html           # RTL shell: header, views, cart drawer, modals
│   │   └── styles.css           # Brand tokens & RTL helpers (Tailwind handles the rest)
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

---

## Payment & OTP Integration (ADR-008 / ADR-009)

### Layering

```
src/server/
├── services/
│   ├── payment/
│   │   ├── provider.js            # registry + startup guards (PAYMENT_PROVIDER)
│   │   ├── zarinpal.provider.js   # live PSP adapter (REST v4, sandbox flag)
│   │   └── mock.provider.js       # offline adapter for tests/dev
│   ├── sms/
│   │   ├── provider.js            # registry + startup guards (SMS_PROVIDER)
│   │   ├── kavenegar.provider.js  # verify/lookup pattern sending
│   │   └── mock.provider.js       # prints the code, keeps an outbox for tests
│   └── otp.service.js             # hashing, TTL, attempts, rate limits
└── routes/
    ├── payment.routes.js          # /api/payments/*
    └── auth.routes.js             # /api/auth/otp/*
```

### Payment data flow

```
POST /api/orders              -> order created, paymentStatus = PENDING
POST /api/payments/request    -> amount read from the STORED order (never the request)
                              -> provider.request()  => { authority, paymentUrl }
                              -> payment session persisted (authority -> order)
browser -> PSP                -> customer pays on the bank page
GET  /api/payments/callback   -> provider.verify({ authority, amountRial })
                              -> amount re-checked against the stored order
                              -> payment.status = PAID, order.paymentStatus = PAID
                              -> 302 redirect to the SPA result view
POST /api/payments/verify     -> same logic, JSON response (tests / POST callbacks)
GET  /api/payments/status/:orderId -> owner/admin only
```

Invariants: amounts are Toman in the storefront and converted to Rial **only** inside the Zarinpal
adapter; verification is idempotent (PSP "already verified" is not a second charge); a repeated callback
cannot flip the order twice; every endpoint is ownership-checked (BOLA/IDOR safe).

### OTP data flow

```
POST /api/auth/otp/request  -> rate limits (cooldown + hourly ceiling)
                            -> crypto.randomInt() 6-digit code
                            -> record: { codeHash: salted SHA-256, salt, expiresAt, attempts }
                            -> SMS adapter dispatch (failure => record destroyed, HTTP 502)
POST /api/auth/otp/verify   -> timing-safe hash comparison
                            -> success: record deleted (single use) + JWT issued
                            -> failure: attempts incremented (lockout after N)
```

### Configuration

| Variable | Purpose | Default |
| :--- | :--- | :--- |
| `PAYMENT_PROVIDER` | `zarinpal` \| `mock` | required in production |
| `ZARINPAL_MERCHANT_ID` | PSP merchant UUID | required for zarinpal |
| `ZARINPAL_SANDBOX` | route payments to the PSP sandbox | `false` |
| `PAYMENT_CALLBACK_BASE_URL` | public HTTPS base the PSP redirects to | request host |
| `SMS_PROVIDER` | `kavenegar` \| `mock` | required in production |
| `KAVENEGAR_API_KEY` / `KAVENEGAR_SENDER` / `KAVENEGAR_OTP_TEMPLATE` | panel credentials + approved pattern | required for kavenegar |
| `OTP_TTL_SECONDS` / `OTP_MAX_ATTEMPTS` / `OTP_RESEND_COOLDOWN_SECONDS` / `OTP_MAX_SENDS_PER_HOUR` | OTP policy | 120 / 5 / 60 / 5 |
| `ALLOW_MOCK_PROVIDERS` | explicit opt-in to run mock providers in production (demo only) | `false` |

### Data model additions

`payments`: `id, orderId, userId, provider, authority, amountRial, amountToman, status (PENDING|PAID|FAILED), refId, cardPan, createdAt, verifiedAt, attempts`

`otps` (ephemeral): `mobile, codeHash, salt, expiresAt, attempts, lastSentAt, sendCount, sendWindowStartedAt`


## 12. Operational Layer (added 2026-09-20 — ADR-010..016)

| Concern | Module | Guarantee |
|---|---|---|
| Persistence | `src/server/db/persistence.js` | Atomic snapshot (tmp → fsync → rename), debounced, flushed on shutdown; disabled under test |
| Inventory | `db.checkStock` / `db.reserveStock` / `db.releaseStock` | No overselling; 409 with per-line availability; stock returns on cancellation |
| Order lifecycle | `db.ORDER_STATUS_TRANSITIONS` / `db.transitionOrderStatus` | Illegal transitions refused (409 + allowed list); every change audited in `statusHistory[]` |
| Customer SMS | `src/server/services/notification.service.js` | Persian SMS at placement, payment and each status change; failures recorded, never block the request |
| App/listener split | `src/server/app.js` (`createApp()`) + `src/server/index.js` | Routes are testable over real HTTP (supertest) without opening a port |
| Image uploads | `src/server/routes/upload.routes.js` (+ `sharp`) | Admin-only, content-sniffed, re-encoded to WebP, thumbnailed, EXIF stripped |
| Pagination | `src/server/routes/product.routes.js` + `db.listProducts({page, limit})` | Bounded responses (`meta.hasMore`), default 12 / cap 60 |
| SEO | `src/server/routes/seo.routes.js` | `robots.txt`, data-driven `sitemap.xml`, pre-rendered `/product/:slug` with OG + Product JSON-LD + `<noscript>` |
| Accessibility | `src/client/public/styles.css` + markup contract | `npm run a11y` — 17 checks, also enforced in CI |
| Backups / ops | `scripts/backup.sh`, `npm run backup` | Timestamped, integrity-verified archives with rotation and `--restore` |

**Process safety**: `index.js` logs unhandled promise rejections without killing the shop, flushes
data and exits non-zero on an uncaught exception (so the process manager restarts a clean instance),
and purges expired OTP records on an interval.

**Test gate**: 7 suites (`npm test`) — L1 pricing, L2 wholesale, L3 security/JWT, L4 red team,
L5 payments, L6 OTP, L7 operations (inventory, lifecycle, notifications, SEO, uploads, persistence
over real HTTP).

## 13. Back-Office Layer (added 2026-09-20 — ADR-017..020)

The shop can now be operated by its owner without a developer.

| Capability | Module | What it means for the business |
|---|---|---|
| Shop settings | `db.getSettings/updateSettings` + `PUT /api/admin/settings` | Shipping tariffs, free-shipping threshold, low-stock threshold, owner mobile and invoice identity are data, not code |
| Pricing policy | `services/pricing/shipping.service.js` | One implementation of shipping/totals; cart and checkout can no longer disagree |
| Coupons | `services/pricing/coupon.service.js` + `db.coupons` | Percent/fixed, minimum basket, cap, usage limits, expiry, retail/wholesale channel; 422 with a specific reason when refused |
| Product management | `services/catalog/product.service.js` + admin routes | Validated create/edit with generated slug + Latin SKU, variant editing, archive/restore instead of destructive delete |
| Inventory operations | `PUT /api/admin/inventory/bulk`, `GET /api/admin/inventory/low-stock` | Fix stock per colour/size in one screen; low-stock alert SMS to the owner (throttled) |
| Orders | `db.searchOrders` + `/api/admin/orders`, `/export.csv` | Search by number/customer/phone/city/coupon, filter by status/payment/date, paginate, export for accounting (BOM CSV) |
| Invoice | `services/invoice.service.js` + `routes/invoice.routes.js` | Owner-only JSON invoice, plus a signed 30-day link rendering a printable, noindex page that a customer can forward |
| Reporting | `db.revenueSummary` | Recognised revenue (paid/confirmed — cancellations excluded), today/month/total, average order value, best sellers, awaiting payment |
| Audit trail | `middlewares/admin-audit.js` + `GET /api/admin/audit-log` | Every successful admin change records who/when/what/IP; secrets are redacted; log bounded to 2000 entries |
| Admin UI | `app.js` (dashboard + 7 tabs) | KPI cards, product form with variant editor, inventory quick-edit, coupon manager, settings editor, audit view, CSV export, invoice links |

**Test gate**: `npm test` now runs **8 suites**; `tests/commerce.test.js` (Level 8) covers pricing,
coupons, catalog validation, low-stock alerts, order search/export, invoices (including tamper and
expiry), dashboard accuracy, the audit trail, settings propagation and archive semantics.

## 14. Deployment & Release (added 2026-09-20 — ADR-021)

| Artifact | Purpose |
|---|---|
| `Dockerfile` | Production image: Debian slim (matches where `sharp` was verified), production-only deps, non-root user, healthcheck, SIGTERM-aware (flushes the data snapshot) |
| `docker-compose.yml` | `restart: unless-stopped`, `./data` bind mount (orders + uploads), memory limit, log rotation, Node port published on localhost only, daily backup sidecar |
| `.dockerignore` | Keeps the build context at ~4 MB instead of ~84 MB (excludes `node_modules`, data, docs, skills) |
| `deploy/nginx.conf` | HTTPS termination (certbot), HTTP→HTTPS redirect, 6 MB upload ceiling, immutable caching for `/uploads` |
| `deploy/mantomoda.service` | systemd unit for the non-Docker path; SIGTERM with a generous stop timeout so data is flushed |
| `scripts/server-install.sh` | One idempotent command: Docker, service user, `.env` with generated secret, build, start, Nginx + certificate, nightly backup, preflight |
| `scripts/preflight.sh` | Launch-readiness audit; blocks the mistakes that actually destroy a first launch |
| `HOSTING-GUIDE.md` | Plain-language Persian runbook: what hosting is, recommended server, costs, step-by-step, 10-point post-launch checklist, day-to-day commands, troubleshooting table |

---

## 15. Security Boundaries: Output Encoding & the Skills Toolchain (added 2026-09-20 — ADR-022, ADR-023)

### 15.1 One rule for human-typed text

| Data | Where it is typed | Where it is rendered | How it is rendered |
|---|---|---|---|
| Product title, description, material, category, SKU, season, variant colour/size | Admin panel | Storefront cards, product page, admin product table, toasts | `escapeHtml()` / `escapeAttr()` — never raw interpolation |
| Wholesale application (company name, address, phone, city, economic code) | **Customer** | **Admin panel** wholesale queue | `escapeHtml()` (this was the exploitable path — ADR-022) |
| Registration name / e-mail, delivery address, recipient name | **Customer** | Admin order list, customer order view, printable invoice | `escapeHtml()` in the SPA; the server's invoice template encodes independently |
| Shop identity (name, address, phone, tax id, invoice note) | Admin settings | Printable invoice, page metadata | Server-side `escapeHtml()` in `invoice.routes.js` / `seo.routes.js` |

Rules that follow from the table:

1. Human-typed text reaches HTML **only** through the encoder; `textContent`/`value` is preferred where
   the markup allows, because it is safe by construction.
2. The encoder lives once per surface (one in the SPA, one per server template) — duplicated copies of
   an encoding function are how one of them silently drifts.
3. `tests/escaping.test.js` (Level 9) is the enforcement point: encoder behaviour, a wiring check over
   every risky interpolation in the shipped client, and real HTTP requests against the pre-rendered
   product page and the printable invoice. It is mutation-tested — removing a single `escapeHtml()`
   call makes it fail.

### 15.2 The skills toolchain as a gate (advisory, not authoritative)

```
scripts/skills-audit.sh  (npm run skills-audit)
  ├── security-auditor/owasp-check.py      → pattern candidates (A02/A03/A05/A07)
  ├── security-auditor/detect-secrets.sh   → leaked credentials (vendored skills, node_modules excluded)
  ├── technical-writer/validate-docs.sh    → documentation + ADR coverage
  ├── npm test / npm run a11y / npm audit  → the project's own gates
  └── scripts/preflight.sh                 → environment readiness
        ↓
  reports/skills-audit-<stamp>.md (+ raw .txt evidence)
        ↓
  human triage  →  real defect? → fix + promote to a test (that test gates CI)
                →  false positive? → recorded as such in the report
```

The scanners never block a release by themselves (CI runs them with `continue-on-error` and publishes
the report as an artifact). This is deliberate: the first audit produced 7 "CRITICAL" findings in a
codebase with no SQL and one genuinely exploitable chain out of 39 `innerHTML` warnings. Automation
narrows the search; the blocker is always a test.
