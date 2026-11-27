---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 01
subsystem: infra
tags: [pnpm, typescript, eslint, prettier, vitest, toolchain]
requires: []
provides:
  - Pinned dependency set and every package.json script later plans call
  - ESLint, Prettier, tsc and Vitest (unit, integration, evals projects) configs
  - SELLER_IDS contract (src/sellers/ids.ts)
  - ESLint purity rule for src/pricing
affects: [01-02, 01-03, 01-05, 01-06]
tech-stack:
  added: [typescript 6.0.3, vitest 5.1.2, eslint 10.15.0, typescript-eslint 8.74.0, prettier 3.10.1, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, zod 4.6.7, playwright 1.65.1, pino 10.4.0]
  patterns: [exact version pins with save-exact, pnpm via packageManager and corepack, vitest inline projects, no-restricted-imports purity boundary]
key-files:
  created: [package.json, pnpm-lock.yaml, .npmrc, .nvmrc, .gitignore, .editorconfig, .prettierrc.json, .prettierignore, eslint.config.js, tsconfig.json, tsconfig.build.json, vitest.config.ts, src/sellers/ids.ts, src/sellers/ids.test.ts]
  modified: []
key-decisions:
  - "eslint-config-prettier pinned to 10.1.8, not latest 10.1.9"
  - "CLAUDE.md added to .prettierignore because GSD regenerates it"
requirements-completed: [FND-01, CI-03]
duration: 20min
completed: 2026-11-27
---

# Phase 1 Plan 01: Toolchain and Seller ID Contract Summary

Pinned, owner-approved TypeScript 6 / pnpm 10 / Vitest 5 toolchain with a green lint, format, typecheck and test run, a proven `src/pricing` purity lint rule, and the `SELLER_IDS` contract.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Branch check, package.json with pinned versions | chore(01-01): pin dependencies |
| 2 | Owner package-legitimacy checkpoint | approved by owner (no commit) |
| 3 | Install, configs, SELLER_IDS (TDD) | chore(01-01): toolchain, configs and seller id contract |

TDD: RED run showed the suite failing (no `ids.ts`), then GREEN with 3 passing tests. Both landed in one commit as the plan specifies, so there is no separate `test(...)` commit.

## Version table (planned to resolved)

All versions match STACK.md and the plan. Resolved values for the open ones:

| Package | Planned | Resolved | Peer / engine check |
| ------- | ------- | -------- | ------------------- |
| typescript | ~6.0.3 | 6.0.3 | typescript-eslint peer `>=4.8.4 <6.1.0` OK |
| @eslint/js | match eslint 10 | 10.0.1 | OK |
| globals | latest | 17.14.0 | n/a |
| tsx | 4.23.x | 4.23.15 | n/a |
| @types/node | 22.x | 22.20.7 | n/a |
| @types/pg | 8.23.x | 8.23.1 | n/a |
| smol-toml | latest 1.x | 1.9.1 | n/a |
| @vitest/coverage-v8 | = vitest | 5.1.2 | peer vitest 5.1.2 OK |
| vitest | 5.1.2 | 5.1.2 | engines `^22.12 \|\| ^24 \|\| >=26` OK |
| eslint-config-prettier | latest | **10.1.8** (deviation) | n/a |
| pnpm | 10.x latest | 10.34.9 | via corepack |

## Deviations from Plan

**1. [Owner decision] eslint-config-prettier pinned to 10.1.8 instead of latest 10.1.9**
- 10.1.9 was published 2026-11-27 after 16 months without a release, and the package had a real supply-chain compromise in July 2025. Pinned to the prior release; approved by owner at the Task 2 checkpoint.

**2. [Rule 3 - Blocking] CLAUDE.md added to .prettierignore**
- Found during Task 3: `pnpm format` rewrote the GSD-managed CLAUDE.md, and `format:check` would fail on it otherwise. Reverted the rewrite with `git checkout -- CLAUDE.md` and ignored the file in `.prettierignore`.

**3. [Note] tsconfig `include` lists files not yet present (scripts/, evals/, drizzle.config.ts)**
- Harmless; tsc passes. Later plans create them.

## Verification

- `pnpm install --frozen-lockfile && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` exits 0; 3 tests pass in `src/sellers/ids.test.ts`.
- Purity probe: a temporary `src/pricing/__lint_probe.ts` importing `pg` made `pnpm lint` fail with "src/pricing must stay pure: no IO imports". The probe was deleted and not committed.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

All created files exist and lint/format/typecheck/test were green before commit.
