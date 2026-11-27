# Holiday Price Agent

A personal, self-hosted agent that watches package-holiday prices across UK tour operators (Jet2holidays, TUI, On the Beach, easyJet holidays), works out the true cost of each option, keeps price history, and pushes an alert to your phone through ntfy when something is worth booking. It is strictly read-only: it never books, signs in, enters personal or payment details, or attempts CAPTCHAs.

## Requirements

- Node 22.13 or newer (see `.nvmrc`)
- pnpm, via `corepack enable` (the version is pinned in `package.json`)
- Docker with Compose v2

## Quick start

```sh
cp .env.example .env        # then fill in real values
docker compose up -d
docker compose logs app     # look for app_ready
```

Compose runs `migrate` then `seed` as one-shot services before `app` starts, so no manual seed step is needed. The seed only inserts missing rows, so any edits you make to seeded rows are kept.

## Local development

| Script                  | What it does                                                |
| ----------------------- | ----------------------------------------------------------- |
| `pnpm lint`             | ESLint                                                      |
| `pnpm format`           | Prettier, write                                             |
| `pnpm format:check`     | Prettier, check only                                        |
| `pnpm typecheck`        | `tsc --noEmit`                                              |
| `pnpm test`             | Unit tests                                                  |
| `pnpm test:coverage`    | Unit tests with coverage                                    |
| `pnpm test:integration` | DB integration tests (needs `TEST_DATABASE_URL`, see below) |
| `pnpm test:evals`       | Eval suites (model-backed suites need `ANTHROPIC_API_KEY`)  |
| `pnpm db:generate`      | Generate a migration from `src/db/schema.ts`                |
| `pnpm db:check`         | Check migration consistency                                 |
| `pnpm db:migrate`       | Apply migrations                                            |
| `pnpm db:seed`          | Seed reference data (idempotent)                            |
| `pnpm scan:fixtures`    | Scan eval fixtures for tokens and personal data             |
| `pnpm sanitise:fixture` | Sanitise a saved page before committing it as a fixture     |

Integration tests read `TEST_DATABASE_URL` only, never `DATABASE_URL`. They create a uniquely named throwaway database (`hpa_test_<random>`) on that server, migrate it, and drop it afterwards, so re-runs pass and your real data is untouched. The role needs `CREATEDB`. Without the variable they skip with a message (`REQUIRE_DB_TESTS=1` makes that a failure):

```sh
docker run -d --name hpa-test-pg -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17.12-alpine
TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/postgres pnpm test:integration
```

Migrations: change `src/db/schema.ts`, run `pnpm db:generate`, and commit the generated SQL. Never use `drizzle-kit push`, and never edit a migration that has been merged.

## Configuration

| Variable                                            | Required | Purpose                                   |
| --------------------------------------------------- | -------- | ----------------------------------------- |
| `ANTHROPIC_API_KEY`                                 | yes      | Claude API key                            |
| `DATABASE_URL`                                      | yes      | Postgres connection string                |
| `NTFY_TOPIC`                                        | yes      | ntfy topic (treat as a secret)            |
| `NTFY_SERVER`                                       | no       | Self-hosted ntfy server (default ntfy.sh) |
| `NTFY_TOKEN`                                        | no       | ntfy access token                         |
| `POSTHOG_API_KEY`                                   | no       | PostHog analytics and flags               |
| `POSTHOG_HOST`                                      | no       | PostHog host                              |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                       | no       | OTLP trace endpoint                       |
| `LOG_LEVEL`                                         | no       | `fatal` to `trace`, default `info`        |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | compose  | Database container credentials            |

With PostHog and OTel variables unset, telemetry and tracing are no-ops.

Sellers (`jet2`, `tui`, `on_the_beach`, `easyjet_holidays`) are enabled or disabled in the database:

```sql
update seller set enabled = false where id = 'tui';
```

A PostHog flag named `seller_<id>_enabled` overrides this once PostHog is wired up (Phase 3).

## CI

Every PR and every push to `main` runs `.github/workflows/ci.yml`. Job ids are the check names.

