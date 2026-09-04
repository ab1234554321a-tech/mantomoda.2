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

---

## 2. In Progress (در حال اجرا)

- [ ] **Phase 3 & 6: Core Application Scaffolding & Foundation**
  - [ ] Setup `package.json`, TypeScript configuration, and build scripts.
  - [ ] Implement backend server with modular directory structure (controllers, middlewares, routes, services).
  - [ ] Setup frontend application scaffold (React / TailwindCSS / Mobile-First RTL layout).
  - [ ] Setup unified shared types (`src/shared/types/index.ts`) for User, Product, Order, Cart, WholesaleApplication.

---

## 3. Planned (برنامه‌ریزی شده)

### Phase 6: Core Application Features
- [ ] **Authentication & Identity System**
  - [ ] User registration (phone / email + password).
  - [ ] Login / Logout with JWT / Session management.
  - [ ] Password hashing via bcrypt & token expiration handling.
  - [ ] Protected route guards for React frontend and Express backend.
- [ ] **Wholesale Application & Approval Flow**
  - [ ] Wholesale application submission form (Business name, ID, address, phone).
  - [ ] Admin panel view to review, approve, or reject wholesale applications.
  - [ ] Role upgrade to `WHOLESALE` upon approval.
- [ ] **Product Catalog & Management**
  - [ ] Product model with variants (color, size, stock, SKU).
  - [ ] Retail price vs Wholesale price tier calculation.
  - [ ] Product search, category filters, season filters, color/size filters.
- [ ] **Price Protection & Security Pipeline**
  - [ ] Backend price sanitizer middleware preventing wholesale price leakage.
  - [ ] Security test verifying non-authenticated and retail users cannot access wholesale prices.
- [ ] **Cart & Order Flow**
  - [ ] Cart management (add, update qty, remove item).
  - [ ] Backend total calculation with role-based unit prices and wholesale minimums.
  - [ ] Checkout flow and Order creation with status tracking (`PENDING`, `CONFIRMED`, `PROCESSING`, etc.).
- [ ] **Admin Dashboard**
  - [ ] Product CRUD with variant management.
  - [ ] Wholesale request management dashboard.
  - [ ] Order list, details, and status update actions.
  - [ ] User management and role assignment.

### Phase 7: Security Hardening
- [ ] Rate limiting on authentication and sensitive endpoints.
- [ ] Input validation via Zod schemas on all API routes.
- [ ] Secure HTTP headers (Helmet, CORS policy).

### Phase 8: Comprehensive Testing
- [ ] Unit tests for pricing logic and wholesale discounts.
- [ ] Integration tests for Auth & RBAC endpoints.
- [ ] Security regression tests for price leakage and unauthorized access.

### Phase 9: Production Deployment Readiness
- [ ] Build verification and zero type errors.
- [ ] Production environment variable configuration template.
- [ ] Health check endpoints (`/api/health`).

---

## 4. Blocked (مسدود شده)

*(None currently. No external blockers.)*

---

## 5. Technical Debt (بدهی فنی)

- [ ] Add rate-limiter middleware when public traffic is exposed.
- [ ] Implement automated database migrations when moving from local DB to cloud database.
