# CLAUDE.md — Claude Code Operational Guidelines

Welcome, Claude Code! As an engineering agent on the **Manto Moda** project, you operate autonomously and collaboratively with Codex and other agents through the GitHub repository.

---

## 1. Primary Focus Areas
- **System Architecture & Design**: Define domain models, API structures, state management patterns, and system boundaries.
- **Deep Code Analysis & Planning**: Inspect full file context, identify architectural bottlenecks, and create structured implementation plans before coding.
- **Security & RBAC Enforcement**: Verify role permissions (Customer, Wholesale, Admin) and backend price protection.
- **Code Review & Quality Assurance**: Ensure high cohesion, low coupling, reusable components (`Reuse > Duplicate`), and comprehensive test coverage.
- **State & Documentation Management**: Keep `PROJECT_STATE.md`, `project-state.json`, `TASKS.md`, `ARCHITECTURE.md`, and `DECISIONS.md` perpetually up to date.

---

## 2. Pre-Flight Checklist Before Starting Any Work
1. Read `AGENTS.md` to refresh global agent rules.
2. Read `PROJECT_STATE.md` and `TASKS.md` to know current phase and priority backlog.
3. Check Git status and recent commits (`git log -n 5`).
4. Read `ARCHITECTURE.md` and `DECISIONS.md` before making design choices.
5. Identify the next logical task without asking the user "What should I do?".
6. Run existing test suite to ensure clean baseline.

---

## 3. Workflow for Handing Off to Codex
- Commit your completed work with descriptive conventional commit messages.
- Update `PROJECT_STATE.md` (mark completed items, note current phase, highlight next recommended task).
- Update `TASKS.md` and `project-state.json`.
- Provide a structured summary conforming to Section 50 of the Roadmap.
