# PROJECT_HANDOFF.md — AI & Engineering Handoff Document

This document serves as an immediate, self-contained handoff snapshot for any AI Agent (Claude Code, Codex, Arena AI, ChatGPT) or human engineer entering the **Manto Moda** project.

---

## 1. Project
**Manto Moda (مانتو مدا)** — A Production-Ready Women's Fashion & Outerwear E-Commerce Platform supporting Retail, Wholesale Customer Workflows (with Admin verification), and an Admin Management System.

---

## 2. Purpose & Operating Model
- **User / Stakeholder**: Business Owner & Decision Maker.
- **Claude Code**: Architecture, Planning, Security Review, Deep System Analysis.
- **Codex**: Implementation, Bug Fixing, Controlled Refactoring, Test Authoring.
- **GitHub**: Sole Source of Truth.
- **Zero Chat Dependency**: All context is read and maintained inside this repository.

---

## 3. Current Architecture Summary
- **Frontend**: Mobile-First, Responsive React / TypeScript UI with RTL Persian layout.
- **Backend**: Modular Node.js / Express / TypeScript API.
- **Security & Authorization**: Role-based access control (`REGULAR`, `WHOLESALE`, `ADMIN`).
- **Wholesale Price Security**: **UI Security ≠ Real Security**. Wholesale pricing fields are sanitized on the server before API response serialization unless the user is authenticated as a verified Wholesale merchant or Admin.
- **Cart & Orders**: Unit prices, wholesale minimums, and stock quantities are re-validated on the server at checkout.

---

## 4. Current Progress
- **Overall Progress**: 15%
- **Current Phase**: Phase 3 & 6: Core Scaffolding & Foundation Setup

---

## 5. Completed
- Git repository initialization and commit strategy setup.
- Standard governance & agent collaboration suite (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`).
- Architectural Decision Records (`DECISIONS.md`).
- System architecture specification (`ARCHITECTURE.md`).
- Persistent state tracking (`PROJECT_STATE.md`, `project-state.json`, `TASKS.md`, `CHANGELOG.md`).

---

## 6. In Progress
- Scaffolding the Node.js/TypeScript application structure.
- Shared domain types (`src/shared/types/index.ts`).
- Server initialization with RBAC, auth, and price sanitizer middlewares.

---

## 7. Remaining
- Authentication & JWT session token handling.
- Wholesale application submission and admin review dashboard.
- Product catalog API & responsive catalog UI with search/filters.
- Server-side price sanitization and security tests.
- Shopping cart, role-aware pricing engine, and order state machine.
- Admin dashboard for products, orders, inventory, and wholesale verification.
- Unit, integration, and security test suites.
- Production deployment configuration and health check endpoints.

---

## 8. Known Bugs
- None (Greenfield foundation).

---

## 9. Known Risks
- *Wholesale Price Leakage*: Mitigated via mandatory server-side `priceSanitizer` middleware.
- *Price Tampering in Cart*: Mitigated by strict server-side price recalculation from database.

---

## 10. Important Decisions
- **ADR-001**: Git Repository is the Single Source of Truth.
- **ADR-002**: Wholesale customers require admin verification before receiving `WHOLESALE` pricing.
- **ADR-003**: Wholesale prices protected at API/Backend level, not just hidden in frontend UI.
- **ADR-004**: Dual Markdown & JSON project state tracking.
- **ADR-005**: Modular Node.js / TypeScript architecture with React frontend.

---

## 11. Current Git Branch & Commit
- **Branch**: `main`
- **Initial Setup**: Governance, documentation, and state tracking files committed.

---

## 12. Recommended Next Step
- Initialize `package.json`, TypeScript configuration, shared models, Express API server, and automated tests.

---

## 13. Human Decisions Required
- None at this stage. Autonomous technical implementation proceeds.