| Job               | What it checks                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `lint`            | ESLint and Prettier                                                                                      |
| `typecheck`       | `tsc --noEmit`                                                                                           |
| `unit-tests`      | Unit tests with coverage summary                                                                         |
| `evals`           | Eval suites, only when `src/agent`, `src/sellers`, `src/deals`, `evals` or `prompts` change              |
| `docker-build`    | Builds the runtime image; checks Node 22, non-root uid 10001, browser smoke test and an image size limit |
| `migration-check` | Migrates and seeds twice on a throwaway Postgres 17, runs DB integration tests, fails on schema drift    |
| `secret-scan`     | Fixture scan (with self-test) and gitleaks over the full history                                         |
| `ci-success`      | Aggregator: fails if any of the above failed or was cancelled                                            |

`evals` always runs and reports a status. When no eval-relevant path changed it reports success without running, and on fork, Renovate and Dependabot PRs (which get no secrets) it also reports success with a job summary note. Those suites run nightly on `main` instead: `evals-nightly` runs at 02:30 UTC and can be started by hand. Without the `ANTHROPIC_API_KEY` secret, the evals step skips with a notice rather than failing.

### Fixtures and the CI scan

`pnpm scan:fixtures` scans every file under `evals/fixtures` (a missing root fails the run). What it can and cannot verify:

- **Can, on PRs:** email addresses, UK phone numbers and postcodes, JWTs, API keys, opaque tokens, cookie headers, `<script>` in HTML, and the shape of an ntfy topic: any `ntfy.sh/<topic>` or `https://<host containing ntfy>/<topic>` URL, and any `NTFY_TOPIC=<value>` assignment. These checks do not depend on the environment.
- **Cannot, on PRs:** match your actual topic by value. PR CI never receives the `NTFY_TOPIC` secret, because untrusted PR code could print it. A bare topic name that appears outside an ntfy URL or assignment is not caught in CI.
- **Locally:** if `NTFY_TOPIC` is set in your shell (8+ characters), the scan also flags any occurrence of the exact value. Run `pnpm scan:fixtures` locally before committing new fixtures.

## Code review workflow

Qodo Merge is the only reviewer. Its free app (about 30 reviews a month) runs `/agentic_describe` and `/agentic_review` automatically when a PR opens, driven by `.pr_agent.toml` on `main`. Every Qodo comment is fixed or replied to before the owner is asked to merge. Keep PRs small to fit the quota.

Proposed, not enabled: `anthropics/claude-code-action` as an extra automated reviewer. It needs the owner's go-ahead and an `ANTHROPIC_API_KEY` Actions secret.

## Branch protection

Settings for `main`:

- Require a pull request before merging, with 0 required approvals (solo repository).
- Require these status checks, by exact name: `lint`, `typecheck`, `unit-tests`, `evals`, `docker-build`, `migration-check`, `secret-scan` and the `ci-success` aggregator. (`secret-scan` is included so a leaky PR cannot merge.)
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Block force pushes and deletions.
- Include administrators, so there are no direct pushes to `main`, even by the owner.

Qodo Merge is never required, and never a required check, so an outage or a used-up quota cannot block a merge. `evals` always reports a status, so PRs that do not touch eval-relevant paths never wait on it.

The repository is public, so branch protection is available on the free plan.

### Apply through the GitHub UI

Settings, Branches, Add rule for `main`, then tick the options above and add each check name.

### Apply with the GitHub CLI

Run this only after the owner confirms:

```sh
gh api -X PUT repos/davidrwells999-collab/holiday-price-agent/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "unit-tests", "evals", "docker-build", "migration-check", "secret-scan", "ci-success"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "restrictions": null
}
JSON
```

## Dependency updates

Renovate (the owner installs the free Renovate GitHub app) opens grouped PRs weekly. Renovate PRs run the full CI with no secrets.

## Responsible use

This is for personal, low-volume, read-only use: one request every 5 to 10 seconds per site with jitter. It stops on a CAPTCHA and does not try to evade bot checks. No live seller sites are contacted in PR CI.
