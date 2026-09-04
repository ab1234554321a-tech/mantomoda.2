# CHANGELOG.md — Manto Moda Release History

All notable changes to the **Manto Moda** platform will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0-beta] - 2026-09-04

### Added
- Implemented full modular Node.js/Express backend API with RBAC authorization middleware (`REGULAR`, `WHOLESALE`, `ADMIN`).
- Implemented **Strict Backend Price Sanitization Pipeline** (`ADR-003`) completely omitting wholesale prices from API responses for retail/guest users.
- Implemented Wholesale Merchant Application & Admin Approval workflow (`ADR-002`).
- Implemented Server-Verified Shopping Cart and Pricing Engine recalculating prices and applying bulk threshold rates strictly on the backend.
- Implemented Order processing lifecycle with order numbering, status transitions, and ownership protection.
- Implemented Admin Management endpoints (KPI stats, wholesale application reviews, order status updates, catalog overview).
- Implemented Responsive Persian RTL Web Client with Tailwind CSS, Lucide icons, product catalog, search/filters, product modal, wholesale portal, slide-out cart drawer, and interactive admin panel.
- Implemented Quick Role Switcher for live perspective testing across Guest, Retail, Pending Applicant, Wholesale Merchant, and Admin roles.
- Implemented Automated Testing Suite (`tests/security.test.js`, `tests/wholesale.test.js`, `tests/pricing.test.js`, `tests/run-tests.js`).
- Added `.env.example` template and production `Dockerfile`.

---

## [0.1.0-alpha] - 2026-09-04

### Added
- Initialized project Git repository as single source of truth.
- Added Master Development Roadmap (`ROADMAP.md`) covering all 70 foundational principles.
- Added Global AI Agent Guidelines (`AGENTS.md`) with the 14 core collaboration rules.
- Added specialized agent workflow specifications (`CLAUDE.md` and `CODEX.md`).
- Added Architectural Decision Records (`DECISIONS.md` covering ADR-001 through ADR-005).
- Added complete system architecture and domain models specification (`ARCHITECTURE.md`).
- Added persistent project state trackers (`PROJECT_STATE.md`, `project-state.json`, `TASKS.md`).
- Added cross-agent handoff snapshot document (`PROJECT_HANDOFF.md`).
- Added `.gitignore` configured for zero secret leakage.
