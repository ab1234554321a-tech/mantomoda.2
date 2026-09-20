# TASKS.md — Project Task Tracker

This document tracks all tasks, milestones, technical debt, and blocker items across the **Manto Moda** project lifecycle.

---

## 1. Completed (انجام شده)

- [x] **Phase 9.5: Revenue-Readiness Hardening** — all 12 items of `EXECUTION_PLAN.md` (persistence, inventory integrity, order state machine + audit trail, SMS notifications, process hardening, supertest HTTP tests, pagination, image upload, SEO, accessibility, backups, docs/release). ADR-010..016.

- [x] **Phase 1 & 2: Repository Audit & Governance Setup**
  - [x] Initialize Git repository with `main` branch.
  - [x] Create `.gitignore` to protect environment secrets and cache files.
  - [x] Save Master Roadmap specification (`ROADMAP.md`).
  - [x] Establish Agent Collaboration Protocol (`AGENTS.md`).
  - [x] Define agent-specific guides (`CLAUDE.md`, `CODEX.md`).
  - [x] Record initial Architectural Decision Records (`DECISIONS.md`).
  - [x] Document System Architecture & Domain Models (`ARCHITECTURE.md`).
  - [x] Establish Machine-Readable & Human-Readable State (`PROJECT_STATE.md`, `project-state.json`).
  - [x] Setup Handoff document (`PROJECT_HANDOFF.md`) and initial changelog (`CHANGELOG.md`).
- [x] **Phase 3 & 6: Core Application & Infrastructure**
  - [x] Setup `package.json`, Express server, CORS, and modular architecture.
  - [x] Build in-memory ACID-like relational data store with realistic seed data.
  - [x] Implement RBAC authorization middleware (`REGULAR`, `WHOLESALE`, `ADMIN`).
  - [x] Implement **Backend Price Sanitizer** (`ADR-003`) eliminating wholesale price exposure to retail/guest users.
  - [x] Implement Wholesale Application & Approval workflow API (`ADR-002`).
  - [x] Implement Cart calculation engine with server-side price recalculation and bulk threshold rules.
  - [x] Implement Order creation, ownership security, and status transition API.
  - [x] Implement Admin management endpoints (KPI stats, wholesale approval review, order status management).
- [x] **Frontend Mobile-First Web Client**
  - [x] Responsive RTL Persian layout with Tailwind CSS.
  - [x] Role Switcher for live perspective testing (Guest, Retail, Wholesale, Pending, Admin).
  - [x] Product catalog with category pills, season filter, sort filter, and debounced search.
  - [x] Product detail modal with image gallery, color & size variants, and quantity picker.
  - [x] Wholesale Portal with merchant application form and live status tracking.
  - [x] Interactive Cart Drawer with live backend calculations and threshold notices.
  - [x] Multi-step Checkout modal with address capture and confirmation receipts.
  - [x] User Orders view with status badges.
  - [x] Full-featured Admin Dashboard with wholesale approval actions and order management.
- [x] **Phase 9.4 (partial): Payment Gateway Adapter (BL-006 / ADR-008)**
  - [x] Pluggable provider registry + Zarinpal adapter (sandbox-aware, Toman→Rial isolated).
  - [x] Order lifecycle: `PENDING` → `PAID` only after server-side verification; idempotent callback; BOLA-safe.
  - [x] Client checkout redirects to the gateway and renders a payment-result view.
  - [ ] Provide `ZARINPAL_MERCHANT_ID` and switch `ZARINPAL_SANDBOX=false` for live payments.
- [x] **Phase 9.4 (partial): SMS OTP Verification (BL-007 / ADR-009)**
  - [x] Pluggable SMS registry + Kavehnegar adapter (pattern/lookup sending).
  - [x] Hardened OTP service: hashed storage, single-use, TTL, attempt lockout, resend + hourly rate limits.
  - [x] Passwordless mobile login/registration endpoints.
  - [ ] Provide `KAVENEGAR_API_KEY` and the approved pattern name for live OTP delivery.
- [x] **Phase 9.1: Documentation Drift Fixed**
  - [x] `README.md` + `ARCHITECTURE.md` aligned with the Vanilla JS SPA reality (React/TS/Vite claims removed).
  - [x] Testing stack statement corrected to the actual 6-suite `npm test` gate.
- [x] **CI Pipeline Added (`.github/workflows/ci.yml`)**
  - [x] 6 test suites on Node 20 + 22, blocking `npm audit`, committed-secrets check, state-file validation.
- [x] **Dependency Remediation**
  - [x] 3 moderate `qs` advisories fixed; `npm audit` now reports 0 vulnerabilities.
- [x] **Improvement Plan Published (`IMPROVEMENT_PLAN.md`)**
  - [x] Evidence-based audit of P0/P1/P2 gaps with a 10-point "ready to sell" Definition of Done.
