## Summary

Phase 1 of the Holiday Price Agent. It adds a skeleton you can run, with CI checks, plus the data-model decisions that are expensive to change later. Nothing scrapes yet: sellers, pricing logic, PostHog and OTel arrive in Phases 2–3.

Requirements: FND-01 to FND-06, CI-01 (`.pr_agent.toml`, merged separately in #1 and checked on `main`), CI-02, CI-03, CI-05, CI-06, CI-07 and CI-08. The CI-04 coverage gate on `src/pricing` comes in Phase 2.

| Plan | What it adds |
|---|---|
| 01-01 | Exact-pinned dependencies (owner-approved), pnpm 10.34.9 via `packageManager`, Node 22. ESLint flat config with a **`src/pricing` purity rule** (no IO imports), Prettier, TS 6.0, Vitest projects `unit`/`integration`/`evals`, and the `SELLER_IDS` contract |
| 01-02 | Env validation with zod plus `.env.example` (no values are echoed in errors). Telemetry facade limited to an 8-event allow-list (no-op when PostHog is unset). No-op tracing with span-attribute allow-lists. Seller enablement: config decides, and a flag can override it |
| 01-03 | Drizzle schema with 12 tables: **integer pence**, local wall-clock times plus airport, `price_basis`, natural-key unique indexes, `run`/`seller_run`, and **append-only `price_observation`** (trigger). Generated SQL migrations only, never push. Migrator behind an advisory lock. Seed inserts only what's missing (the Rixos Radamis search) |
| 01-04 | pino logger that redacts secrets, `boot()`/`main.ts` with graceful shutdown, and a Chromium smoke test (`data:` URL only). Multi-stage image (Node 22, **non-root uid 10001**). Compose: db healthcheck, then one-shot `migrate`, then app |
| 01-05 | PR template, grouped Renovate config, evals skeleton plus `thresholds.ts`, and a repo-config contract test |
| 01-06 | Fixture sanitiser, a personal-data and secret scan with `--self-test` and masked output, and `.gitleaks.toml` |
| 01-07 | `ci.yml` (SHA-pinned actions, always-reporting jobs, `ci-success` aggregator), `evals-nightly.yml`, and a README with CI overview and branch-protection steps |

## Test evidence

Commands were run locally on this branch (macOS, Docker 29). This PR is the first CI run.

- `pnpm install --frozen-lockfile && pnpm lint && pnpm format:check && pnpm typecheck`: all exit 0.
- `pnpm test`: **122 passed** across 10 files.
- Purity rule: a probe `src/pricing/__lint_probe.ts` importing `pg` failed lint with "src/pricing must stay pure: no IO imports". The probe was deleted.
- **Postgres 17 check** (plan 03, throwaway `postgres:17-alpine`):
  - `db:migrate` ran twice, exiting 0 both times.
  - `db:seed` ran twice. The first run inserted search 1, parties 2, airports 2, room setups 3, airport costs 2 and sellers 4. The second inserted 0 in every table.
  - The integration tests passed 4/4: an owner edit survives a re-seed, the seller flag flips, and UPDATE/DELETE on `price_observation` is rejected.
  - The database has 12 public tables. `db:check` is clean, and `db:generate` shows no drift.
- **Compose check** (plan 04):
  - db healthy, migrate exits 0, app ready (`posthog: disabled`, `tracing: false`).
  - Seed run twice is idempotent.
  - Setting `enabled=false` for tui, then restarting, shows tui disabled.
  - `NTFY_TOPIC=` blank exits 1 with an error naming the variable.
  - `stop` logs `shutdown_requested` and exits 0.
- **Image:** Node v22.23.5, uid 10001, Chromium 159 smoke test returns `title:"smoke"`, 1317 MB unpacked on linux/amd64 in CI (the 541 MB local figure was Docker Desktop's compressed size). The CI cap is 1450 MB, baseline +10%, re-measured whenever the base image or Chromium changes.
- **Fixture scan:** `pnpm scan:fixtures` is clean and `--self-test` passes. A planted runtime email in a probe fixture failed the scan with only a masked value printed. The probe was deleted.
- **Workflows:** actionlint 1.7.12 is clean on both. gitleaks v8.30.1 found nothing across the history.

## Qodo Merge review

Pending. Qodo is the only reviewer (no CodeRabbit) and isn't a required check. Every comment will be fixed or replied to before merge.

## Risks and dependencies

- **Branch protection is not applied yet.** The README gives the exact settings: required checks `lint`, `typecheck`, `unit-tests`, `evals`, `docker-build`, `migration-check`, `secret-scan` and `ci-success`; 0 approvals; conversation resolution. I'll apply them with `gh api` only after the owner confirms. `secret-scan` is required in addition to the original list, so a PR that leaks a secret is blocked.
- **The `ANTHROPIC_API_KEY` Actions secret is not set.** `evals` and `evals-nightly` skip with a notice until it is. Phase 1 has no model-backed suites.
- **Deviations from STACK.md:**
  - `eslint-config-prettier` is held at 10.1.8, because 10.1.9 was published 2026-11-27 after 16 months with no release, and this package was compromised in July 2025.
  - The Dockerfile uses BuildKit cache mounts for apt lists instead of `rm -rf /var/lib/apt/lists/*`. The effect is the same.
- **The CI buildx/GHA cache path** couldn't be reproduced locally, so this PR is its first real run.
- **Proposal, not added:** `anthropics/claude-code-action` as an extra automated reviewer. It needs the owner's go-ahead and the API key secret.

### User Stories & Acceptance Criteria
- As the owner, I can `docker compose up` and get a migrated, seeded database and a running app (FND-01, FND-04).
- As the owner, I can switch a seller on or off without a code change (FND-05).
- As the owner, every PR is automatically checked by our CI jobs and reviewed by Qodo (CI-01, CI-03, CI-08).

### Success Metrics & Release Criteria
- Release when all required CI checks are green, every Qodo comment is addressed, and the owner gives the go-ahead.

### Stakeholder Review & Approval
- Product owner approval pending for Phase 1.

## Checklist
- [x] Fixtures sanitised (no fixtures added; `pnpm scan:fixtures` passes)
- [x] No secrets, tokens or personal data in code, logs, fixtures or PostHog events
- [x] Prompts or tool definitions changed, so evals updated: not applicable (no prompts yet)
- [x] Schema changes have a generated migration (`pnpm db:generate`; never `drizzle-kit push`)
- [ ] Every Qodo Merge comment fixed or replied to
- [ ] Owner go-ahead received before merge (Claude never merges)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
