# Architectural Decision Records (ADRs) — DECISIONS.md

This log contains the record of all major architectural and technical decisions made for the **Manto Moda** platform. AI agents MUST NOT revert or alter accepted decisions without explicit justification and stakeholder approval.

---

## ADR-001: Git Repository as Single Source of Truth
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: The project is collaboratively developed by multiple autonomous AI agents (Claude, Codex, Arena AI) and human stakeholders. Context maintained in chat logs is fragile and non-persistent.
- **Decision**: The Git repository (code, markdown state files, commit history, and automated checks) is established as the sole authoritative source of truth.
- **Consequences**: Agents do not rely on chat memory; they read and update project state directly in the repository.

---

## ADR-002: Wholesale Customer Approval Workflow
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Manto Moda caters to both regular retail customers and wholesale buyers (boutiques, bulk purchasers). Wholesale rates and bulk minimum order quantities must only be accessible to verified merchants.
- **Decision**: Implement a two-step wholesale workflow:
  1. Regular user submits a Wholesale Application (business registration, contact details, tax/national ID).
  2. Admin reviews the application in the Admin Panel and grants `WHOLESALE` role upon verification.
  3. Rejected or unverified users remain with `REGULAR` role.
- **Consequences**: Prevents unauthorized retail buyers from viewing wholesale prices; protects wholesale margins and business relationships.

---

## ADR-003: Strict Backend-Enforced Price Protection
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Securing wholesale prices only via frontend UI checks (hiding elements in CSS/React) is vulnerable to inspection via browser DevTools or direct API requests.
- **Decision**: All price and discount logic MUST be enforced on the backend / API layer:
  - Wholesale price fields are omitted or sanitized from API responses unless the authenticated session has a verified `WHOLESALE` or `ADMIN` role.
  - Cart totals and checkout orders re-verify product prices, tier discounts, and stock availability on the backend before order creation.
- **Consequences**: Guarantees zero price leakage and immune to client-side tampering.

---

## ADR-004: Standardized Project State Files (Human + Machine Readable)
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Multiple agents need quick, deterministic access to project status, tasks, and roadblocks without parsing ambiguous chat histories.
- **Decision**: Maintain both Markdown (`PROJECT_STATE.md`, `TASKS.md`, `PROJECT_HANDOFF.md`) and JSON (`project-state.json`) state files at the repository root.
- **Consequences**: Seamless agent handoffs and automated CI/CD state verification.

---

## ADR-005: Technology Stack & Production Architecture
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Manto Moda needs a high-performance, SEO-friendly, responsive e-commerce web application with robust type safety, secure API endpoints, and clean modularity.
- **Decision**:
  - **Frontend**: React / Next.js (or modern TypeScript Vite/React SPA + SSR/Node backend) with TailwindCSS for responsive Mobile-First design.
  - **Backend**: Node.js / TypeScript RESTful / modular API with clean controllers, validation middlewares (Zod), and role-based access control (RBAC).
  - **Database & Data Layer**: SQLite / PostgreSQL with Prisma ORM or standard SQL relational models.
  - **Testing**: Vitest / Jest for unit and integration testing.
- **Consequences**: High reliability, end-to-end type safety, fast developer iterations, and straightforward containerized deployment.

---

## ADR-006: Curated Claude Skills Toolchain for AI Agents
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: The project is developed by multiple AI agents (Claude Code, Codex, Arena AI) that repeatedly need deep domain expertise: PostgreSQL/Prisma migration (BL-005), IPG & SMS OTP adapters (BL-006/BL-007), Persian RTL accessibility, Playwright E2E, SEO. Ad-hoc prompting produces inconsistent quality and duplicated reasoning across agents and sessions.
- **Decision**: Adopt a curated subset of the MIT-licensed `erichowens/some_claude_skills` collection (188 skills reviewed → **69 selected**), vendored into the repository at `.claude/skills/` and installable to the user profile via `scripts/install-claude-skills.sh` or `install-skills.bat`.
  - Selection criterion is roadmap-driven, not aesthetic: a skill is included only if it maps to a named roadmap phase (`AUDIT_REALITY_REPORT.md` §N), an Agent Role (`agents/01..13`), or an open backlog item.
  - Every skill was security-audited before adoption (no `curl | bash` installers, no hardcoded secrets, no prompt-injection phrasing). `automatic-stateful-prompt-improver` was **rejected** for shipping a `curl | bash` setup step.
  - The skill→phase and skill→agent-role mapping is maintained in `SKILLS.md`.
