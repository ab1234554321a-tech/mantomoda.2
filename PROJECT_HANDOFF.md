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
- **AI Skill Toolchain**: 69 curated Claude Skills vendored at `.claude/skills/` (ADR-006). **Read `SKILLS.md`** to load the skills mapped to the phase/role you are about to work on. Installers: `scripts/install-claude-skills.sh` (macOS/Linux), `install-skills.bat` (Windows).
- **Frame/Embedding Policy**: `CSP_FRAME_ANCESTORS` env var (ADR-007). Default production behaviour unchanged (`frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`).
- **Payments (BL-006 / ADR-008)**: `src/server/services/payment/` — pluggable registry (`zarinpal` | `mock`). Orders are `PENDING` until verified. Amounts: storefront = Toman, PSP = Rial (converted only inside the adapter). Verification is idempotent and amount-checked against the stored order.
- **OTP / SMS (BL-007 / ADR-009)**: `src/server/services/sms/` + `src/server/services/otp.service.js` — pluggable registry (`kavenegar` | `mock`). Codes are salted-hashed, single-use, TTL-limited and rate-limited.
- **Provider guards**: production refuses to start with an unconfigured provider; `mock` needs `ALLOW_MOCK_PROVIDERS=true`.

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

## 11.b Skill Toolchain State (2026-09-20)
- 188 upstream skills audited → **69 active** for this roadmap; groups: `meta backend devops qa frontend ux seo docs ai`.
- Mapping of skill → roadmap phase (9.1→10) and → Agent Role (01..13) lives in `SKILLS.md`.
- Skills are instruction files only; they do not mutate state. Any new adoption requires a security audit + ADR.

---

## 11.c Integration State (2026-09-20)
- Payment gateway (Zarinpal) and SMS OTP (Kavehnegar) adapters are **implemented, tested and committed**; both were chosen for reliability over the alternatives.
- Live activation requires only merchant credentials in `.env` — no code change:
  `PAYMENT_PROVIDER=zarinpal`, `ZARINPAL_MERCHANT_ID=<uuid>`, `ZARINPAL_SANDBOX=false`, `PAYMENT_CALLBACK_BASE_URL=https://<domain>`
  `SMS_PROVIDER=kavehnegar`, `KAVENEGAR_API_KEY=<key>`, `KAVENEGAR_SENDER=<line>`, `KAVENEGAR_OTP_TEMPLATE=<pattern>`
- Automated gate: `npm test` → 6 suites, all green.
- **Known limitation**: with the in-memory store, payment sessions and OTP records are lost on restart (fine for single-instance; resolved by BL-005 / Redis).

---

## 12. Recommended Next Step
- Review production deployment checklist and present project state and live deliverable.

---

## 13. Human Decisions Required
- ~~Select Iranian Payment Gateway provider~~ → **DECIDED: Zarinpal** (ADR-008).
- ~~Select SMS OTP provider~~ → **DECIDED: Kavehnegar** (ADR-009).
- Remaining merchant-side inputs (credentials, not decisions): `ZARINPAL_MERCHANT_ID`, `KAVENEGAR_API_KEY` + approved OTP pattern.
