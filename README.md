# Manto Moda (مانتو مدا)

> **Production-Ready Multi-Tier Fashion E-Commerce Platform**  
> Developed autonomously with AI Engineering protocols (Claude Code, Codex, Arena AI) and GitHub as the Single Source of Truth.

---

## 🌟 Overview

**Manto Moda** is a modern e-commerce web application tailored for the Iranian fashion and outerwear market. It seamlessly bridges two core market segments:
1. **Retail Customers (خرده‌فروشی)**: Intuitive mobile-first shopping, seasonal collections, filtering by color/size/material, responsive cart, and direct checkout.
2. **Wholesale Merchants (عمده‌فروشی)**: Dedicated application and approval workflow, bulk order thresholds, and secured wholesale pricing.
3. **Store Administrators (مدیریت فروشگاه)**: End-to-end management of inventory, products, wholesale merchant verifications, order lifecycles, and pricing tiers.

---

## 🛡️ Core Architectural Pillars

- **Single Source of Truth**: The Git repository houses all code, documentation, architecture records, and real-time project state (`PROJECT_STATE.md` / `project-state.json`). AI agents do not rely on fragile chat memory.
- **Real Backend Security**: **UI Security ≠ Real Security**. Wholesale pricing and margin data are stripped at the API/middleware layer for non-wholesale users, preventing inspection or price leakage.
- **Real Payments, Real Verification**: The UI never decides that an order is paid. Orders start `PENDING`, the amount is re-read from the database (never from the request), and only a server-side verification call to the PSP flips them to `PAID` — idempotently, so a replayed callback cannot double-charge.
- **Autonomous Multi-Agent Collaboration**: Strict collaboration rules in `AGENTS.md`, `CLAUDE.md`, and `CODEX.md` ensure that Claude Code, Codex, and other tools work seamlessly together.

---

## 📂 Project Structure & State Files

| File | Purpose |
| :--- | :--- |
| `ROADMAP.md` | The full 70-point Master Development Roadmap |
| `PROJECT_STATE.md` | Active project state, progress %, risks, and next steps |
| `project-state.json` | Machine-readable project state for AI agents & CI/CD |
| `TASKS.md` | Detailed milestone tracker with completed, active, and planned items |
| `ARCHITECTURE.md` | System architecture, domain schemas, API specs, and data flows |
| `DECISIONS.md` | Architectural Decision Records (ADRs) |
| `CHANGELOG.md` | Release history and semantic versioning log |
| `AGENTS.md` | The 14 Global AI Engineering Guidelines |
| `CLAUDE.md` | Claude Code specialized workflows and focus areas |
| `CODEX.md` | Codex specialized workflows and focus areas |
| `PROJECT_HANDOFF.md` | Instant context snapshot for agent-to-agent handoffs |

---

## 🚀 Quick Start for AI Agents

1. **Read Global Rules**: `AGENTS.md`
2. **Check Current Phase & Tasks**: `PROJECT_STATE.md` & `TASKS.md`
3. **Verify Git History**: `git log -n 5`
4. **Follow Definition of Done**: Analysis -> Implementation -> Testing -> Regression Check -> State Update -> Conventional Commit.

---

## ⚙️ Technology Stack

