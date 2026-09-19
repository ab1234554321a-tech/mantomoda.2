# CHANGELOG.md — Manto Moda Release History

All notable changes to the **Manto Moda** platform will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Curated Claude Skills Toolchain (ADR-006)**: Reviewed all 188 skills of the MIT-licensed `erichowens/some_claude_skills` collection and adopted the **69** that map to roadmap phases, Agent Roles (`agents/01..13`), and open backlog items. Vendored at `.claude/skills/` so every clone has them; installable to the user profile via `scripts/install-claude-skills.sh` (macOS/Linux) or `install-skills.bat` (Windows, double-click).
- **`SKILLS.md`**: Skill-to-roadmap-phase and skill-to-agent-role mapping (Phase 9.1→10, all 13 agent roles, UI/UX, SEO, AI).
- **`scripts/install-claude-skills.sh`**: Group-based installer/uninstaller with `--group`, `--into-repo`, `--list`, `--force`, `--uninstall` flags. Validates every installed skill has a `SKILL.md`.
- **`CSP_FRAME_ANCESTORS` configuration**: Optional environment variable (documented in `.env.example`) to allow embedding the app in trusted staging/preview surfaces.

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
