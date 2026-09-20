# CHANGELOG.md — Manto Moda Release History

All notable changes to the **Manto Moda** platform will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Data persistence (ADR-010)**: The store is snapshot to disk with an atomic write (temp file → `fsync` → `rename`), debounced 150 ms, flushed on shutdown. `PERSIST_DATA=true` keeps orders, users, stock and payment state across restarts; persistence is disabled automatically under `NODE_ENV=test`/`PERSIST_DATA=false`, and OTP records are deliberately never restored. Snapshot: `data/manto-moda.json`.
- **Inventory integrity (ADR-011)**: Checkout validates and decrements variant stock in one non-interleaving step; overselling returns **409 `INSUFFICIENT_STOCK`** with per-line requested/available numbers, cancelling an order returns the stock to the catalog, and the cart warns about shortages before the customer reaches payment.
- **Order state machine + audit trail (ADR-011)**: `PUT /api/admin/orders/:id/status` accepts only legal transitions (`PENDING → CONFIRMED|CANCELLED → PROCESSING|CANCELLED → SHIPPED → DELIVERED`), refuses illegal jumps with **409 `INVALID_STATUS_TRANSITION`** plus the list of legal next steps, and records `{from, to, at, by, note}` in `order.statusHistory`. The admin panel offers only valid next steps and displays the history.
- **Order notification SMS (ADR-012)**: Persian transactional SMS on placement, payment and every status change through the existing pluggable provider (`sendMessage` added to the contract). Notifications are fire-and-forget: a dead gateway never blocks checkout or an admin action, and each attempt is recorded in `order.notifications[]` with its outcome.
- **Product image upload (ADR-013)**: `POST /api/admin/products/:id/images` (admin-only) with MIME allowlist, 5 MB ceiling, real content sniffing via `sharp`, automatic WebP re-encode (EXIF/GPS stripped), 400 px thumbnails and safe deletion. Files are served from `/uploads`.
- **Catalog pagination (ADR-014)**: `GET /api/products?page=&limit=` with `meta {page, limit, total, totalPages, hasMore}` (default 12, cap 60) plus a "show more" control and an `X of Y` counter in the storefront. Omitting the parameters keeps the previous full-list behaviour.
- **SEO endpoints (ADR-015)**: `robots.txt`, a data-driven `sitemap.xml`, and server-side pre-rendering of `/product/:slug` with correct `<title>`, description, canonical, OpenGraph/Twitter tags, schema.org **Product JSON-LD** (price in IRR, availability from stock) and a `<noscript>` fallback. Catalog product titles are now real links, so products are shareable and indexable.
- **Accessibility baseline (ADR-016)**: alt text on every image, labels on every form control, named `radiogroups`, `role="dialog"` overlays, `aria-live` toasts, a skip-to-content link, visible focus rings, 44 px touch targets and `prefers-reduced-motion` support — enforced by `npm run a11y` (17 checks) in CI.
- **Backups (`scripts/backup.sh`, `npm run backup`)**: timestamped, integrity-verified archives of the data directory with rotation (`--keep`), listing (`--list`) and restore (`--restore`).
- **Test suite Level 7** (`tests/operations.test.js`): real HTTP tests via **supertest** covering overselling rejection, stock decrement/restore, refusal of illegal transitions, audit-trail authorship, SMS delivery and gateway-failure tolerance, pagination caps, SEO output, upload hardening and test-environment persistence isolation.
- **`app.js` / `index.js` split**: the Express application is now a factory (`createApp()`) with no listening side effect, so the entire HTTP stack is testable; `index.js` owns the listener, graceful shutdown and process safety nets.
- **Process hardening**: logs unhandled promise rejections without killing the shop, flushes data and exits non-zero on an uncaught exception, purges expired OTP records periodically, and flushes the snapshot on SIGTERM/SIGINT.
- **`IMPROVEMENT_PLAN.md`**: Evidence-based improvement plan with a 10-point "ready to sell" Definition of Done and a skill→task mapping. Records the audit findings that block real sales (inventory integrity, data persistence, order notifications).
- **CI pipeline (`.github/workflows/ci.yml`)**: Runs the 6 test suites on Node 20 and 22, a blocking dependency audit, a committed-secrets check, and state-file validation. Closes the long-standing "GitHub Actions CI pending PAT" gap.

