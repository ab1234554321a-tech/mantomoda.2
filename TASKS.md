# TASKS.md — Project Task Tracker

This document tracks all tasks, milestones, technical debt, and blocker items across the **Manto Moda** project lifecycle.

---

## 1. Completed (انجام شده)

- [x] **Phase 12: Security Hardening Driven by the Skills Audit** — the vendored Claude skills were executed against `src/` and the two defects they surfaced were fixed and locked down (ADR-022, ADR-023).
  - [x] Run the skill scanners for real: `.claude/skills/security-auditor/scripts/owasp-check.py src` and `detect-secrets.sh`, plus `technical-writer/validate-docs.sh` — results triaged, false positives recorded rather than "fixed".
  - [x] **Fix: order-number collisions.** `Math.random()` gave order numbers a 9,000-value space (collision expected after ~110 orders) while invoices are looked up *by number*; numbers now come from a persisted monotonic sequence with a random start, and product/coupon/audit ids and the mock payment reference use `crypto`.
  - [x] **Fix: back-office stored XSS.** Customer-supplied wholesale fields (company name, address, phone, city, economic code) and registration name/e-mail were rendered into the admin panel without encoding; all 36 human-entered interpolations now pass through one encoder (`escapeHtml`/`escapeAttr`), with `textContent`/`value` sinks preferred.
  - [x] **Regression guards**: order-number uniqueness across 300 orders (in the commerce suite) and a new **Level 9** output-encoding suite (`tests/escaping.test.js`) covering encoder behaviour, every risky interpolation in the shipped client, and the server-rendered product page + printable invoice over real HTTP. Mutation-tested: reverting a fix turns the suite red.
  - [x] **`scripts/skills-audit.sh`** (`npm run skills-audit`): one command that re-runs every skill scanner plus the project gates and writes `reports/skills-audit-<stamp>.md`.
  - [x] **`scripts/push-to-github.sh`**: publishes the current commit to GitHub in one command (token via argument, environment variable or hidden prompt; refuses on a dirty tree; prints local vs remote HEAD as proof).
  - [x] **The code is on GitHub** — `github.com/ab1234554321a-tech/mantomoda.2` at commit `e5d2b62`: all eleven commits (payments/OTP, skills toolchain, operations, back-office, deployment, security fixes) are uploaded, and a fresh clone installs and serves the storefront (verified by cloning from GitHub and booting it).
  - [ ] `.github/workflows/ci.yml` is the one file still pending: GitHub requires the `workflow` token scope to write workflow files, and the token used for the upload carried `repo` only. It is committed locally as `cd315fa` and goes up with the next push from a token that has the scope ticked (no rewrite, no force-push needed).
- [x] **Phase 11: Deployment & Release** — Docker image, compose (data volume + backup sidecar), Nginx/HTTPS, systemd unit, one-command server installer, pre-launch audit and the Persian hosting runbook (ADR-021).
- [x] **Phase 10: Back-Office & Commerce** — shop settings, centralised pricing, coupons, product management with archive, inventory operations with owner alerts, order search/CSV export, signed printable invoices, admin dashboard and audit trail (ADR-017..020). 8 test suites green.
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

- [x] **Phase 11: Deployment & Release — COMPLETE**
  - [x] Production `Dockerfile` + `docker-compose.yml` (restart-always, data volume, backup sidecar, log rotation, memory guard).
  - [x] Nginx reverse proxy with HTTPS/certbot, upload ceiling and immutable caching (`deploy/nginx.conf`).
  - [x] systemd unit for the non-Docker path (`deploy/mantomoda.service`).
  - [x] One-command server installer (`scripts/server-install.sh`) with generated secret, persistence on by default and root guard.
  - [x] Pre-launch audit (`scripts/preflight.sh`) wired into `npm run preflight` and CI.
  - [x] Plain-Persian launch runbook (`HOSTING-GUIDE.md`) and updated upload/backup guidance.
  - [x] Verified the production install path end-to-end from a clean `npm ci --omit=dev`.
  - [ ] (User action) rent a server + domain and run the single install command.
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
