# BACKLOG.md — Prioritized Engineering Backlog

This backlog tracks all active, scheduled, and future engineering tasks for the **Manto Moda** platform, prioritized by severity.

---

## Severity Definitions
- **P0**: Catastrophic (System down, critical data loss, security compromise)
- **P1**: Critical (Major security loophole, broken core business workflow)
- **P2**: High (Performance bottleneck, missing validation, significant UX bug)
- **P3**: Medium (Enhancement, code refactoring, test expansion)
- **P4**: Low (Minor aesthetic tweak, non-blocking documentation update)

---

## 1. Resolved Items (حل‌شده)

### [RESOLVED] BL-001: Header-Based User Impersonation Vulnerability
- **Severity**: P1 (Critical)
- **Category**: Security / Authentication
- **Evidence**: `x-user-id` header in `src/server/middlewares/auth.js` permitted unauthenticated role spoofing.
- **Solution**: Completely eliminated `x-user-id` inspection and enforced cryptographic HMAC-SHA256 JWT tokens with bcrypt password hashing.
- **Tests**: `tests/security.test.js` & `tests/adversarial.test.js`.
- **Status**: **RESOLVED** (Commit `9e36b8e`)

### [RESOLVED] BL-002: Real MCP Protocol Server Implementation
- **Severity**: P2 (High)
- **Category**: AI Infrastructure & Tools
- **Evidence**: Previous `mcp.json` contained one-shot CLI commands rather than standard JSON-RPC 2.0 stdio servers.
- **Solution**: Built protocol-compliant MCP Server (`src/mcp/server.js`) via `@modelcontextprotocol/sdk` exposing tools and resources.
- **Status**: **RESOLVED**

### [RESOLVED] BL-003: Input Validation & Schema Enforcement
- **Severity**: P2 (High)
- **Category**: Security / Input Sanitization
- **Evidence**: Routes accepted unvalidated request bodies.
- **Solution**: Added Zod schemas (`src/server/middlewares/validate.js`) for login, registration, wholesale applications, and order checkouts.
- **Status**: **RESOLVED**

### [RESOLVED] BL-004: Anti-Brute Force Rate Limiting & Security Headers
- **Severity**: P2 (High)
- **Category**: Web Security
- **Evidence**: Authentication endpoints had no rate limits; default Express headers were unhardened.
- **Solution**: Integrated `helmet` with custom CSP and `express-rate-limit` on `/api/auth/*` and general routes.
- **Status**: **RESOLVED**

---

## 2. Active Backlog (در دست اقدام و برنامه‌ریزی‌شده)

### [RESOLVED — implementation complete, live credentials pending] BL-006: Iranian Payment Gateway (IPG) Adapter
- **Severity**: P3 (Medium)
- **Category**: Integration / Payments
- **Evidence**: Checkout previously simulated instant payment (`paymentStatus: 'PAID'` hardcoded in the store).
- **Solution**: Pluggable IPG adapter layer (ADR-008) with a **Zarinpal** implementation:
  - `POST /api/payments/request` creates a session and returns the gateway URL.
  - `GET /api/payments/callback` (browser) and `POST /api/payments/verify` (JSON) verify the transaction.
  - `GET /api/payments/status/:orderId` for the client to poll.
  - Orders are created `PENDING`; they become `PAID` only after server-side verification. Amounts are
    converted Toman → Rial inside the adapter, always re-read from the stored order, and re-verified
    against the gateway. Verification is idempotent and ownership-checked (BOLA-safe).
- **Tests**: `tests/payment.test.js` (24 assertions).
- **Status**: **RESOLVED (code)** — awaiting `ZARINPAL_MERCHANT_ID` from the business owner to go live.

### [RESOLVED — implementation complete, live credentials pending] BL-007: SMS OTP Gateway Integration
- **Severity**: P3 (Medium)
- **Category**: Authentication / User Experience
- **Evidence**: Registration used a direct password; no mobile verification existed.
- **Solution**: Pluggable SMS adapter (ADR-009) with a **Kavehnegar** implementation plus a hardened OTP
  service: salted-SHA-256 storage, single-use codes, 120s TTL, 5-attempt lockout, 60s resend cooldown,
  hourly per-number ceiling. Endpoints `POST /api/auth/otp/request` and `POST /api/auth/otp/verify`;
  first successful verification creates the account (passwordless registration).
- **Tests**: `tests/otp.test.js` (27 assertions).
- **Status**: **RESOLVED (code)** — awaiting `KAVENEGAR_API_KEY` + approved pattern from the business owner.

### BL-005: Persistent PostgreSQL Database Migration (Prisma ORM)
- **Severity**: P2 (High)
- **Category**: Data Layer & Scalability
- **Evidence**: Current data store is in-memory and resets on process restart.
- **Proposed Solution**: Generate Prisma schema based on `ARCHITECTURE.md` models, add database migration scripts, and configure PostgreSQL connection string via `.env`.
- **Dependencies**: PostgreSQL instance provisioned.
- **Tests Required**: Database connection and CRUD integration tests.
- **Status**: **PLANNED (Phase 9)**