### Fixed
- **`path is not defined` after the app/index split**: caught by the new Level-7 HTTP tests; the SPA fallback now uses the shared `paths.js` module instead of a removed import.
- **Test suite writing to the production snapshot**: the test runner now sets `NODE_ENV=test` and `PERSIST_DATA=false` *before* importing the suites, so tests can never touch real data (verified).
- **Dependency vulnerabilities**: `npm audit` reported 3 moderate advisories (`qs` via express/body-parser). Remediated — `npm audit --omit=dev` now reports **0 vulnerabilities**.
- **Documentation drift (Phase 9.1)**: `README.md` and `ARCHITECTURE.md` described a React 18 / TypeScript / Vite / Vitest / Supertest stack that was never built. Both now describe the shipped Vanilla JS SPA and the actual 6-suite `npm test` gate; the React/Next.js migration is documented as a *planned* option (`TD-005`).

### Changed
- **Curated Claude Skills Toolchain (ADR-006)**: Reviewed all 188 skills of the MIT-licensed `erichowens/some_claude_skills` collection and adopted the **69** that map to roadmap phases, Agent Roles (`agents/01..13`), and open backlog items. Vendored at `.claude/skills/` so every clone has them; installable to the user profile via `scripts/install-claude-skills.sh` (macOS/Linux) or `install-skills.bat` (Windows, double-click).
- **`SKILLS.md`**: Skill-to-roadmap-phase and skill-to-agent-role mapping (Phase 9.1→10, all 13 agent roles, UI/UX, SEO, AI).
- **`scripts/install-claude-skills.sh`**: Group-based installer/uninstaller with `--group`, `--into-repo`, `--list`, `--force`, `--uninstall` flags. Validates every installed skill has a `SKILL.md`.
- **`CSP_FRAME_ANCESTORS` configuration**: Optional environment variable (documented in `.env.example`) to allow embedding the app in trusted staging/preview surfaces.
- **Payment Gateway Integration (BL-006 / ADR-008)**: Pluggable IPG adapter layer with a **Zarinpal** implementation. Orders are created `PENDING` and flip to `PAID` only after server-side verification. New endpoints: `POST /api/payments/request`, `GET /api/payments/callback`, `POST /api/payments/verify`, `GET /api/payments/status/:orderId`. Toman→Rial conversion is isolated in the adapter; amounts are always re-read from the stored order and re-verified against the gateway. Verification is idempotent (Zarinpal status 101) and ownership-checked against BOLA/IDOR. The client now redirects to the gateway and renders a dedicated payment-result view.
- **SMS OTP Mobile Verification (BL-007 / TD-003 / ADR-009)**: Pluggable SMS adapter with a **Kavehnegar** implementation plus a hardened OTP service. New endpoints: `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `GET /api/auth/otp/policy`. First successful verification creates the account (passwordless registration). Codes are stored only as salted SHA-256 digests, are single-use, expire after 120s, lock after 5 failed attempts, and are rate-limited per number (60s resend cooldown + hourly ceiling).
- **Provider registries with startup guards**: In production the app refuses to start when `PAYMENT_PROVIDER` / `SMS_PROVIDER` is unset or unconfigured, so a payment or an OTP can never be silently faked. `mock` providers require an explicit `ALLOW_MOCK_PROVIDERS=true` outside tests.
- **Two new automated test suites**: Level 5 payment gateway (`tests/payment.test.js`) and Level 6 OTP/SMS (`tests/otp.test.js`), wired into the CI gate.


### Changed
- **Security Headers (ADR-007)**: CSP `frame-ancestors` is now environment-scoped instead of hardcoded. Default behaviour is unchanged (`frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`); `frameguard` is disabled only when `CSP_FRAME_ANCESTORS` is explicitly set, since `X-Frame-Options` would otherwise override the widened CSP.

### Security
- Security-audited all 188 candidate skills before adoption (command-injection patterns, `curl | bash` installers, hardcoded secrets, prompt-injection phrasing). One skill — `automatic-stateful-prompt-improver` — was **rejected** for shipping a `curl | bash` setup step.
- Verified no regression: all 4 test suites (pricing, wholesale, security, red-team) pass after the header change.

---

## [0.3.0-rc1] - 2026-09-04

### Added
- **12-Agent Ecosystem**: Added formalized specifications for all 12 Agent roles (`agents/01_SYSTEM_ARCHITECT.md` through `agents/12_RED_TEAM_ADVERSARIAL_TESTER.md`).
- **Official MCP Server**: Built protocol-compliant stdio JSON-RPC 2.0 MCP server (`src/mcp/server.js`) on `@modelcontextprotocol/sdk`.
- **Input Validation**: Added Zod schema validation middleware (`src/server/middlewares/validate.js`) for login, registration, wholesale applications, and order checkouts.
- **Web Security**: Added `helmet` HTTP headers with Content Security Policy and `express-rate-limit` against brute-force attacks.
- **SRE & Observability**: Added automatic `X-Request-Id` tracing, structured request duration logs, memory usage metrics on `/api/health`, and graceful shutdown signal handlers.
- **Red Team Adversarial Tests**: Added `tests/adversarial.test.js` to test malformed payloads, negative cart quantities, BOLA horizontal privilege escalation, and token forgery.
- **Engineering Registries**: Added `PROJECT_AUDIT.md`, `BACKLOG.md`, and `TECH_DEBT.md`.

### Security
- Completely eliminated `x-user-id` header inspection vulnerability to prevent privilege escalation and user spoofing.
- Enforced cryptographic HMAC-SHA256 JWT tokens and bcrypt password hashing with 10 salt rounds.

---

## [0.2.0-beta] - 2026-09-04

### Added
- Implemented full modular Node.js/Express backend API with RBAC authorization middleware (`REGULAR`, `WHOLESALE`, `ADMIN`).
- Implemented Strict Backend Price Sanitization Pipeline (`ADR-003`).
- Implemented Wholesale Merchant Application & Admin Approval workflow (`ADR-002`).
- Implemented Server-Verified Shopping Cart and Pricing Engine.
- Implemented Responsive Persian RTL Web Client.
- Added Automated Testing Suite (`tests/pricing.test.js`, `tests/wholesale.test.js`, `tests/security.test.js`).

---

## [0.1.0-alpha] - 2026-09-04

### Added
- Initialized project Git repository as single source of truth.
- Added Master Development Roadmap (`ROADMAP.md`).
- Added Global AI Agent Guidelines (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`).
- Added Architectural Decision Records (`DECISIONS.md: ADR-001 to ADR-005`).
- Added initial state tracking files (`PROJECT_STATE.md`, `project-state.json`, `TASKS.md`).
- **`IMPROVEMENT_PLAN.md`**: Evidence-based improvement plan with a 10-point "ready to sell" Definition of Done and a skill→task mapping. Records the audit findings that block real sales (inventory integrity, data persistence, order notifications).
- **CI pipeline (`.github/workflows/ci.yml`)**: Runs the 6 test suites on Node 20 and 22, a blocking dependency audit, a committed-secrets check, and state-file validation. Closes the long-standing "GitHub Actions CI pending PAT" gap.