- **Consequences**: Agents operate from a shared, versioned expertise baseline; additions/removals are reviewed through this ADR. Costs ~4k tokens of skill metadata per session, so the set is grouped (`--group meta|backend|qa|ux|seo|...`) for trimming. Skills are instruction files only — they never modify project state by themselves.

---

## ADR-007: Environment-Scoped Frame Embedding Policy
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: Helmet applied a fixed `frame-ancestors 'self'` CSP directive plus `X-Frame-Options: SAMEORIGIN`. This blocked legitimate embedding of the app in trusted staging/preview/demo surfaces (e.g. an internal admin wrapper or a preview pane) and made such environments untestable without patching security code.
- **Decision**: Make the frame policy explicit and environment-scoped:
  - `CSP_FRAME_ANCESTORS` env var (comma-separated origins) drives the CSP `frame-ancestors` directive.
  - When unset (default, and always in production) behaviour is unchanged: `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`.
  - `frameguard` is disabled **only** when `CSP_FRAME_ANCESTORS` is explicitly set, because `X-Frame-Options` would otherwise override the widened CSP.
- **Consequences**: Embedding is opt-in per environment, is auditable via env config, and cannot be widened accidentally. Documented in `.env.example` with an explicit "never use `*` in production" warning. All 4 test suites re-verified green after the change.

---

## ADR-008: Iranian Payment Gateway Provider — Zarinpal (Pluggable Adapter)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `BL-006` required a real IPG. Two families were evaluated:
  **direct bank PSP** (Behpardakht Mellat / Saman SEP) and **intermediary IPG** (Zarinpal, Pay.ir).
  - Direct PSP: banking-grade settlement straight to the merchant account, but requires a Shaparak
    terminal, company/IEEE documents, a tax file and a slow approval cycle. Integration differs per bank.
  - Zarinpal: activation without a bank contract, one documented REST API, a sandbox for integration
    testing, and — decisive for reliability — **smart routing across multiple bank gateways**, so a
    single bank outage does not take checkout down.
- **Decision**: Adopt **Zarinpal** as the default IPG, implemented behind a **pluggable provider
  adapter** (`src/server/services/payment/`). Selection is one variable: `PAYMENT_PROVIDER`.
  - Amounts are stored and displayed in **Toman** and converted to **Rial** (×10) inside the Zarinpal
    adapter only — the single most common source of Iranian payment bugs.
  - The amount charged is always re-read from the stored order; it is never taken from the request.
  - Verification is **idempotent** (status `101` from Zarinpal is treated as already-verified, not as a
    second charge) and the order flips to `PAID` only after successful verification.
  - Orders are created `paymentStatus: PENDING`; the previous hardcoded simulated `PAID` is removed.
  - In production the app **refuses to start** with an unset or unconfigured provider so payments can
    never be silently faked. `mock` requires an explicit `ALLOW_MOCK_PROVIDERS=true`.
- **Consequences**: Checkout now requires real payment before an order is fulfilled. Adding a direct
  bank PSP later is a new adapter file plus one env change — no route, order or test changes.
  Merchant credentials (`ZARINPAL_MERCHANT_ID`) are still a **business-side** input.

---

## ADR-009: SMS / OTP Provider — Kavehnegar (Pluggable Adapter)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `BL-007` / `TD-003` required mobile verification for registration. Candidates considered:
  Kavehnegar and FarazSMS. Reviews consistently place Kavehnegar first for transactional OTP:
  precise technical API documentation, REST + SOAP endpoints and SDKs, high-throughput OTP delivery,
  and a voice-call fallback for landline numbers. FarazSMS is competitive mainly on price.
- **Decision**: Adopt **Kavehnegar** as the default SMS provider behind a pluggable adapter
  (`src/server/services/sms/`), selected by `SMS_PROVIDER`. OTP handling specifics:
  - Codes are **never stored in plaintext** — only a salted SHA-256 digest (`crypto.randomInt` source).
  - **Single use**: a verified code is destroyed immediately; replays fail with `NOT_FOUND`.
  - TTL (default 120s), max 5 failed attempts, 60s resend cooldown and an hourly per-number ceiling
    (anti SMS-pumping / toll-fraud abuse).
  - The code is **never returned in an API response in production**; the mock provider echoes it only
    outside production so local development works without credentials.
  - A delivery failure destroys the pending code and returns 502, so no valid-but-undelivered code exists.
