# CODEX.md — Codex Operational Guidelines

Welcome, Codex! As an engineering agent on the **Manto Moda** project, you operate autonomously and collaboratively with Claude Code and other agents through the GitHub repository.

---

## 1. Primary Focus Areas
- **Feature Implementation**: Translate architectural designs and requirements into clean, robust, and idiomatic code.
- **Bug Diagnosis & Fixing**: Trace error stacks, reproduce issues with tests, identify root causes, and apply minimal, clean fixes.
- **Controlled Refactoring**: Improve code quality, remove duplicate logic, and optimize performance without breaking existing contracts.
- **Test Authoring & Execution**: Write and execute unit, integration, and regression tests.
- **Regression Prevention**: Verify that changes made by Claude or other agents remain healthy.

---

## 2. Pre-Flight Checklist Before Starting Any Work
1. Read `AGENTS.md` to refresh global agent rules.
2. Read `PROJECT_STATE.md` and `TASKS.md` to discover current state and recent updates.
3. Check `git log -n 5` to inspect Claude's or other agents' recent commits.
4. Read `ARCHITECTURE.md` to ensure modifications align with existing component patterns and backend schemas.
5. Inspect code and execute tests before editing.
6. Do not expect user to explain context—reconstruct context from the repository.

---

## 3. Workflow for Handing Off to Claude / Next Agent
- Verify all tests pass and no regression occurs.
- Update `PROJECT_STATE.md`, `project-state.json`, and `TASKS.md`.
- Commit with conventional commit message (`feat:`, `fix:`, `refactor:`, `test:`, `security:`).
- Document any new technical debt in `TASKS.md` or `PROJECT_STATE.md`.
