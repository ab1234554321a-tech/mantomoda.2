# PROJECT_STATE.md — Manto Moda Current Status

> **Notice for all AI Agents**: Read this file at the start of every session to establish current project awareness without relying on chat history.

---

## 1. Project Snapshot

- **Project Name**: Manto Moda (مانتو مدا)
- **Current Phase**: Phase 9 — Payment Gateway (Zarinpal) & SMS OTP (Kavehnegar) now implemented behind pluggable adapters; PostgreSQL/Prisma is the remaining delivery item
- **Overall Progress**: 92%
- **Health Score**: **94.4 / 100** (Evidence-based assessment in `PROJECT_AUDIT.md`)
- **Last Updated**: 2026-09-20 (payment + OTP integration)
- **Active Git Branch**: `main`
- **Last Major Change (2026-09-20, later)**: Implemented the two integrations that were blocked on business decisions — **Payment Gateway (BL-006 / ADR-008)** with a Zarinpal adapter and **SMS OTP verification (BL-007 / TD-003 / ADR-009)** with a Kavehnegar adapter. Orders now go `PENDING` → `PAID` only after server-side verification, codes are hashed and single-use, production refuses to start with unconfigured providers, and the automated gate grew from 4 to **6 suites** (+51 assertions). Both providers were selected for reliability and sit behind one-env-var adapters.
- **Previous Major Change (2026-09-20)**: Adopted the curated Claude Skills toolchain — audited all 188 upstream skills, installed the 69 that map to roadmap phases / Agent Roles / backlog items (`.claude/skills/` + `SKILLS.md` + cross-platform installers), and made the frame-embedding policy environment-scoped (`CSP_FRAME_ANCESTORS`, ADR-006 & ADR-007). All 4 test suites re-verified green.
- **Previous Major Change**: Completed Master Orchestrator CTO Cycle: Formalized all 12 Agent role specs (`agents/`), built protocol-compliant Stdio JSON-RPC 2.0 MCP server (`src/mcp/server.js`), implemented Zod request validation schemas, integrated Helmet security headers, anti-brute force rate limiting, SRE request duration logs, graceful shutdown handlers, and 4-tier automated test gate including Red Team adversarial tests.

---

## 2. Completed (انجام‌شده)

- [x] **Full 12-Agent Ecosystem (`agents/01` to `agents/12`)**:
  - [x] 01 System Architect, 02 Core Developer, 03 QA Test Engineer, 04 Security Officer, 05 Release Operator.
  - [x] 06 Performance Engineer, 07 Dependency Supply-Chain Engineer, 08 UX/Accessibility Engineer, 09 Data/Database Architect, 10 Observability/SRE Engineer, 11 Documentation Engineer, 12 Red Team Adversarial Tester.
- [x] **Protocol-Compliant MCP Server (`src/mcp/server.js`)**:
  - [x] Implemented on `@modelcontextprotocol/sdk` over Stdio JSON-RPC 2.0.
  - [x] Registered tools: `audit_project_health`, `verify_security_guard`, `get_project_state`, `list_catalog_items`.
  - [x] Registered resources: `manto://state`, `manto://architecture`.
- [x] **Web Security & Input Validation**:
  - [x] Zod schema validation on login, register, wholesale apply, and checkout order routes.
  - [x] Helmet HTTP security headers with Content-Security-Policy.
  - [x] Express Rate Limiting against authentication brute-force attacks.
  - [x] Total elimination of `x-user-id` header spoofing; enforced cryptographic HMAC-SHA256 JWT tokens.
  - [x] bcrypt password hashing with 10 salt rounds.
- [x] **Observability & SRE**:
  - [x] Automatic `X-Request-Id` generation and response header propagation.
  - [x] Structured request duration logging (`[HTTP] METHOD /path -> Status (duration ms)`).
  - [x] Extended health endpoint `/api/health` with memory metrics and uptime.
  - [x] Clean graceful shutdown on `SIGTERM` and `SIGINT`.
- [x] **Comprehensive 4-Tier Automated Test Gate (100% Passed)**:
  - [x] Level 1: Pricing Engine & Threshold Calculations (`tests/pricing.test.js`).
  - [x] Level 2: Wholesale Application & Admin Approval (`tests/wholesale.test.js`).
  - [x] Level 3: Price Isolation & JWT Cryptography (`tests/security.test.js`).
  - [x] Level 4: Red Team Adversarial, Type Confusion & BOLA (`tests/adversarial.test.js`).
- [x] **Payment Gateway Integration (BL-006 / ADR-008)**:
  - [x] Pluggable IPG adapter registry; **Zarinpal** implementation (sandbox flag, REST v4 request/verify, Toman→Rial conversion isolated in the adapter).
  - [x] Endpoints: `POST /api/payments/request`, `GET /api/payments/callback`, `POST /api/payments/verify`, `GET /api/payments/status/:orderId`.
  - [x] Order lifecycle hardened: created `PENDING`, marked `PAID` only after verified server-side; **idempotent** re-verification (never a double charge); amount always re-read from the stored order; ownership checked (BOLA/IDOR safe).
  - [x] Removed the simulated instant `PAID` from the data store; the client now redirects to the PSP and renders a dedicated payment-result view.