- [x] **AI Toolchain: Curated Claude Skills (ADR-006)**
  - [x] Audited the full 188-skill upstream collection and selected the 69 relevant to this roadmap.
  - [x] Vendored skills at `.claude/skills/` + cross-platform installers (`scripts/install-claude-skills.sh`, `install-skills.bat`).
  - [x] Documented the mapping in `SKILLS.md` (phases, 13 agent roles, UX, SEO).
- [x] **Environment-Scoped Frame Policy (ADR-007)**
  - [x] `CSP_FRAME_ANCESTORS` env var; production default unchanged; documented in `.env.example` + `DECISIONS.md`.
  - [x] Regression verified — all 4 suites green.
- [x] **Phase 8: Automated Testing Gate**
  - [x] Security test suite verifying price sanitization and role guards (`tests/security.test.js`).
  - [x] Wholesale approval state machine tests (`tests/wholesale.test.js`).
  - [x] Pricing engine & discount calculation tests (`tests/pricing.test.js`).
  - [x] Automated CI runner passing with 0 errors (`npm test`).

---

## 2. In Progress (در حال اجرا)

- [x] **Phase 9.5: Revenue-Readiness Hardening (`EXECUTION_PLAN.md`, 12 items) — COMPLETE**
  - [x] **Persistence (ADR-010)**: atomic debounced JSON snapshot (`src/server/db/persistence.js`), flush on shutdown, disabled under `NODE_ENV=test`/`PERSIST_DATA=false`, `RESET_DATA` re-seed, OTP records never restored. Verified across a real process restart.
  - [x] **Inventory integrity (ADR-011)**: `db.checkStock`/`db.reserveStock`/`db.releaseStock`; `POST /api/orders` returns 409 `INSUFFICIENT_STOCK` with per-line availability; cancellation restores stock; cart warns before checkout.
  - [x] **Order state machine (ADR-011)**: explicit transition map, 409 `INVALID_STATUS_TRANSITION` listing the legal next steps, `order.statusHistory[]` audit trail; the admin UI mirrors the map and shows the history.
  - [x] **Order SMS notifications (ADR-012)**: placement, payment and status-change messages through the pluggable provider; failures recorded in `order.notifications[]` and never block the operation.
  - [x] **Process hardening**: `app.js`/`index.js` split, graceful shutdown with data flush, `unhandledRejection` logging, `uncaughtException` flush + non-zero exit, OTP sweeper interval.
  - [x] **Real HTTP tests**: `supertest` Level 7 suite (`tests/operations.test.js`) — 7 suites total in `npm test`.
  - [x] **Pagination (ADR-014)**: `page`/`limit` with `meta.hasMore`, default 12 / cap 60, "show more" control in the storefront.
  - [x] **Image upload (ADR-013)**: admin-only multipart upload, content sniffing, WebP re-encode, thumbnails, safe delete, `/uploads` static serving.
  - [x] **SEO (ADR-015)**: `robots.txt`, data-driven `sitemap.xml`, pre-rendered `/product/:slug` with OG/Twitter tags, Product JSON-LD and `<noscript>`; product cards are real links.
  - [x] **Accessibility (ADR-016)**: labels, alt text, dialog semantics, live regions, skip link, focus rings, reduced motion; `npm run a11y` (17 checks) enforced in CI.
  - [x] **Backups**: `scripts/backup.sh` + `npm run backup` — create, verify, rotate, list, restore (tested).
  - [x] **Docs + release**: ADR-010..016, ARCHITECTURE §12, CHANGELOG, this tracker, `project-state.json`, distribution archive rebuilt.

---

## 3. Planned (برنامه‌ریزی شده)

### Phase 9 & 10: Production Deployment & Continuous Integration
- [ ] Connect production PostgreSQL/MySQL database via Prisma ORM.
- [x] Connect Iranian IPG Payment Gateway — **Zarinpal adapter implemented** (ADR-008); live merchant ID pending.
- [x] Connect SMS OTP service — **Kavehnegar adapter implemented** (ADR-009); live API key pending.
- [ ] Configure SSL certificate, domain DNS, and automated daily backups.

---

## 4. Blocked (مسدود شده)

*(None currently. No technical blockers.)*

---

## 5. Technical Debt (بدهی فنی)

- [x] ~~Replace simulated session tokens~~ — already resolved: HMAC-SHA256 JWT is in place (`utils/auth-crypto.js`).
- [x] ~~SMS OTP mobile verification (TD-003)~~ — implemented via the Kavehnegar adapter (ADR-009).
- [x] ~~Pluggable payment provider adapter (TD-002)~~ — implemented with Zarinpal (ADR-008).
- [ ] Add JWT refresh-token rotation (RS256 + rotating refresh tokens).
- [ ] Add Redis caching layer for catalog query optimization on heavy traffic.
