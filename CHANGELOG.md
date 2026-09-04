# CHANGELOG.md — Manto Moda Release History

All notable changes to the **Manto Moda** platform will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
