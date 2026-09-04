# TASKS.md — Project Task Tracker

This document tracks all tasks, milestones, technical debt, and blocker items across the **Manto Moda** project lifecycle.

---

## 1. Completed (انجام شده)

- [x] **Phase 1 & 2: Repository Audit & Governance Setup**
  - [x] Initialize Git repository with `main` branch.
  - [x] Create `.gitignore` to protect environment secrets and cache files.
  - [x] Save Master Roadmap specification (`ROADMAP.md`).
  - [x] Establish Agent Collaboration Protocol (`AGENTS.md`).
  - [x] Define agent-specific guides (`CLAUDE.md`, `CODEX.md`).
  - [x] Record initial Architectural Decision Records (`DECISIONS.md`).
  - [x] Document System Architecture & Domain Models (`ARCHITECTURE.md`).
  - [x] Establish Machine-Readable & Human-Readable State (`PROJECT_STATE.md`, `project-state.json`).
  - [x] Setup Handoff document (`PROJECT_HANDOFF.md`) and initial changelog (`CHANGELOG.md`).
- [x] **Phase 3 & 6: Core Application & Infrastructure**
  - [x] Setup `package.json`, Express server, CORS, and modular architecture.
  - [x] Build in-memory ACID-like relational data store with realistic seed data.
  - [x] Implement RBAC authorization middleware (`REGULAR`, `WHOLESALE`, `ADMIN`).
  - [x] Implement **Backend Price Sanitizer** (`ADR-003`) eliminating wholesale price exposure to retail/guest users.
  - [x] Implement Wholesale Application & Approval workflow API (`ADR-002`).
  - [x] Implement Cart calculation engine with server-side price recalculation and bulk threshold rules.
  - [x] Implement Order creation, ownership security, and status transition API.
  - [x] Implement Admin management endpoints (KPI stats, wholesale approval review, order status management).
- [x] **Frontend Mobile-First Web Client**
  - [x] Responsive RTL Persian layout with Tailwind CSS.
  - [x] Role Switcher for live perspective testing (Guest, Retail, Wholesale, Pending, Admin).
  - [x] Product catalog with category pills, season filter, sort filter, and debounced search.
  - [x] Product detail modal with image gallery, color & size variants, and quantity picker.
  - [x] Wholesale Portal with merchant application form and live status tracking.
  - [x] Interactive Cart Drawer with live backend calculations and threshold notices.
  - [x] Multi-step Checkout modal with address capture and confirmation receipts.
  - [x] User Orders view with status badges.
  - [x] Full-featured Admin Dashboard with wholesale approval actions and order management.
- [x] **Phase 8: Automated Testing Gate**
  - [x] Security test suite verifying price sanitization and role guards (`tests/security.test.js`).
  - [x] Wholesale approval state machine tests (`tests/wholesale.test.js`).
  - [x] Pricing engine & discount calculation tests (`tests/pricing.test.js`).
  - [x] Automated CI runner passing with 0 errors (`npm test`).

---

## 2. In Progress (در حال اجرا)

- [ ] **Phase 7 & 9: Security Hardening & Production Configuration**
  - [ ] Environment variable template (`.env.example`).
  - [ ] Production containerization configuration (`Dockerfile`).
  - [ ] Production readiness verification against Roadmap Section 46.

---

## 3. Planned (برنامه‌ریزی شده)

### Phase 9 & 10: Production Deployment & Continuous Integration
- [ ] Connect production PostgreSQL/MySQL database via Prisma ORM.
- [ ] Connect Iranian IPG Payment Gateway (Zarinpal / Saman Bank) upon merchant terminal delivery.
- [ ] Connect SMS OTP service (Kavehnegar) for SMS authentication.
- [ ] Configure SSL certificate, domain DNS, and automated daily backups.

---

## 4. Blocked (مسدود شده)

*(None currently. No technical blockers.)*

---

## 5. Technical Debt (بدهی فنی)

- [ ] Replace simulated session tokens with cryptographically signed RS256 JWT tokens with refresh rotation.
- [ ] Add Redis caching layer for catalog query optimization on heavy traffic.
