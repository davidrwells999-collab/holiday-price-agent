---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 05
subsystem: infra
tags: [qodo, renovate, pr-template, evals]
requires: [01-01]
provides:
  - PR template with Qodo Merge review section and fixtures-sanitised checkbox
  - Grouped weekly Renovate config with held-back majors
  - evals/ skeleton and THRESHOLDS single source of truth
  - Contract test over .pr_agent.toml, renovate.json and the PR template
key-files:
  created:
    - .github/pull_request_template.md
    - renovate.json
    - evals/thresholds.ts
    - evals/README.md
    - evals/fixtures/README.md
    - evals/suites/.gitkeep
    - evals/scenarios/.gitkeep
    - src/repo-config.test.ts
requirements-completed: [CI-01, CI-02, CI-06]
completed: 2026-11-27
---

# Phase 1 Plan 05: PR Template, Renovate and Evals Skeleton Summary

PR template, grouped Renovate config and evals skeleton committed, with a contract test guarding them and the read-only `.pr_agent.toml`.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Verify .pr_agent.toml (CI-01), PR template (CI-02) | 55e13fb |
| 2 | renovate.json, evals skeleton, contract test | c4d4f69 |

## CI-01 verification

- `.pr_agent.toml` exists on the base (`origin/main` at 2ccb220) and the worktree base; `[github_app] pr_commands` includes `/agentic_describe` and `/agentic_review`, plus `handle_push_trigger = true` and `push_commands = ["/agentic_review"]`.
- `[review_agent]` guidelines cover src/sellers, src/pricing, src/agent, evals/ and PostHog (asserted by the contract test).
- `git diff origin/main -- .pr_agent.toml` is empty (file untouched). `.coderabbit.yaml` does not exist.
- No gaps found, so no follow-up `chore/qodo-config` PR is needed.

## Deviations from Plan

- **Plan text conflict (CodeRabbit):** the Task 1 automated verify line greps for `## CodeRabbit CLI review`, which contradicts the owner decision and the acceptance criteria (no CodeRabbit mention). I followed the owner decision and the acceptance criteria; the template has no CodeRabbit section.
- **Renovate validator not run:** it was not run (no global install); the contract test covers the config structure instead.
- **Playwright rule:** the plan's `description` field is placed inside a packageRule alongside `addLabels: ["playwright"]`.
- Worktree base was corrected with `git reset --hard cd33b09` per the startup check (the branch started from an older commit).

## Verification

`pnpm test` (12 tests pass), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all exit 0.

## Known Stubs

None.

## Self-Check: PASSED