### Fixed
- **`path is not defined` after the app/index split**: caught by the new Level-7 HTTP tests; the SPA fallback now uses the shared `paths.js` module instead of a removed import.
- **Test suite writing to the production snapshot**: the test runner now sets `NODE_ENV=test` and `PERSIST_DATA=false` *before* importing the suites, so tests can never touch real data (verified).
- **Dependency vulnerabilities**: `npm audit` reported 3 moderate advisories (`qs` via express/body-parser). Remediated — `npm audit --omit=dev` now reports **0 vulnerabilities**.
- **Documentation drift (Phase 9.1)**: `README.md` and `ARCHITECTURE.md` described a React 18 / TypeScript / Vite / Vitest / Supertest stack that was never built. Both now describe the shipped Vanilla JS SPA and the actual 6-suite `npm test` gate; the React/Next.js migration is documented as a *planned* option (`TD-005`).

### Changed
- **Curated Claude Skills Toolchain (ADR-006)**: Reviewed all 188 skills of the MIT-licensed `erichowens/some_claude_skills` collection and adopted the **69** that map to roadmap phases, Agent Roles (`agents/01..13`), and open backlog items. Vendored at `.claude/skills/` so every clone has them; installable to the user profile via `scripts/install-claude-skills.sh` (macOS/Linux) or `install-skills.bat` (Windows, double-click).
- **`SKILLS.md`**: Skill-to-roadmap-phase and skill-to-agent-role mapping (Phase 9.1→10, all 13 agent roles, UI/UX, SEO, AI).
- **`scripts/install-claude-skills.sh`**: Group-based installer/uninstaller with `--group`, `--into-repo`, `--list`, `--force`, `--uninstall` flags. Validates every installed skill has a `SKILL.md`.
- **`CSP_FRAME_ANCESTORS` configuration**: Optional environment variable (documented in `.env.example`) to allow embedding the app in trusted staging/preview surfaces.
- **Payment Gateway Integration (BL-006 / ADR-008)**: Pluggable IPG adapter layer with a **Zarinpal** implementation. Orders are created `PENDING` and flip to `PAID` only after server-side verification. New endpoints: `POST /api/payments/request`, `GET /api/payments/callback`, `POST /api/payments/verify`, `GET /api/payments/status/:orderId`. Toman→Rial conversion is isolated in the adapter; amounts are always re-read from the stored order and re-verified against the gateway. Verification is idempotent (Zarinpal status 101) and ownership-checked against BOLA/IDOR. The client now redirects to the gateway and renders a dedicated payment-result view.
- **SMS OTP Mobile Verification (BL-007 / TD-003 / ADR-009)**: Pluggable SMS adapter with a **Kavehnegar** implementation plus a hardened OTP service. New endpoints: `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `GET /api/auth/otp/policy`. First successful verification creates the account (passwordless registration). Codes are stored only as salted SHA-256 digests, are single-use, expire after 120s, lock after 5 failed attempts, and are rate-limited per number (60s resend cooldown + hourly ceiling).
- **Provider registries with startup guards**: In production the app refuses to start when `PAYMENT_PROVIDER` / `SMS_PROVIDER` is unset or unconfigured, so a payment or an OTP can never be silently faked. `mock` providers require an explicit `ALLOW_MOCK_PROVIDERS=true` outside tests.
- **Two new automated test suites**: Level 5 payment gateway (`tests/payment.test.js`) and Level 6 OTP/SMS (`tests/otp.test.js`), wired into the CI gate.


### Changed
- **Security Headers (ADR-007)**: CSP `frame-ancestors` is now environment-scoped instead of hardcoded. Default behaviour is unchanged (`frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`); `frameguard` is disabled only when `CSP_FRAME_ANCESTORS` is explicitly set, since `X-Frame-Options` would otherwise override the widened CSP.

### Security
- Security-audited all 188 candidate skills before adoption (command-injection patterns, `curl | bash` installers, hardcoded secrets, prompt-injection phrasing). One skill — `automatic-stateful-prompt-improver` — was **rejected** for shipping a `curl | bash` setup step.
- Verified no regression: all 4 test suites (pricing, wholesale, security, red-team) pass after the header change.

---

## [0.3.0-rc1] - 2026-09-04

### Added
- **12-Agent Ecosystem**: Added formalized specifications for all 12 Agent roles (`agents/01_SYSTEM_ARCHITECT.md` through `agents/12_RED_TEAM_ADVERSARIAL_TESTER.md`).
- **Official MCP Server**: Built protocol-compliant stdio JSON-RPC 2.0 MCP server (`src/mcp/server.js`) on `@modelcontextprotocol/sdk`.
- **Input Validation**: Added Zod schema validation middleware (`src/server/middlewares/validate.js`) for login, registration, wholesale applications, and order checkouts.
- **Web Security**: Added `helmet` HTTP headers with Content Security Policy and `express-rate-limit` against brute-force attacks.
- **SRE & Observability**: Added automatic `X-Request-Id` tracing, structured request duration logs, memory usage metrics on `/api/health`, and graceful shutdown signal handlers.
- **Red Team Adversarial Tests**: Added `tests/adversarial.test.js` to test malformed payloads, negative cart quantities, BOLA horizontal privilege escalation, and token forgery.
- **Engineering Registries**: Added `PROJECT_AUDIT.md`, `BACKLOG.md`, and `TECH_DEBT.md`.

### Security
- Completely eliminated `x-user-id` header inspection vulnerability to prevent privilege escalation and user spoofing.
- Enforced cryptographic HMAC-SHA256 JWT tokens and bcrypt password hashing with 10 salt rounds.

---

## [0.2.0-beta] - 2026-09-04

### Added
- Implemented full modular Node.js/Express backend API with RBAC authorization middleware (`REGULAR`, `WHOLESALE`, `ADMIN`).
- Implemented Strict Backend Price Sanitization Pipeline (`ADR-003`).
- Implemented Wholesale Merchant Application & Admin Approval workflow (`ADR-002`).
- Implemented Server-Verified Shopping Cart and Pricing Engine.
- Implemented Responsive Persian RTL Web Client.
- Added Automated Testing Suite (`tests/pricing.test.js`, `tests/wholesale.test.js`, `tests/security.test.js`).

---

## [0.1.0-alpha] - 2026-09-04

### Added
- Initialized project Git repository as single source of truth.
- Added Master Development Roadmap (`ROADMAP.md`).
- Added Global AI Agent Guidelines (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`).
- Added Architectural Decision Records (`DECISIONS.md: ADR-001 to ADR-005`).
- Added initial state tracking files (`PROJECT_STATE.md`, `project-state.json`, `TASKS.md`).
