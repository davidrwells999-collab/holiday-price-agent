---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
verified: 2026-11-27T11:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 1: Scaffold, review config, PR template, CI, branch protection - Verification Report

**Phase Goal:** The owner has a runnable, CI-guarded repo skeleton where every later PR is automatically checked and reviewed, and the data model decisions that are costly to change later are locked in.
**Verified:** 2026-11-27
**Status:** passed
**Re-verification:** No, initial verification

Owner decisions applied over plan text: no CodeRabbit (Qodo Merge only, not required), repo public, image cap 1450 MB, CI-04 belongs to Phase 2.

## Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---|---|---|
| 1 | `docker compose up` runs Postgres 17, one-shot migrate, then app; missing required env fails with a zod error; PostHog unset still runs | VERIFIED | Ran `docker compose -p hpa-verify up -d --build` with `.env` copied from `.env.example`: db healthy (PostgreSQL 17.12), migrate Exited (0) `migrations_applied`, seed Exited (0), app Up with `posthog: disabled`, `app_ready`. With `ANTHROPIC_API_KEY` removed, the container printed "Invalid environment configuration: - ANTHROPIC_API_KEY: Required". Torn down with `down -v`; temp `.env` removed. |
| 2 | Seed is idempotent and the DB holds the Rixos Radamis search with party, dates, airports, room setups, airport costs as rows; sellers toggle by config | VERIFIED | First seed inserted search 1, party 2, airports 2, room setups 3, airport costs 2, sellers 4. Second seed run inserted 0 of everything. psql confirmed 1 search, 3 room_setup, 4 seller rows. Boot log shows per-seller `enabled` with `source: config`. Schema (`src/db/schema.ts`) defines search, search_party, search_airport, airport_cost, room_setup, seller, run, seller_run, quote, price_observation, deal, alert; migrations 0001/0002 make price_observation append-only (UPDATE/DELETE/TRUNCATE blocked). |
| 3 | PR CI runs lint, Prettier, tsc, unit tests, Docker build, migration check twice on throwaway Postgres; our jobs are the only required checks; fixture with token/PII fails scan | VERIFIED | `ci.yml` has lint (+ `format:check`), typecheck, unit-tests (coverage), evals (always reports), docker-build (Node 22, uid 10001, browser smoke, size gate 1450 MB), migration-check (Postgres 17.12 service, migrate x2, seed x2, integration, db:check, drift check), secret-scan (fixture scan, `--self-test`, gitleaks full history), ci-success aggregator. `gh pr checks 2`: all 8 pass. Branch protection contexts are exactly those 8; no Qodo/CodeRabbit context. Scan self-test is a CI step, which proves detection; no live failing PR was opened (acceptable). |
| 4 | `.pr_agent.toml`, PR template with "fixtures sanitised" checkbox, Renovate config in repo; Renovate/fork PRs skip secret jobs cleanly; README lists protection with Qodo not required | VERIFIED | `.pr_agent.toml` on main with `/agentic_describe` and `/agentic_review` and project guidelines. `.github/pull_request_template.md` has Summary, Test evidence, Qodo section and the fixtures-sanitised checkbox. `renovate.json` has grouped rules, 3-day release age. The evals job's `trusted` step skips secrets for forks and renovate/dependabot and still reports success. README "Branch protection" lists the settings and says Qodo is never required. No `.coderabbit.yaml` (asserted by `src/repo-config.test.ts`). |
| 5 | PR opened, CI green, Qodo review addressed, STOP for owner go-ahead | VERIFIED | PR #2 state MERGED (2026-11-27T10:48:17Z); 8/8 checks green; 13/13 review threads resolved via GraphQL; commits show Qodo fixes (TRUNCATE trigger, fixture scan, Renovate delay). `01-PR-BODY.md` exists. Branch protection live: strict, linear history off, enforce_admins true, conversation resolution true, force push and deletion blocked, 0 required approvals. |

**Score:** 5/5

## Local Checks

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | OK, lockfile up to date |
| `pnpm lint` | clean |
| `pnpm format:check` | clean |
| `pnpm typecheck` | clean |
| `pnpm test` (unit) | 13 files, 145 tests passed |
| Compose proof (`hpa-verify`) | PASS, see truth 1 and 2 |

## Requirements Coverage

| Req | Status | Evidence |
|---|---|---|
| FND-01 | SATISFIED | compose proof; Node 22.23.5, TZ=Europe/London, Chromium smoke in CI |
| FND-02 | SATISFIED | zod env error observed; `.env.example` committed |
| FND-03 | SATISFIED | schema tables above, append-only observations |
| FND-04 | SATISFIED | idempotent seed observed (2nd run inserts 0) |
| FND-05 | SATISFIED | seller enablement from config logged at boot (`src/sellers/enablement.ts`); flag override is part of the enablement module, tested in unit tests |
| FND-06 | SATISFIED | telemetry facade and typed allow-list (`src/telemetry/events.ts`); app runs with PostHog disabled |
| CI-01 | SATISFIED | `.pr_agent.toml` present, no `.coderabbit.yaml` |
| CI-02 | SATISFIED | PR template |
| CI-03 | SATISFIED | ci.yml and green PR checks |
| CI-05 | SATISFIED | sanitiser, scanner, self-test, gitleaks config |
| CI-06 | SATISFIED | renovate.json; secret-needing job skips for bot/fork PRs |
| CI-07 | SATISFIED | README section; live protection matches it |
| CI-08 | SATISFIED for PR #2 | all Qodo threads resolved. It is a standing process rule for later PRs, so REQUIREMENTS.md still showing Pending is a bookkeeping item (see below) |
| CI-04 | Out of scope (Phase 2) | not counted |

No orphaned requirements.

## Anti-Patterns

No TBD/FIXME/XXX debt markers were a concern in the checked files; lint is clean. No stubs found in the Phase 1 surface (`src/pricing/types.ts` is intentionally types-only, populated in Phase 2).

## Non-blocking Observations (warnings, no gap)

1. **CodeRabbit GitHub app is still attached to the repo.** `gh pr checks 2` lists a `CodeRabbit` check with status "skipping". It is not required and does nothing, but the owner said no CodeRabbit at all. Suggest uninstalling the app from the repo's settings.
2. **Bookkeeping:** CI-08 is still unchecked/Pending in `REQUIREMENTS.md`, and ROADMAP plan 01-08 is unchecked; there is no `01-08-SUMMARY.md`. These should be updated in the orchestrator's docs PR. REQUIREMENTS.md CI-03 text and ROADMAP SC 3/4 still mention CodeRabbit-era wording in places; the plan directory name also says "coderabbit". Cosmetic.
3. **Image size gate** is CI-measured only (local Docker Desktop reports compressed size); documented in ci.yml.
4. **Branch protection is strict** (up-to-date branch required), so each PR must rebase on main before merge; this matches the README.

## Human Verification Required

None. Everything required for Phase 1 was verified programmatically or from GitHub API state.

## Gaps Summary

No gaps. The phase goal is achieved: the repo runs under compose, CI and branch protection are live and enforcing, Qodo is configured and its threads were resolved, and the costly-to-change data model decisions (pence, natural keys, append-only observations, run/seller_run) are in migrations on main.

---

_Verified: 2026-11-27_
_Verifier: Claude (gsd-verifier)_
