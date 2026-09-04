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
- **Frontend**: Mobile-First, Responsive React / Tailwind CSS Persian RTL Web App.
- **Backend**: Modular Node.js / Express API with RBAC guards.
- **Security & Authorization**: Role-based access control (`REGULAR`, `WHOLESALE`, `ADMIN`).
- **Wholesale Price Security**: **UI Security ≠ Real Security**. Wholesale pricing fields are sanitized on the server before API response serialization (`ADR-003`).
- **Cart & Orders**: Unit prices, wholesale minimums, and stock quantities are re-validated on the server at checkout.
- **Testing**: Automated CI test suites (`npm test`) covering price security, approval state machine, and cart calculations.

---

## 4. Current Progress
- **Overall Progress**: 75%
- **Current Phase**: Phase 6 & 8 Complete — Advancing to Phase 7 & 9 (Security Hardening & Production Delivery)

---

## 5. Completed
- Git repository initialization and commit strategy setup.
- Standard governance & agent collaboration suite (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`).
- Architectural Decision Records (`DECISIONS.md: ADR-001 to ADR-005`).
- System architecture specification (`ARCHITECTURE.md`).
- Persistent state tracking (`PROJECT_STATE.md`, `project-state.json`, `TASKS.md`, `CHANGELOG.md`).
- Full REST API with Auth, Products, Wholesale Applications, Cart Engine, Orders, and Admin endpoints.
- Backend price sanitizer middleware preventing wholesale price exposure.
- Wholesale application workflow and admin review/approval system.
- Responsive Persian RTL frontend with live role switcher, catalog filters, modal galleries, cart drawer, checkout, and admin dashboard.
- Automated testing suite with 100% pass rate.
- Production `.env.example` and `Dockerfile`.

---

## 6. In Progress
- Finalizing production readiness checks against Roadmap Section 46.

---

## 7. Remaining
- Final selection of Iranian payment gateway & SMS OTP credentials by business owner.
- Production deployment domain DNS and SSL certificate binding.

---

## 8. Known Bugs
- None.

---

## 9. Known Risks & Mitigations
- *Wholesale Price Leakage*: Mitigated via mandatory server-side `priceSanitizer` middleware and automated tests.
- *Price Tampering in Cart*: Mitigated by strict server-side price recalculation from database.

---

## 10. Important Decisions
- **ADR-001**: Git Repository is the Single Source of Truth.
- **ADR-002**: Wholesale customers require admin verification before receiving `WHOLESALE` pricing.
- **ADR-003**: Wholesale prices protected at API/Backend level, not just hidden in frontend UI.
- **ADR-004**: Dual Markdown & JSON project state tracking.
- **ADR-005**: Modular Node.js / Express architecture with responsive mobile-first UI.

---

## 11. Current Git Branch & Health Status
- **Branch**: `main`
- **CI Test Suite**: All tests passing (`npm test`).
- **Server**: Running and healthy at port 3000 (`/api/health`).

---

## 12. Recommended Next Step
- Review production deployment checklist and present project state and live deliverable.

---

## 13. Human Decisions Required
- Select Iranian Payment Gateway provider (Zarinpal / Pay.ir / Bank IPG).
- Select SMS OTP provider (Kavehnegar / FarazSMS).
