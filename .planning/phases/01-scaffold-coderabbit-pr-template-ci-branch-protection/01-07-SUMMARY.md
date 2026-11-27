---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 07
subsystem: ci
tags: [github-actions, ci, branch-protection, gitleaks, docker, readme]
requires: [01-03, 01-04, 01-05, 01-06]
provides:
  - ci.yml with eight always-reporting jobs
  - evals-nightly.yml
  - README with branch protection settings
affects: [plan-08-pr-and-protection]
key-files:
  created:
    - .github/workflows/ci.yml
    - .github/workflows/evals-nightly.yml
    - README.md
  modified:
    - compose.yaml
decisions:
  - "Required checks are our CI job ids only (plus ci-success); Qodo Merge is never required"
  - "evals always runs and decides internally; no workflow-level paths filters"
  - "Image size limit 1450 MB (corrected on PR #2: CI measures the unpacked linux/amd64 image at 1317 MB, so the limit is that plus ~10%; the earlier 700 MB came from Docker Desktop's compressed 541 MB figure to 100 MB)"
requirements-completed: [CI-03, CI-05, CI-06, CI-07]
metrics:
  completed: 2026-11-27
  tasks: 3
---

# Phase 1 Plan 07: CI workflows, nightly evals and README Summary

ci.yml with eight always-reporting jobs (SHA-pinned actions, fork/bot-safe evals, double migrate/seed on Postgres 17, gitleaks full-history scan), a nightly evals workflow, and a README documenting the exact branch protection settings.

## Tasks and commits

| Task | Commit  | What                                                    |
| ---- | ------- | ------------------------------------------------------- |
| 1    | 1092caa | `.github/workflows/ci.yml` (plus compose.yaml prettier) |
| 2    | 9d5716f | `.github/workflows/evals-nightly.yml`                   |
| 3    | b0cdebe | `README.md`                                             |

## Pins

Actions (tags resolved via `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`; pnpm/action-setup was an annotated tag and was dereferenced to its commit):

| Action                      | Tag     | SHA                                      |
| --------------------------- | ------- | ---------------------------------------- |
| actions/checkout            | v7.0.1  | 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node          | v7.1.0  | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| pnpm/action-setup           | v6.1.1  | 73e46992e05b19abd31f2f3c20e0e7370d762115 |
| docker/setup-buildx-action  | v4.4.1  | f87e5991a6d7451dcb8d9637bfbc97413f497069 |
| docker/build-push-action    | v7.4.0  | c3c9e263c25d99ce0380d002d59b67737d91b0dc |

Images: `ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` (CLI uses `git` subcommand), `postgres:17.12-alpine` (same as compose), runner `ubuntu-24.04`, actionlint `rhysd/actionlint:1.7.12`.

## Verification evidence (local)

- actionlint 1.7.12 (docker): no findings for both workflows.
- No `pull_request_target`, no `paths:`, no `@vN` action refs; `secrets.` only in the evals run step.
- lint, format:check, typecheck, test:coverage (69.5% lines, no gate until Phase 2), scan:fixtures and `--self-test`, test:evals (no suites, exit 0): all pass.
- gitleaks v8.30.1 over 48 commits: no leaks.
- migration-check commands against a throwaway postgres:17.12-alpine: migrate x2, seed x2, integration tests, db:check, db:generate all passed; `git status --porcelain drizzle` empty (no drift).
- docker-build commands against the plan 04 image (`holiday-price-agent:local`, same build as the CI `ci` tag): `node -v` v22.23.5, `id -u` 10001, browser-smoke exit 0, size 541485672 bytes. The CI build itself (buildx and gha cache) is not reproduced locally; first real run is the plan 08 PR.

## Deviations from Plan

**1. [Rule 3 - Blocking] compose.yaml failed `format:check`**
- Found during: Task 1 local verification of the `lint` job.
- Issue: compose.yaml (plan 04) was not Prettier-formatted, so the `lint` job would fail.
- Fix: ran Prettier (quote style only, no behavior change). Committed with Task 1 (1092caa).

**2. Evals secret check moved into the run step**
- The "secret absent" skip is done inside the single `Run evals` step (shell test of the env var) so `secrets.` appears only in that one step, per the acceptance criterion. The nightly workflow checks the secret in an earlier step, as the plan specified.

**3. Evals relevance fallback**
- When no usable base SHA exists (new branch, force push), `relevant=true` so evals are not silently skipped. Not in the plan; conservative.

**4. README wording**
- Added the literal phrase "never required" alongside "never a required check" so the plan's automated grep passes.

## Notes

- `actionlint` was run through the pinned docker image, as allowed; nothing was installed globally.
- Not done here (plan 08): push, PR, applying branch protection, adding the `ANTHROPIC_API_KEY` Actions secret. Until the secret exists, evals and evals-nightly skip with a notice.
- No CodeRabbit references anywhere; the public repo means no GitHub Pro caveat.

## Known Stubs

None.

## Self-Check: PASSED

Files `.github/workflows/ci.yml`, `.github/workflows/evals-nightly.yml`, `README.md` exist; commits 1092caa, 9d5716f, b0cdebe exist on phase-1/scaffold.