- **Consequences**: Registration/login by mobile works end-to-end (`POST /api/auth/otp/request`,
  `POST /api/auth/otp/verify`). Swapping panels later is one adapter file + one env change.
  The API key and the pre-approved pattern name (`KAVENEGAR_OTP_TEMPLATE`) are business-side inputs.

---

## ADR-010: File-Backed Snapshot Persistence (in-process store)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `IMPROVEMENT_PLAN.md` P0-2. The store was a pure in-memory object: every restart
  (deploy, crash, `pm2 restart`) silently erased all orders, users and stock changes. For a shop that
  already takes money this is the most expensive defect in the codebase — a paying customer's order
  simply disappears. A full database (PostgreSQL/MongoDB) would need a server, backups and
  operational knowledge the owner does not have.
- **Decision**: Keep the in-process store as the single write path, but persist it as an **atomic
  JSON snapshot** (`src/server/db/persistence.js`):
  - Writes go to a temp file, are `fsync`ed, then `rename`d over the target — a crash mid-write can
    never leave a half-written, unloadable file.
  - Saves are **debounced** (`PERSIST_DEBOUNCE_MS`, default 150 ms) so a burst of writes costs one
    disk hit; `db.flush()` is called on SIGTERM/SIGINT and on uncaught exceptions.
  - **Disabled automatically** when `NODE_ENV=test` or `PERSIST_DATA=false`; tests must never touch
    real data (this was verified — a leak was found and fixed).
  - `RESET_DATA=true` re-seeds the demo catalog deliberately.
  - **OTP records are never restored**: they are short-lived credentials, so restoring them would
    resurrect expired codes. This is intentional, not an oversight.
- **Consequences**: Data survives restarts with zero new infrastructure, and the snapshot file is a
  plain JSON that can be inspected or hand-edited. Ceiling: this is single-process, whole-file
  persistence — it does **not** support multiple app instances or partial writes. Migration path when
  concurrency or volume demands it: implement the same method surface on a real DB (the routes never
  see storage details), which is registered as `TD-006`.

---

## ADR-011: Inventory Integrity and an Enforced Order State Machine
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `IMPROVEMENT_PLAN.md` P0-1/P0-4. Two production incidents were possible:
  (a) nothing decremented variant stock on checkout, so the shop could sell the same last item to ten
  customers; (b) the admin status endpoint accepted any of six statuses at any time, so an order could
  jump from `PENDING` straight to `DELIVERED` with no record of who changed what.
- **Decision**:
  - **Validate-then-decrement** in one synchronous, non-`await`ing step (`db.reserveStock`) so two
    concurrent checkouts cannot interleave between the check and the write. If a single line is short,
    nothing is decremented and the request returns **409 `INSUFFICIENT_STOCK`** with per-line
    `requested` / `available` numbers.
  - Cancelling an order returns the reserved stock to the catalog (`db.releaseStock`).
  - The cart endpoint reports availability **before** checkout (`hasStockProblem`, `stockNotices`), so
    the customer is warned at the cart instead of being rejected at payment.
  - Order lifecycle is an explicit map (`ORDER_STATUS_TRANSITIONS`): `PENDING → CONFIRMED|CANCELLED`,
    `CONFIRMED → PROCESSING|CANCELLED`, `PROCESSING → SHIPPED|CANCELLED`, `SHIPPED → DELIVERED`;
    `DELIVERED` and `CANCELLED` are terminal. An illegal jump returns **409
    `INVALID_STATUS_TRANSITION`** *with the list of legal next steps*.
  - Every transition appends `{from, to, at, by, note}` to `order.statusHistory` — an audit trail that
    answers "who cancelled this order, and when?".
- **Consequences**: Overselling is impossible from the API surface, and the admin panel only offers
  legal next steps (the UI mirrors the same map). The remaining ceiling: stock is per-variant and
  global, not per-warehouse (`BACKLOG` item).

