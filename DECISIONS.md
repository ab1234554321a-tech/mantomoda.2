# Architectural Decision Records (ADRs) — DECISIONS.md

This log contains the record of all major architectural and technical decisions made for the **Manto Moda** platform. AI agents MUST NOT revert or alter accepted decisions without explicit justification and stakeholder approval.

---

## ADR-001: Git Repository as Single Source of Truth
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: The project is collaboratively developed by multiple autonomous AI agents (Claude, Codex, Arena AI) and human stakeholders. Context maintained in chat logs is fragile and non-persistent.
- **Decision**: The Git repository (code, markdown state files, commit history, and automated checks) is established as the sole authoritative source of truth.
- **Consequences**: Agents do not rely on chat memory; they read and update project state directly in the repository.

---

## ADR-002: Wholesale Customer Approval Workflow
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Manto Moda caters to both regular retail customers and wholesale buyers (boutiques, bulk purchasers). Wholesale rates and bulk minimum order quantities must only be accessible to verified merchants.
- **Decision**: Implement a two-step wholesale workflow:
  1. Regular user submits a Wholesale Application (business registration, contact details, tax/national ID).
  2. Admin reviews the application in the Admin Panel and grants `WHOLESALE` role upon verification.
  3. Rejected or unverified users remain with `REGULAR` role.
- **Consequences**: Prevents unauthorized retail buyers from viewing wholesale prices; protects wholesale margins and business relationships.

---

## ADR-003: Strict Backend-Enforced Price Protection
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Securing wholesale prices only via frontend UI checks (hiding elements in CSS/React) is vulnerable to inspection via browser DevTools or direct API requests.
- **Decision**: All price and discount logic MUST be enforced on the backend / API layer:
  - Wholesale price fields are omitted or sanitized from API responses unless the authenticated session has a verified `WHOLESALE` or `ADMIN` role.
  - Cart totals and checkout orders re-verify product prices, tier discounts, and stock availability on the backend before order creation.
- **Consequences**: Guarantees zero price leakage and immune to client-side tampering.

---

## ADR-004: Standardized Project State Files (Human + Machine Readable)
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Multiple agents need quick, deterministic access to project status, tasks, and roadblocks without parsing ambiguous chat histories.
- **Decision**: Maintain both Markdown (`PROJECT_STATE.md`, `TASKS.md`, `PROJECT_HANDOFF.md`) and JSON (`project-state.json`) state files at the repository root.
- **Consequences**: Seamless agent handoffs and automated CI/CD state verification.

---

## ADR-005: Technology Stack & Production Architecture
- **Status**: Accepted
- **Date**: 2026-09-04
- **Context**: Manto Moda needs a high-performance, SEO-friendly, responsive e-commerce web application with robust type safety, secure API endpoints, and clean modularity.
- **Decision**:
  - **Frontend**: React / Next.js (or modern TypeScript Vite/React SPA + SSR/Node backend) with TailwindCSS for responsive Mobile-First design.
  - **Backend**: Node.js / TypeScript RESTful / modular API with clean controllers, validation middlewares (Zod), and role-based access control (RBAC).
  - **Database & Data Layer**: SQLite / PostgreSQL with Prisma ORM or standard SQL relational models.
  - **Testing**: Vitest / Jest for unit and integration testing.
- **Consequences**: High reliability, end-to-end type safety, fast developer iterations, and straightforward containerized deployment.