- **Frontend**: Vanilla JS SPA (`src/client/public/app.js`) + TailwindCSS, mobile-first Persian RTL
- **Backend**: Node.js, Express, Zod, JWT (HMAC-SHA256), bcrypt
- **Payments**: Zarinpal IPG behind a pluggable adapter (ADR-008) — sandbox-aware
- **SMS / OTP**: Kavehnegar behind a pluggable adapter (ADR-009) — hashed, single-use, rate-limited codes
- **Testing**: 6 automated suites via `npm test` (Node's built-in `assert` + HTTP-level flow checks)
- **State Management**: Single in-memory client store (no framework), server is the source of truth for prices

> **Roadmap note (Phase 9.1)**: the docs previously described a React/TypeScript/Vite stack that was never
> built. The shipped client is a focused Vanilla JS SPA. A React/Next.js migration remains a *planned*
> option (`TD-005`) for SSR/SEO, not a description of today's code.
- **Architecture**: Modular Controller-Service-Repository Pattern with RBAC Guards

## 9. Operational Guarantees (Phase 9.5)

These are the guarantees that make the shop safe to sell from, and each one is covered by an
automated test (`npm test`, 7 suites) or a gate (`npm run a11y`):

| Guarantee | How it is enforced | Proof |
|---|---|---|
| Orders survive a restart | Atomic JSON snapshot, debounced, flushed on shutdown (`PERSIST_DATA=true`) | Verified end-to-end across a real process restart |
| The shop can never oversell | Validate-then-decrement on checkout; 409 with per-item availability | `tests/operations.test.js` + HTTP walkthrough |
| Cancelling returns stock | `db.releaseStock` on the `CANCELLED` transition | Same suite |
| Order status cannot jump | Explicit state machine; 409 lists the legal next steps | Same suite |
| You can see who changed what | `order.statusHistory[]` (from → to, who, when, note) | Same suite |
| Customers get an SMS | Persian messages at placement, payment, each status change | Same suite (including gateway-failure tolerance) |
| Photos can be uploaded | Admin upload → content sniffing → WebP + thumbnail | Same suite (polyglot upload rejected) |
| Google/Instagram see products | Pre-rendered product pages with OG tags and Product JSON-LD, sitemap, robots | Same suite |
| Keyboard/screen-reader basics | `npm run a11y` — 17 checks, run in CI | `npm run a11y` |
| Data can be recovered | `npm run backup` (verify + rotate) and `--restore` | Script tested |

**Running with persistence (production):**

```bash
PERSIST_DATA=true DATA_DIR=/var/lib/mantomoda UPLOAD_DIR=/var/lib/mantomoda/uploads \
  JWT_SECRET="<32+ chars>" PAYMENT_PROVIDER=zarinpal SMS_PROVIDER=kavenegar npm start
```

**Backups (daily cron example):**

```cron
30 3 * * * cd /srv/mantomoda && bash scripts/backup.sh --keep 30 >> logs/backup.log 2>&1
```

## 10. Back-Office: Running the Shop Without a Developer (Phase 10)

Everything in this table is done from the admin panel; each row is covered by `tests/commerce.test.js`.

| What you can do | Where | Notes |
|---|---|---|
| Change shipping tariffs, free-shipping threshold, low-stock threshold, owner mobile, invoice identity | پنل → تنظیمات فروشگاه | Applies immediately to the cart, checkout and invoices |
| Create a promotion | پنل → کد تخفیف | Percent or fixed, minimum basket, cap, usage/per-customer limits, expiry, retail/wholesale |
| Add or edit a product | پنل → محصولات → افزودن محصول | Variants (colour/size/stock), unique slug and Latin warehouse SKU generated automatically |
| Upload product photos | پنل → محصولات → adding image | Converted to WebP + thumbnail, EXIF stripped |
| Remove a product from sale | پنل → محصولات → برداشتن از فروشگاه | Archived, not deleted: order history stays intact and it can be restored |
| Fix stock fast | پنل → انبار و موجودی بحرانی | Per colour/size; you get an SMS when something runs low |
| Find an order | پنل → سفارش‌ها | Search by number, name, mobile, city or coupon; filter by status/payment/date |
| Export for accounting | پنل → سفارش‌ها → خروجی اکسل (CSV) | UTF-8 BOM CSV — opens correctly in Excel with Persian headers |
| Send an invoice | پنل → سفارش‌ها → لینک فاکتور | Signed 30-day link; prints cleanly and can be forwarded to an accountant |
| See how the shop is doing | پنل (dashboard) | Recognised revenue today/month/total, average order value, awaiting payment, best sellers, critical stock |
| See who changed what | پنل → گزارش اقدامات | Actor, action, entity, timestamp and IP for every successful admin change |

**Recommended first-run setup:** enter the real shipping tariff, set your mobile number under
تنظیمات فروشگاه (so low-stock alerts reach you), and create your first coupon.

## 11. Going Live (deployment)

> The full walkthrough, in Persian, is in **[HOSTING-GUIDE.md](HOSTING-GUIDE.md)** (costs, server
> choice, step-by-step, post-launch checklist, troubleshooting).

A shop needs four things: a **server**, a **domain**, **HTTPS** and **provider credentials**.
The repository ships everything else:

```bash
# On a fresh Ubuntu 22.04/24.04 server, as root, with the project in place:
DOMAIN=your-domain.ir bash scripts/server-install.sh
```

That single idempotent command installs Docker, creates a service user, generates a strong
`JWT_SECRET`, enables persistence, builds and starts the shop, installs Nginx + a free HTTPS
certificate, schedules a nightly verified backup, and finishes by auditing the environment.

**Before making the shop public, run the readiness audit — it catches the mistakes that actually
destroy a launch:**

```bash
npm run preflight      # or: bash scripts/preflight.sh
```

It fails loudly when persistence is off, `JWT_SECRET` is weak, a live provider has no credentials,
the payment callback points at localhost, the data directory is unwritable, or no backup is scheduled
— each with its fix printed next to the problem.

| Artifact | What it gives you |
|---|---|
| `Dockerfile` / `docker-compose.yml` | Reproducible production runtime; data volume; restart-always; daily backup sidecar |
| `deploy/nginx.conf` | HTTPS, HTTP→HTTPS redirect, 6 MB upload ceiling, image caching |
| `deploy/mantomoda.service` | Plain Node + systemd alternative for VPS setups without Docker |
| `scripts/server-install.sh` | One-command install/update path |
| `scripts/preflight.sh` | Launch-readiness audit (also a CI job) |

**Note:** GitHub (or the zip) is a *backup of the code* — it does not put the shop online. Hosting is
what makes customers able to buy; see `HOSTING-GUIDE.md`.
