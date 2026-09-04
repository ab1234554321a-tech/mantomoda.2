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

- **Frontend**: React 18, TypeScript, TailwindCSS, Lucide Icons, Vite
- **Backend**: Node.js, Express, TypeScript, Zod, JWT, bcrypt
- **Testing**: Vitest, Supertest
- **State Management**: React Context / Hooks
- **Architecture**: Modular Controller-Service-Repository Pattern with RBAC Guards