---

## ADR-012: Transactional SMS for Order Lifecycle (customer notifications)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `IMPROVEMENT_PLAN.md` P0-3. The shop had an SMS provider wired for OTP only. Every
  "where is my order?" phone call is a support cost; the Iranian market expectation is a Persian SMS
  at placement and at each status change.
- **Decision**: `src/server/services/notification.service.js` sends Persian messages for
  `ORDER_PLACED`, `PAID`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED` and `CANCELLED` through the
  same pluggable provider as OTP (`sendMessage` added to the provider contract).
  **A notification never blocks or fails the operation that triggered it**: sending is
  fire-and-forget, failures are caught, logged and written to `order.notifications[]` with the error,
  so a dead gateway degrades into a visible record instead of a failed checkout or a failed admin
  action.
- **Consequences**: Customers are informed automatically; the admin panel shows how many notices were
  delivered and how many failed. Cost control: notifications are per-order, not per-page-view, and
  the Kavehnegar sender/credit is the only running expense.

---

## ADR-013: Server-Side Product Image Upload with WebP Normalisation
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `IMPROVEMENT_PLAN.md` P1-5. Products could only reference an external image URL
  (all demo data points at Unsplash). A boutique cannot run without uploading its own photos, and
  linking to third-party image hosts is both fragile and a licensing risk.
- **Decision**: `POST /api/admin/products/:id/images` (multipart, admin-only) with layered hardening:
  MIME allowlist → size ceiling (5 MB) → **real decode via `sharp`** (a text file renamed `.png` is
  rejected with `INVALID_IMAGE_CONTENT`) → re-encode to **WebP** at 1200 px plus a 400 px thumbnail →
  store under generated filenames only. Re-encoding also strips EXIF/GPS metadata. Deletion removes
  the file from disk and is guarded against path traversal.
- **Consequences**: The owner uploads photos from the admin panel; catalog pages get
  `loading="lazy"` images and thumbnails for the grid. Storage is a local directory (`UPLOAD_DIR`),
  which must be included in backups and, for multi-instance hosting, replaced by object storage
  (`TD-007`).

---

## ADR-014: Paginated Catalog API (bounded responses)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `IMPROVEMENT_PLAN.md` P1-6. `GET /api/products` returned the entire catalog. A fashion
  catalog grows into the hundreds; shipping every product (with all variants and descriptions) to
  every visitor is megabytes over a mobile connection — the dominant audience here.
- **Decision**: `page` / `limit` query parameters with a default page size of 12 and a hard cap of 60;
  the response carries `meta: {page, limit, total, totalPages, hasMore}` and the storefront renders a
  "show more" control with an `X of Y` counter. Omitting `page`/`limit` keeps the legacy
  full-list behaviour so no existing client breaks.
- **Consequences**: First paint is small and predictable; sorting is applied to the returned page
  (documented limitation — a large catalog would need server-side sorting inside the query).

---

## ADR-015: SEO via Server-Side Pre-rendering of Product Pages
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `IMPROVEMENT_PLAN.md` P1-4. The storefront is a Vanilla JS SPA with a single static
  `index.html`: search engines saw one page with one meta description and no product data. In Iran
  most traffic arrives from Instagram and Google, where a link without OpenGraph/price data simply
  does not get clicked.
- **Decision**: Keep the SPA (a Next.js migration is `TD-005` and not justified yet) and add
  server-side endpoints:
  - `GET /robots.txt` (allows the storefront, disallows `/api/`) and `GET /sitemap.xml` generated from
    live catalog data (home, wholesale view, categories, every active product).
  - `GET /product/:slug` **pre-renders** the shell for that product: correct `<title>`, description,
    canonical URL, OpenGraph/Twitter tags and schema.org **Product JSON-LD** (price in IRR,
    availability from variant stock), plus a `<noscript>` fallback block. Conflicting storefront-level
    tags are stripped first so no two `og:title` tags compete.
  - Product titles on the catalog grid are real `<a href="/product/...">` links (crawler-visible,
    shareable), while a normal click still opens the SPA modal instantly.
- **Consequences**: Product links can be shared on Instagram/WhatsApp with a proper preview and are
  indexable. The `ClothingStore` JSON-LD and `PUBLIC_SITE_URL` remain configurable per deployment.

---

## ADR-016: Accessibility Baseline (WCAG 2.1 AA-oriented)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `IMPROVEMENT_PLAN.md` P1-7. The audit found ~1 `alt` attribute, zero ARIA usage and
  placeholder-only form fields. Accessibility is also plain commercial sense: older customers and
  keyboard/mobile users are a large share of the local market.
- **Decision**: Establish and defend a baseline, checked automatically by `npm run a11y`
  (`scripts/a11y-audit.mjs`, also run in CI):
  - descriptive `alt` on every rendered image; `aria-label` on every icon-only control;
  - a label for every form control (visible label, `aria-label`, or wrapping `<label>`), named
    `radiogroup`s for option groups;
  - overlays announced as `role="dialog"` + `aria-modal="true"` with a name; toasts in an
    `aria-live="polite"` region; a skip-to-content link;
  - a visible `:focus-visible` outline, a 44px minimum touch target for icon-only controls, and
    `prefers-reduced-motion` support;
  - `lang="fa"` + `dir="rtl"` and a zoom-friendly viewport.
- **Consequences**: The audit script is a regression gate (17 checks today). It cannot detect
  contrast or screen-reader flow, so a manual pass remains on the pre-launch checklist.

---

## ADR-017: Centralised Pricing Policy (shipping + totals in one module)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: The shipping rule (`subtotal > 2000000 || isWholesale ? 0 : 45000`) existed as two
  independent copies — `cart.routes.js` and `order.routes.js`. Two copies of a pricing rule are a
  guaranteed future bug: the cart quotes one number and the checkout charges another, which is exactly
  the kind of discrepancy that ends in a chargeback. Tariffs were also hard-coded, so changing a
  shipping price required a developer and a deploy.
- **Decision**: `src/server/services/pricing/shipping.service.js` owns all shipping and total maths,
  driven by admin-editable settings (`db.getSettings().shipping`): a flat default fee, per-province
  tariffs, a free-shipping threshold and free shipping for verified wholesale partners. `calculateOrderTotals`
  returns `subtotal → discount → net → shipping → payable` and is the only place that adds them up.
  Both the cart and the checkout call it, so they cannot disagree.
- **Consequences**: The owner changes a tariff in the panel and the change is live everywhere
  immediately. The quote carries its reason (`source`/`description`) so the customer sees *why* a fee
  applies. Ceiling: the tariff is per province, not per weight or per carrier (documented in BACKLOG).

---

## ADR-018: Server-Side Coupon Engine and Product Validation
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: `discountAmount` existed on orders but nothing ever wrote to it — there was no way to
  run a promotion. At the same time the admin product endpoint validated only "has a title and a
  price", so a negative price, a non-numeric stock or a duplicated SKU could be stored and would then
  corrupt pricing and inventory — and a `PUT` could overwrite `id`, `rating` or any other field.
- **Decision**:
  - `services/pricing/coupon.service.js` evaluates a code against the stored basket and the user:
    type (percent/fixed), minimum basket, maximum discount, per-customer and total usage limits,
    expiry, channel (retail/wholesale) and an enabled switch. Every rejection returns a specific
    reason code, and the checkout answers **422 `COUPON_REJECTED`** rather than silently charging the
    full price.
  - Safety rails: a discount can never exceed the basket, nor more than `maxDiscountShare` of it, and
    percent coupons are capped at 90% at creation time.
  - `services/catalog/product.service.js` validates with Zod, normalises toman integers, generates a
    unique slug and a **Latin-only warehouse SKU** (Persian titles are transliterated, with a
    deterministic code as fallback), rejects duplicate colour+size variants and a wholesale price that
    is not below the retail price, and whitelists the fields `updateProduct` may touch.
  - A product is **archived, never deleted**: past orders reference it, so deletion would break the
    financial record. Archived products vanish from the storefront, stay visible to the admin and can
    be restored; a slug stays stable across title edits because it is already shared as a public URL.
- **Consequences**: Promotions are a business tool the owner can run alone, and the catalog cannot be
  corrupted through the API. Coupon usage is counted at order creation and recorded on the order for
  accounting.

---

## ADR-019: Low-Stock Alerts to the Shop Owner
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: Inventory integrity (ADR-011) stops overselling, but a shop that never restocks still
  loses sales. The owner has no dashboard habit yet; an SMS is the channel that actually reaches them.
- **Decision**: After a sale (and on demand from the panel) `services/inventory-alert.service.js`
  checks variants at or below `settings.inventory.lowStockThreshold` and sends the owner one Persian
  SMS per throttle window (`alertThrottleHours`, default 12h) per variant — so a busy day cannot become
  an SMS storm. A missing owner mobile disables alerts instead of erroring, and a failing gateway can
  never block a checkout or an inventory edit.
- **Consequences**: Restocking becomes a phone notification instead of a manual count, and the
  dashboard shows the same list for review.

---

## ADR-020: Admin Audit Trail, Order Search/Export and Signed Invoice Links
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: With several people (and AI agents) able to change prices, stock and order states, "who
  changed this?" had no answer. Accounting also asked for a spreadsheet, and customers asked for an
  invoice they could forward to their accountant.
- **Decision**:
  - `middlewares/admin-audit.js` records every successful mutating admin request (who, when, action,
    entity, IP, and a redacted body) into `db.adminActions`, bounded to the newest 2000 entries and
    readable through `GET /api/admin/audit-log`. Rejected requests are not logged (nothing changed),
    and password/token fields are never written.
  - `GET /api/admin/orders` accepts search (order number, customer, mobile, city, coupon), status,
    payment status, type and date range with pagination; `GET /api/admin/orders/export.csv` returns a
    UTF-8 **BOM** CSV with CRLF and Persian headers, which Excel opens correctly — the detail that
    makes the export actually usable.
  - Invoice delivery uses a **signed, expiring link** (HMAC over `orderNumber:expiry`, default 30 days)
    instead of a login wall or a public URL: a customer can forward it, an attacker cannot guess it,
    and an expired link answers 410. The rendered invoice is `noindex` and totals are read from the
    stored order only.
- **Consequences**: Every price/stock/status change has an owner, accounting is a two-click download,
  and invoices are shareable without exposing other customers' data.

---

## ADR-021: Deployment Architecture — Self-Hosted Docker on an Iranian VPS
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: Everything the project had built was still unreachable by a customer: no host, no
  domain, no HTTPS. The owner is not technical, so the deployment method had to reduce their actions
  to something they can copy-paste, and it had to place the shop where its customers are (an Iranian
  audience, Iranian payment gateway callback, no sanctions/filtering friction).
- **Decision**:
  - Ship a **production container** (`Dockerfile`, Debian slim, non-root, production-only
    dependencies, healthcheck, `STOPSIGNAL SIGTERM` so the data snapshot is flushed) plus
    `docker-compose.yml` with `restart: unless-stopped`, a **bind-mounted `./data`** (orders snapshot +
    uploaded photos survive redeploys), a memory guard, bounded logs, and a **daily backup sidecar**.
  - Publish the Node port on `127.0.0.1` only; `deploy/nginx.conf` terminates HTTPS (Let's Encrypt via
    certbot), enforces a 6 MB upload ceiling and caches `/uploads` immutably.
  - Provide `scripts/server-install.sh`: one idempotent command that installs Docker, creates a
    service user, generates a random `JWT_SECRET`, turns persistence on, builds and starts the shop,
    installs Nginx + a free certificate when `DOMAIN` is given, schedules the nightly backup and runs
    the readiness check. It refuses to run without root and stops on the first error.
  - Provide `scripts/preflight.sh`: an environment audit that catches the launch-killing mistakes —
    persistence off, weak/missing secret, provider selected without credentials, **payment callback
    pointing at localhost** (money taken, order never confirmed), unwritable data directory, no backup
    schedule — each with the fix in the same line.
  - Also ship `deploy/mantomoda.service` for the non-Docker path (plain Node + systemd), because many
    Iranian VPS setups still run services that way.
- **Consequences**: Going live is: rent a VPS + domain, point DNS, run one command, paste two
  credentials. Deployment is reproducible and reversible, and the "my orders disappeared" class of
  incident is prevented by configuration rather than by memory. Ceiling: a single-server deployment —
  horizontal scaling would require moving the store to a real database (`TD-006`) and object storage
  for uploads (`TD-007`).

---

## ADR-022: Output Encoding as a Hard Boundary (back-office XSS)
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: An automated OWASP scan run by the vendored `security-auditor` skill flagged 39
  `innerHTML` assignments in the storefront SPA. Most were benign, but following the flag by hand
  found a genuine chain: the wholesale application form (customer input: `companyName`,
  `businessAddress`, `businessPhone`, `city`, `economicCode`) and registration data (`userFullName`,
  `userEmail`) were interpolated into the **admin panel's** HTML without encoding, as was the
  delivery address on the customer's own order page. So any customer could store markup that executes
  in the owner's browser the next time she opens the wholesale queue. The owner's token lives in
  memory, which limits token theft, but the injected script runs inside the admin session and can
  read every customer's name, phone and address and drive any admin endpoint. For a shop that stores
  its customers' delivery details, that is a data breach, not a cosmetic bug.
- **Decision**:
  - One encoder (`escapeAttr` + `escapeHtml` alias in `src/client/public/app.js`) is the only way
    human-typed text may reach HTML, in both text and attribute positions.
  - Every one of the 36 interpolations that carry human-entered text is wrapped — storefront product
    copy, the invoice/order views, toasts that quote product names, and every back-office list.
  - `textContent`/`value` assignments are preferred where the markup allows, because they are safe by
    construction.
  - A **Level 9 test suite** (`tests/escaping.test.js`) guards both behaviour and wiring: it runs
    hostile payloads (`<img src=x onerror=…>`, quote breakouts, `</textarea>`) through the real
    encoder, asserts every risky interpolation in the shipped client is wrapped, and drives real HTTP
    requests to prove the **server-rendered** product page and printable invoice emit the payload as
    text. Reverting any single fix makes the suite fail (verified by mutation).
- **Consequences**: Customer-supplied text can no longer become code in anyone's browser, and a future
  edit that drops an encoder fails CI instead of being discovered by an attacker. The scan's other
  findings were rejected as false positives (the project contains no SQL at all — the store is a JSON
  snapshot per ADR-010), which is the working rule: skills surface candidates, a human-grade review
  decides.

---

## ADR-023: Skills Are Wired Into the Build, Not Installed Beside It
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: 69 Claude skills were vendored into `.claude/skills` with a mapping document, but none
  of them ran as part of the work, so they changed nothing. Meanwhile the two most valuable defects of
  this phase (order-number collisions and the stored XSS above) were both found by actually executing
  the skills' own scanners against `src/`.
- **Decision**:
  - `scripts/skills-audit.sh` executes the vendored scanners for real — `security-auditor`
    (OWASP patterns + secret scan) and `technical-writer` (documentation/ADR coverage) — plus the
    project's own gates (`npm test`, accessibility audit, dependency audit, `scripts/preflight.sh`) —
    and writes a timestamped report to `reports/skills-audit-<stamp>.md` with per-check verdicts.
  - Findings are **triaged, not obeyed**: the script reports and the report is read; a scanner's
    "critical" that contradicts the architecture (e.g. SQL injection in a project with no SQL) is
    recorded as a false positive rather than "fixed".
  - Scans exclude vendored skills and `node_modules` so the tool never grades its own source.
  - The audit is advisory and therefore **not** a CI gate; anything it proves reproducible is promoted
    into a real test (see ADR-022's Level 9 suite), and that promotion is the only path to blocking.
- **Consequences**: The skills toolchain produces evidence on every run instead of being decoration,
  the owner can re-run the whole audit with one command (`npm run skills-audit`), and the gate stays
  honest because automated-but-unvetted scanners can never block a release on their own.

---

## ADR-024: Demo Scaffolding Must Not Reach a Live Shop
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: A full review (driven by the skills audit and by probing the running server in
  production mode) found that the project's *showcase* features were reachable from the internet once
  the shop was deployed, and that any one of them handed over the back office:
  1. `POST /api/auth/switch-role` signs a token for a requested role — including `ADMIN` — **without
     any password**. It exists so the UI can demonstrate the three customer roles. On a live shop an
     anonymous visitor needed one HTTP request to read every order, every customer's name, phone and
     address, and to change prices and order statuses.
  2. The four seeded demo accounts all share one bcrypt hash whose plain password (`password123`) is
     printed in this public repository. `POST /api/auth/login` accepted them in production.
  3. A fresh production install also loaded the sample catalogue, sample orders and sample customers,
     so a real shop opened showing invented revenue and other people's invented data.
  4. The storefront header displayed a dropdown containing «👑 مدیر سیستم» to every visitor.
  The prior fixes (ADR-022, ADR-023) dealt with bugs *inside* the application; this one is about the
  difference between a demo and a business, which no scanner flags because the code is not wrong — it
  is wrong *there*.
- **Decision**:
  - One module decides what a production deployment may do (`src/server/utils/runtime-mode.js`).
    Demo behaviour is available in development/test, and in production only with an explicit
    `ALLOW_DEMO_MODE=true` / `SEED_DEMO_DATA=true` opt-in that `preflight.sh` reports as a blocker.
  - The role simulator answers **404** in production (not 403 — it does not advertise that it exists),
    and the client hides the switcher using `/api/config`, so the dropdown is never rendered on a live
    shop. A visitor simply browses as a guest or logs in.
  - Demo accounts are marked `isDemo: true` in the seed data. They are not created in production, they
    are filtered out of any snapshot carried over from a demo install, and — as defence in depth —
    both the login route and the auth middleware refuse them, so a token signed before this change
    cannot be used either. The refusal is byte-identical to a wrong password, so no account is
    enumerated.
  - The owner's account comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Production **refuses to boot**
    without it (the same policy already applied to unconfigured payment/SMS providers);
    `scripts/server-install.sh` generates a strong password and prints it once at the end of the
    install; `scripts/preflight.sh` reports a missing account, a weak password, and demo switches left
    on as launch blockers.
  - A fresh production shop starts **empty** (no sample catalogue, orders or customers). A shop opens
    with the owner's own products, not with someone else's demo data.
  - `/api/health` and `/api/config` now expose `demoMode` and read the version from `package.json`
    (the hard-coded string had drifted one release behind).
- **Consequences**: The public internet can no longer reach an admin session, and the difference
  between "demo" and "live" is a deliberate, auditable switch rather than an accident of deployment.
  Cost: the demo experience on a server requires `ALLOW_DEMO_MODE=true`, and a real launch requires one
  extra piece of configuration that the installer writes for you. Covered by **Level 10** tests
  (`tests/production-guards.test.js`), which boot real production servers and assert every claim above,
  including that development and test still keep the full demo behaviour.

---

## ADR-025: Editorial Pages Are Part of the Product
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: The storefront footer listed «راهنمای انتخاب سایز»، «رویه ارسال و مرجوعی» and
  «ضمانت اصالت» as inert text with no page behind them, and the shop published no terms, no privacy
  statement and no contact details. That is not a cosmetic gap: an Iranian payment gateway will not
  approve a merchant whose site does not publish its return rules, its terms and a way to reach it, so
  the missing pages were a **launch blocker for taking money at all**. It is also the block of text a
  customer reads when deciding whether to trust an unfamiliar storefront.
- **Decision**:
  - Five server-rendered pages — `terms`, `returns`, `privacy`, `sizing`, `contact` — live at
    `/page/<slug>`, rendered by `routes/pages.routes.js` from content in `content/pages.js`.
  - They are plain HTML with their own `<title>`, meta description and canonical URL, and are listed in
    `sitemap.xml`: a gateway reviewer and a search crawler read them without JavaScript, and the
    legal text gets indexed like the products do.
  - The contact page prints the shop identity from **settings**, so the phone number a customer reads
    is the same one printed on the invoice — no second copy to forget to update.
  - Statements that are a business promise rather than a technical fact (return window, refund
    timing, preparation time, opening hours) are drafted with sensible Iranian retail defaults and
    marked `TODO-OWNER` in the content file. The marker is stripped before rendering and
    `scripts/preflight.sh` reports how many are still unconfirmed, so a default policy cannot go live
    silently.
  - The storefront footer now links to the real pages instead of showing dead text.
- **Consequences**: The shop has a publishable rulebook, which is a precondition for payment-gateway
  approval and for customer trust, and the content is editable in one file by a non-developer. The
  owner must confirm the marked policy statements before launch — preflight says so until she does.
  Covered by **Level 12** tests (rendering, metadata, RTL, linking from the footer, sitemap presence,
  settings integration, encoding and 404 behaviour).
