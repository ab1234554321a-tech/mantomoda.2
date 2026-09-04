# AGENTS.md — Global AI Engineering Guidelines

This document establishes the mandatory operational rules for **all AI Agents** (Claude Code, Codex, Arena AI, ChatGPT, etc.) working on the **Manto Moda** project.

---

## 1. The 14 Core Rules (قوانین ۱۴ گانه مشترک)

1. **Analyze First**: Analyze the repository, architecture, and current state before changing any code.
2. **Inspect Related Files**: Check all related components, routes, database models, and utilities before editing.
3. **Preserve Healthy Code**: Do not rewrite functioning code without strict justification and evidence.
4. **Maintain Existing Features**: Avoid breaking existing functionality (prevent regression).
5. **Respect Architecture**: Do not modify system architecture without prior impact analysis.
6. **Impact Analysis**: Evaluate dependencies and blast radius before large or risky modifications.
7. **Run Tests**: Execute tests (unit, integration, regression, type checks) to verify all changes.
8. **Inspect Real Errors**: Analyze real logs, stack traces, and evidence rather than guessing.
9. **Evidence > Assumption (Anti-Hallucination)**: Never claim tests passed or database changed without executing and verifying.
10. **Update Project State**: Update `PROJECT_STATE.md`, `project-state.json`, and `TASKS.md` after meaningful changes.
11. **Document Major Decisions**: Record architectural choices in `DECISIONS.md` and version changes in `CHANGELOG.md`.
12. **Ask Only for Business Decisions**: Prompt the user (Business Owner) only when human/business approval is genuinely required.
13. **Solve Technical Issues Autonomously**: Debug, diagnose root causes, and resolve technical problems autonomously.
14. **Keep State Recoverable**: Ensure the repository is the single source of truth so any subsequent agent can resume immediately.

---

## 2. Standard AI Session Workflow (چرخه کار هر نشست)

Every AI session MUST execute the following sequence:

```
1. Read AGENTS.md
2. Read AI-specific instructions (CLAUDE.md / CODEX.md)
3. Read PROJECT_STATE.md & project-state.json
4. Read TASKS.md
5. Read ARCHITECTURE.md & DECISIONS.md
6. Inspect Git status & recent commits (`git log -n 5`)
7. Inspect relevant code & tests
8. Run validation / health checks
9. Determine current state & pick next logical task
10. Formulate an implementation plan
11. Implement changes cleanly (Reuse > Duplicate)
12. Run tests & typecheck
13. Perform security & regression review
14. Update documentation & PROJECT_STATE
15. Commit with conventional commit messages
16. Proactively report results & next steps
```

---

## 3. Source of Truth Hierarchy (سلسله‌مراتب مرجعیت)

When conflicting information is detected, apply this precedence:

1. **Actual Working Code** (Highest priority)
2. **Database Schema & Live Infrastructure**
3. **Git History & Commit Logs**
4. **PROJECT_STATE.md / project-state.json**
5. **ARCHITECTURE.md & DECISIONS.md**
6. **TASKS.md**
7. **AI Conversation / Prompt Text** (Lowest priority)

*Note: If documentation conflicts with reality, update the documentation to reflect proven code reality.*

---

## 4. Git & Commit Conventions (استاندارد گیت و کامیت)

Use Conventional Commits:

| Prefix | Description | Example |
| :--- | :--- | :--- |
| `feat:` | New feature | `feat: add wholesale application review endpoint` |
| `fix:` | Bug fix | `fix: resolve wholesale price leakage in product API` |
| `refactor:`| Code restructuring without behavior change | `refactor: extract cart price validation logic` |
| `security:`| Security enhancement or vulnerability fix | `security: enforce backend role check for wholesale catalog` |
| `test:` | Adding or updating tests | `test: add unit tests for discount calculation` |
| `docs:` | Documentation & state updates | `docs: update PROJECT_STATE and TASKS for Phase 1` |
| `chore:` | Tooling, dependencies, config | `chore: configure vitest and typescript strict mode` |

**Forbidden Commit Messages**: `update`, `changes`, `fix`, `test`, `final`, `wip`, `new`.

---

## 5. Security & Secret Protection (اصول امنیت و محرمانگی)

- **UI Security ≠ Real Security**: UI hiding is cosmetic. All authorization and price rules MUST be strictly enforced on backend APIs.
- **Least Privilege**: Grant minimal necessary permissions to tools, agents, and users.
- **Zero Secrets in Git**: Never commit `.env`, private keys, passwords, API tokens, or credentials.
- **Input Validation & Sanitization**: Validate all inputs at API endpoints.

---

## 6. Definition of Done (تعریف کار پایان‌یافته)

A task is **DONE** only when:
- [x] Requirement understood and analyzed against existing code.
- [x] Implementation completed adhering to clean code standards.
- [x] Relevant tests passed (Unit/Integration/Security).
- [x] No regressions introduced to existing features.
- [x] Security and permission boundaries verified.
- [x] Documentation & Project State updated (`PROJECT_STATE.md`, `project-state.json`, `TASKS.md`).
- [x] Clear Git commit recorded with proper conventional message.
