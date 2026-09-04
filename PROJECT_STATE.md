# PROJECT_STATE.md — Manto Moda Current Status

> **Notice for all AI Agents**: Read this file at the start of every session to establish current project awareness without relying on chat history.

---

## 1. Project Snapshot

- **Project Name**: Manto Moda (مانتو مدا)
- **Current Phase**: Phase 7, 8 & CTO Orchestration Complete — Advancing to Phase 9 (Persistent PostgreSQL & Production Delivery)
- **Overall Progress**: 88%
- **Health Score**: **94.4 / 100** (Evidence-based assessment in `PROJECT_AUDIT.md`)
- **Last Updated**: 2026-09-04
- **Active Git Branch**: `main`
- **Last Major Change**: Completed Master Orchestrator CTO Cycle: Formalized all 12 Agent role specs (`agents/`), built protocol-compliant Stdio JSON-RPC 2.0 MCP server (`src/mcp/server.js`), implemented Zod request validation schemas, integrated Helmet security headers, anti-brute force rate limiting, SRE request duration logs, graceful shutdown handlers, and 4-tier automated test gate including Red Team adversarial tests.

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
- [x] **Engineering Governance & Registries**:
  - [x] `PROJECT_AUDIT.md` (17-point full audit report).
  - [x] `BACKLOG.md` (Prioritized issues registry).
  - [x] `TECH_DEBT.md` (Technical debt ledger).

---

## 3. In Progress (در حال اجرا)

- [ ] **Phase 9: Production Infrastructure & Persistent PostgreSQL**
  - [ ] Provisioning PostgreSQL database connection via Prisma ORM (`BL-005`).
  - [ ] Pluggable Payment Gateway IPG adapter for live merchant transactions (`BL-006`).
  - [ ] SMS OTP provider integration (`BL-007`).

---

## 4. Blocked (مسدود شده)

- None.

---

## 5. Known Bugs (باگ‌های شناخته‌شده)

- None. All 4 automated test suites and live API endpoints validated with 0 errors.

---

## 6. Current Risks (ریسک‌های فعلی)

- **PostgreSQL Connection in Production**: Migration from in-memory store to PostgreSQL required for multi-replica horizontal scaling. (Mitigation: Data layer abstracted in `src/server/db/store.js`).
- **Live Bank Terminal Credentials**: Required from stakeholder for real transaction settlement.

---

## 7. Next Recommended Step (قدم بعدی پیشنهادی)

1. Connect persistent PostgreSQL database via Prisma ORM as defined in `BACKLOG.md` (BL-005).
2. Wire real IPG payment callback and SMS OTP verification upon business owner providing credentials.

---

## 8. Human Decisions Required (تصمیمات انسانی موردنیاز)

- **Payment Gateway Choice**: Zarinpal vs Direct Bank IPG (Saman / Mellat).
- **SMS Gateway Choice**: Kavehnegar vs FarazSMS.
