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

---

## ADR-006: Curated Claude Skills Toolchain for AI Agents
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: The project is developed by multiple AI agents (Claude Code, Codex, Arena AI) that repeatedly need deep domain expertise: PostgreSQL/Prisma migration (BL-005), IPG & SMS OTP adapters (BL-006/BL-007), Persian RTL accessibility, Playwright E2E, SEO. Ad-hoc prompting produces inconsistent quality and duplicated reasoning across agents and sessions.
- **Decision**: Adopt a curated subset of the MIT-licensed `erichowens/some_claude_skills` collection (188 skills reviewed → **69 selected**), vendored into the repository at `.claude/skills/` and installable to the user profile via `scripts/install-claude-skills.sh` or `install-skills.bat`.
  - Selection criterion is roadmap-driven, not aesthetic: a skill is included only if it maps to a named roadmap phase (`AUDIT_REALITY_REPORT.md` §N), an Agent Role (`agents/01..13`), or an open backlog item.
  - Every skill was security-audited before adoption (no `curl | bash` installers, no hardcoded secrets, no prompt-injection phrasing). `automatic-stateful-prompt-improver` was **rejected** for shipping a `curl | bash` setup step.
  - The skill→phase and skill→agent-role mapping is maintained in `SKILLS.md`.
- **Consequences**: Agents operate from a shared, versioned expertise baseline; additions/removals are reviewed through this ADR. Costs ~4k tokens of skill metadata per session, so the set is grouped (`--group meta|backend|qa|ux|seo|...`) for trimming. Skills are instruction files only — they never modify project state by themselves.

---

## ADR-007: Environment-Scoped Frame Embedding Policy
- **Status**: Accepted
- **Date**: 2026-09-20
- **Context**: Helmet applied a fixed `frame-ancestors 'self'` CSP directive plus `X-Frame-Options: SAMEORIGIN`. This blocked legitimate embedding of the app in trusted staging/preview/demo surfaces (e.g. an internal admin wrapper or a preview pane) and made such environments untestable without patching security code.
- **Decision**: Make the frame policy explicit and environment-scoped:
  - `CSP_FRAME_ANCESTORS` env var (comma-separated origins) drives the CSP `frame-ancestors` directive.
  - When unset (default, and always in production) behaviour is unchanged: `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`.
  - `frameguard` is disabled **only** when `CSP_FRAME_ANCESTORS` is explicitly set, because `X-Frame-Options` would otherwise override the widened CSP.
- **Consequences**: Embedding is opt-in per environment, is auditable via env config, and cannot be widened accidentally. Documented in `.env.example` with an explicit "never use `*` in production" warning. All 4 test suites re-verified green after the change.
