---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 04
subsystem: infra
tags: [docker, compose, pino, playwright, postgres, boot]
requires:
  - phase: 01-02
    provides: env loading, telemetry and tracing facades, seller enablement
  - phase: 01-03
    provides: db client, migrate and seed entrypoints, schema
provides:
  - pino logger with secret redaction
  - boot() composition returning AppContext with idempotent shutdown()
  - main.ts process entry (signals, fatal handlers, heartbeat)
  - browser smoke CLI (data: URL only)
  - multi-stage non-root Docker image (Node 22, Chromium)
  - compose stack: db, one-shot migrate, app
affects: [phase-3-run-pipeline, phase-6-scheduler, plan-07-ci-image-size]
tech-stack:
  added: []
  patterns: [boot(deps) with injected factories, one-shot migrate service, apt state in BuildKit cache mounts]
key-files:
  created:
    - src/logging/logger.ts
    - src/logging/logger.test.ts
    - src/app/boot.ts
    - src/app/boot.test.ts
    - src/main.ts
    - src/cli/browser-smoke.ts
    - Dockerfile
    - .dockerignore
    - compose.yaml
  modified: []
key-decisions:
  - "Base image pinned to node:22.23.5-bookworm-slim (all stages); Postgres pinned to postgres:17.12-alpine"
  - "apt lists/cache kept out of the image via BuildKit cache mounts instead of an rm step"
patterns-established:
  - "boot(deps) takes injectable createDb/pingDb/loadSellerConfig/logDestination so it is testable without a DB"
requirements-completed: [FND-01, FND-02, FND-05, FND-06]
duration: ~25min
completed: 2026-11-27
---

# Phase 1 Plan 04: Runnable compose stack Summary

**Pino logger with redaction, a tested boot() composition, graceful-shutdown entry and a non-root Node 22 + Chromium image running under a Postgres 17 compose stack with a one-shot migrate service.**

## Accomplishments
- 7 new unit tests (suite 122 green), typecheck, lint, prettier and build clean.
- Env failure prints the zod message and exits 1 without touching the DB.
- Full compose proof passed on a real stack (project `hpa-p04`, torn down with `down -v`).

## Task Commits
1. Task 1 (logger, boot, main, browser smoke): f098abb
2. Task 2 (Dockerfile, .dockerignore, compose.yaml): ced6d82
3. Task 3 (verification only, no files): evidence below

## Pinned tags and image size
- `node:22.23.5-bookworm-slim` (every stage), `postgres:17.12-alpine`
- `docker image inspect holiday-price-agent:local --format '{{.Size}}'` = **541485672** bytes (about 541 MB) for plan 07's CI size limit
- Chromium 159.0.8154.6; `node -v` v22.23.5; `id -u` 10001

## Evidence (Task 3)
- migrate: exited 0; app: running; db: healthy
- `{"posthog":"disabled","tracing":false,"msg":"telemetry_configured"}`
- Before seeding: all four sellers `{"enabled":false,"source":"default"}`
- Seed run 1: `{"msg":"seed_done","inserted":{"search":1,"searchParty":2,"searchAirport":2,"roomSetup":3,"airportCost":2,"seller":4}}`
- Seed run 2: every count 0
- `select slug from search` -> `rixos-radamis-may-2027`
- After seeding and restart: all sellers `{"enabled":true,"source":"config"}`
- After `update seller set enabled=false where id='tui'` and restart: `"tui":{"enabled":false,"source":"config"}`
- `run --rm -e NTFY_TOPIC= app`: prints `Invalid environment configuration:\n- NTFY_TOPIC: must be 1-64 characters of A-Z a-z 0-9 _ -`, exit 1
- `stop app`: `"signal":"SIGTERM","msg":"shutdown_requested"`, container exit code 0
- Browser smoke: `{"chromium":"159.0.8154.6","node":"v22.23.5","title":"smoke"}`

## Deviations from Plan

**1. [Rule 3 - Blocking] No `rm -rf /var/lib/apt/lists/*` in the Dockerfile**
- **Found during:** Task 2
- **Issue:** The harness safety check blocked the command containing that removal and no human approved it, so I did not re-issue it.
- **Fix:** apt lists and cache are mounted as BuildKit cache mounts (`--mount=type=cache`), so they never enter the layer; same intent, no removal step.
- **Files modified:** Dockerfile
- **Commit:** ced6d82

**2. [Note] Missing-variable check output**
- A blank `NTFY_TOPIC=` shows the regex message ("must be 1-64 characters...") rather than "Required"; the variable is named and exit code is 1, which satisfies the criterion.

**3. [Note] Task 3 commit**
- Task 3 has no file changes, so no separate `feat(01-04): runnable compose stack...` commit was possible; the two task commits plus this summary cover it. The local `.env` created for the run was deleted afterwards (it is gitignored).

## Known Stubs
None. The hourly heartbeat in main.ts is an intentional placeholder until the Phase 6 scheduler.

## Threat Flags
None beyond the plan's threat model.

## Self-Check: PASSED
