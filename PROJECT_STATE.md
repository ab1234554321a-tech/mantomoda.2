# PROJECT_STATE.md — Manto Moda Current Status

> **Notice for all AI Agents**: Read this file at the start of every session to establish current project awareness without relying on chat history.

---

## 1. Project Snapshot

- **Project Name**: Manto Moda (مانتو مدا)
- **Current Phase**: Phase 1 & 2 Completed — Initializing Phase 3 & 6 (Core Scaffolding & Foundation)
- **Overall Progress**: 15%
- **Last Updated**: 2026-09-04
- **Active Git Branch**: `main`
- **Last Major Change**: Initialized Git repository, established all governance, architecture, and agent collaboration documentation (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `PROJECT_STATE.md`, `TASKS.md`, `CHANGELOG.md`).

---

## 2. Completed (انجام‌شده)

- [x] Initialized Git repository as Single Source of Truth.
- [x] Configured `.gitignore` to prevent secret leakage.
- [x] Embedded the full 70-point Master Roadmap in `ROADMAP.md`.
- [x] Established 14 Global AI Engineering Guidelines in `AGENTS.md`.
- [x] Formulated specialized agent workflows in `CLAUDE.md` and `CODEX.md`.
- [x] Recorded core Architectural Decision Records (`DECISIONS.md`: ADR-001 through ADR-005).
- [x] Documented full domain models, RBAC specs, and price security pipeline in `ARCHITECTURE.md`.
- [x] Created machine-readable state (`project-state.json`) and task tracker (`TASKS.md`).
- [x] Created handoff snapshot template (`PROJECT_HANDOFF.md`) and initial changelog (`CHANGELOG.md`).

---

## 3. In Progress (در حال اجرا)

- [ ] Core project scaffolding: `package.json`, TypeScript configuration, Express backend API, React/Tailwind frontend, shared domain types and validation schemas.

---

## 4. Blocked (مسدود شده)

- None.

---

## 5. Known Bugs (باگ‌های شناخته‌شده)

- None (Clean greenfield foundation).

---

## 6. Current Risks (ریسک‌های فعلی)

- **Wholesale Price Leakage**: Wholesale prices must never be sent in API responses to unverified or retail users. Mitigation: Centralized `priceSanitizer` middleware on all product routes.
- **Client Price Manipulation**: Tampering with cart payload prices. Mitigation: All cart totals and order lines must recalculate unit prices against server database records.

---

## 7. Next Recommended Step (قدم بعدی پیشنهادی)

1. Scaffold the core Node.js / TypeScript environment (`package.json`, `tsconfig.json`, build scripts).
2. Build the shared domain models and schemas (`src/shared/types/index.ts`).
3. Implement the backend server with Auth, RBAC guards, Price Sanitization middleware, Product Catalog, and Wholesale Application endpoints.
4. Setup automated unit & security tests verifying that price protection and RBAC operate as specified.

---

## 8. Human Decisions Required (تصمیمات انسانی موردنیاز)

- None at this stage. Technical requirements and architecture are fully defined in `ROADMAP.md` and `ARCHITECTURE.md`. Technical implementation proceeds autonomously.
