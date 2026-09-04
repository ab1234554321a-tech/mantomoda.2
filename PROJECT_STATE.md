# PROJECT_STATE.md — Manto Moda Current Status

> **Notice for all AI Agents**: Read this file at the start of every session to establish current project awareness without relying on chat history.

---

## 1. Project Snapshot

- **Project Name**: Manto Moda (مانتو مدا)
- **Current Phase**: Phase 6 & Phase 8 (Core Application & Automated Testing) Complete — Initializing Phase 7 & 9 (Security Hardening & Production Delivery)
- **Overall Progress**: 75%
- **Last Updated**: 2026-09-04
- **Active Git Branch**: `main`
- **Last Major Change**: Implemented full-stack architecture: Express API server with RBAC middleware, backend Price Sanitization (`ADR-003`), Wholesale application & review lifecycle (`ADR-002`), dynamic Cart & Pricing calculation engine, Persian RTL responsive web UI, and automated CI test suite.

---

## 2. Completed (انجام‌شده)

- [x] **Phase 1 & 2: Governance & Source of Truth Setup**
  - [x] Initialized Git repository as Single Source of Truth (`main` branch).
  - [x] Security-hardened `.gitignore` preventing secret leakage.
  - [x] Embedded full 70-point Master Roadmap in `ROADMAP.md`.
  - [x] Formulated 14 Global AI Engineering Guidelines in `AGENTS.md`.
  - [x] Defined agent-specific guides (`CLAUDE.md`, `CODEX.md`).
  - [x] Recorded ADR-001 through ADR-005 in `DECISIONS.md`.
  - [x] Documented system architecture and domain models in `ARCHITECTURE.md`.
- [x] **Phase 3 & 6: Core Application Implementation**
  - [x] In-memory relational data store with seed users, products, variants, orders, and applications.
  - [x] Role-Based Access Control (`REGULAR`, `WHOLESALE`, `ADMIN`) middleware.
  - [x] **Strict Backend Price Sanitization**: Non-wholesale users never receive wholesale price fields in API responses.
  - [x] Wholesale application submission and admin review/approval state machine.
  - [x] Role-aware cart and pricing engine validating prices strictly on the server.
  - [x] Orders and checkout lifecycle management (`PENDING` -> `CONFIRMED` -> `PROCESSING` -> `SHIPPED` -> `DELIVERED`).
  - [x] Admin dashboard API endpoints (Stats KPI, Wholesale approvals, Order status updates, Catalog inventory).
- [x] **Frontend Mobile-First Web Client**
  - [x] Responsive Persian RTL UI with Tailwind CSS.
  - [x] Product catalog with category pills, season filters, sorting, and search debouncing.
  - [x] Interactive role switcher for live perspective testing (Guest, Retail, Pending, Wholesale, Admin).
  - [x] Product detail modal with multi-image gallery, variant selection, and quantity adjusters.
  - [x] Wholesale portal with merchant application form and live status tracking.
  - [x] Slide-out cart drawer with live server-side price recalculation and wholesale threshold notices.
  - [x] Step-by-step checkout modal with shipping address validation and order confirmation receipts.
  - [x] User order history view.
  - [x] Admin portal dashboard (KPI stats, wholesale approval review, order management, inventory overview).
- [x] **Phase 8: Automated Testing Gate**
  - [x] Security test suite: Wholesale price isolation verified (`tests/security.test.js`).
  - [x] Wholesale workflow test suite: Approval state machine verified (`tests/wholesale.test.js`).
  - [x] Pricing engine test suite: Bulk threshold & savings verified (`tests/pricing.test.js`).
  - [x] All test suites passing in CI runner (`npm test`).

---

## 3. In Progress (در حال اجرا)

- [ ] **Phase 7 & 9: Security Hardening & Production Readiness**
  - [ ] Request rate limiting for authentication routes.
  - [ ] Production environment variable configuration template.
  - [ ] Persistent database connection adapter (SQLite / PostgreSQL) for cloud deployment.

---

## 4. Blocked (مسدود شده)

- None.

---

## 5. Known Bugs (باگ‌های شناخته‌شده)

- None. All automated test suites and live API endpoints validated.

---

## 6. Current Risks (ریسک‌های فعلی)

- **Cloud DB Migration**: Transitioning from in-memory relational store to persistent SQL database in cloud production requires running database migration scripts.
- **Payment Gateway Integration**: Live banking gateway (Zarinpal/Saman) requires live merchant credentials before production launch.

---

## 7. Next Recommended Step (قدم بعدی پیشنهادی)

1. Add environment configuration template (`.env.example`).
2. Implement rate-limiting middleware for auth routes.
3. Prepare containerization (Dockerfile) for cloud deployment.

---

## 8. Human Decisions Required (تصمیمات انسانی موردنیاز)

- **Payment Gateway Provider**: Selection of final Iranian payment gateway provider (e.g., Zarinpal, Pay.ir, Saman Bank, Mellat Bank) for merchant terminal credentials.
- **SMS Gateway Provider**: Selection of Kavehnegar / FarazSMS for OTP verification on registration.