- [x] **SMS OTP Mobile Verification (BL-007 / TD-003 / ADR-009)**:
  - [x] Pluggable SMS adapter registry; **Kavehnegar** implementation (verify/lookup pattern sending).
  - [x] Hardened OTP service: salted SHA-256 storage (never plaintext), **single-use** codes, 120s TTL, 5-attempt lockout, 60s resend cooldown, hourly per-number ceiling (anti SMS-pumping).
  - [x] Passwordless mobile login/registration: `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `GET /api/auth/otp/policy`.
  - [x] Codes are never returned in an API response in production.
- [x] **Production Provider Guards**:
  - [x] The app refuses to start in production when `PAYMENT_PROVIDER` / `SMS_PROVIDER` is unset or unconfigured — a payment or OTP can never be silently faked.
  - [x] `mock` providers require an explicit `ALLOW_MOCK_PROVIDERS=true` (demo/staging only) or a test environment.
- [x] **Automated Gate Extended to 6 Suites**: Level 5 (payment, 24 assertions) and Level 6 (OTP/SMS, 27 assertions) added to the CI runner.
- [x] **AI Toolchain & Environment Policy (ADR-006, ADR-007)**:
  - [x] Audited 188 upstream Claude Skills; adopted 69 that map to roadmap phases, the 13 Agent Roles, and open backlog items.
  - [x] Vendored at `.claude/skills/` with installers (`scripts/install-claude-skills.sh`, `install-skills.bat`) and mapping doc (`SKILLS.md`).
  - [x] Made CSP `frame-ancestors` / `X-Frame-Options` environment-scoped via `CSP_FRAME_ANCESTORS` so staging and preview surfaces are testable without weakening production defaults.
  - [x] Rejected `automatic-stateful-prompt-improver` (ships a `curl | bash` installer) on security grounds.
- [x] **Engineering Governance & Registries**:
  - [x] `PROJECT_AUDIT.md` (17-point full audit report).
  - [x] `BACKLOG.md` (Prioritized issues registry).
  - [x] `TECH_DEBT.md` (Technical debt ledger).

---

## 3. In Progress (در حال اجرا)

- [ ] **Phase 9: Production Infrastructure & Persistent PostgreSQL**
  - [ ] Provisioning PostgreSQL database connection via Prisma ORM (`BL-005`).
  - [x] ~~Pluggable Payment Gateway IPG adapter (`BL-006`)~~ — **done** (Zarinpal, ADR-008).
  - [x] ~~SMS OTP provider integration (`BL-007`)~~ — **done** (Kavehnegar, ADR-009).
  - [ ] Live activation: supply `ZARINPAL_MERCHANT_ID` + set `ZARINPAL_SANDBOX=false`, and `KAVENEGAR_API_KEY` + approved pattern.

---

## 4. Blocked (مسدود شده)

- None.

---

## 5. Known Bugs (باگ‌های شناخته‌شده)

- None. All 4 automated test suites and live API endpoints validated with 0 errors.

---

## 6. Current Risks (ریسک‌های فعلی)

- **PostgreSQL Connection in Production**: Migration from in-memory store to PostgreSQL required for multi-replica horizontal scaling. (Mitigation: Data layer abstracted in `src/server/db/store.js`; OTP and payment records already go through it.)
- **Live Payment/SMS Credentials**: `ZARINPAL_MERCHANT_ID` and `KAVENEGAR_API_KEY` are merchant-side registrations. (Mitigation: adapters complete and unit-tested against the provider contracts; both flows are fully exercisable offline with the mock providers, which production explicitly refuses to use.)
- **In-memory OTP/payment state**: OTP records and payment sessions vanish on restart with the in-memory store. (Mitigation: Redis/PostgreSQL swap is a store-layer change; scheduled with `BL-005` / `TD-004`.)

---

## 7. Next Recommended Step (قدم بعدی پیشنهادی)

1. Connect persistent PostgreSQL database via Prisma ORM as defined in `BACKLOG.md` (BL-005). *(Tooling ready: `postgresql-optimization`, `database-design-patterns`, `refactoring-surgeon` per `SKILLS.md`.)*
2. Wire real IPG payment callback and SMS OTP verification upon business owner providing credentials.

---

## 8. Human Decisions Required (تصمیمات انسانی موردنیاز)

- ~~**Payment Gateway Choice**~~ → **DECIDED: Zarinpal** (ADR-008), selected for reliability (multi-bank smart routing keeps checkout up when a single bank is down) and fast activation without a bank terminal contract.
- ~~**SMS Gateway Choice**~~ → **DECIDED: Kavehnegar** (ADR-009), selected for OTP reliability and API quality.
- **Remaining merchant-side inputs** (no longer decisions, just credentials):
  1. `ZARINPAL_MERCHANT_ID` from the Zarinpal panel (and switch `ZARINPAL_SANDBOX=false`).
  2. `KAVENEGAR_API_KEY` + the approved OTP pattern name.
