---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 03
subsystem: database
tags: [drizzle, postgres, migrations, seed, zod]
requires: [01-01]
provides:
  - Drizzle schema (12 tables) with natural keys, integer pence, local flight times, price_basis
  - Committed migrations 0000 (generated) and 0001 (append-only price_observation trigger)
  - Runtime migrator under pg_advisory_lock(727001); insert-if-absent seed
  - Pence/PriceBasis/TriState/RoomOccupancy/PartyComposition domain types
affects: [01-04, phase-2, phase-3]
tech-stack:
  added: []
  patterns: [casing snake_case in drizzle config and client, insert-if-absent seed on natural keys, DB trigger for append-only history]
key-files:
  created: [src/pricing/types.ts, src/db/schema.ts, src/db/schema.test.ts, src/db/client.ts, src/db/migrate.ts, src/db/seed-data.ts, src/db/seed-data.test.ts, src/db/seed.ts, src/db/seed.integration.test.ts, drizzle.config.ts, drizzle/0000_cute_the_hand.sql, drizzle/0001_price_observation_append_only.sql, drizzle/meta/]
  modified: []
key-decisions:
  - "Seller id column is text with a TS enum from SELLER_IDS (no pg enum), so adding a seller needs no enum migration"
  - "Seed is insert-if-absent (onConflictDoNothing), so owner edits survive re-seeding"
requirements-completed: [FND-03, FND-04, FND-05]
duration: 25min
completed: 2026-11-27
---

# Phase 1 Plan 03: Schema, Migrations and Idempotent Seed Summary

Twelve-table Drizzle schema with generated, committed migrations, a locked runtime migrator and an idempotent Rixos Radamis seed, proven against real postgres:17-alpine.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Domain types and Drizzle schema (tests first) | 425b9d9 |
| 2 | Migrations, append-only trigger, migrator, seed | 4cb279b |
| 3 | [BLOCKING] Real Postgres 17 proof | verification only, no commit |

## [BLOCKING] Postgres proof (container hpa-pg-check-p03, host port 55433, removed afterwards)

- `pnpm db:migrate` run twice: both printed `{"msg":"migrations_applied"}`, exit 0.
- `pnpm db:seed` first run: `{"search":1,"searchParty":2,"searchAirport":2,"roomSetup":3,"airportCost":2,"seller":4}`.
- `pnpm db:seed` second run: every count 0.
- `REQUIRE_DB_TESTS=1 pnpm test:integration`: 1 file, 4 tests passed (seed twice gives exact counts; owner edit of BHX parking to 12000 survives re-seed; seller flip; UPDATE and DELETE on price_observation rejected).
- Tables in public matching the 12 expected names: `12`. `drizzle.__drizzle_migrations` rows: `2` (equals the two SQL files).
- `update seller set enabled=false where id='tui'`: `UPDATE 1`.
- `docker ps -a --filter name=hpa-pg-check-p03 -q` empty after `docker rm -f`.
- `drizzle-kit push` was never used.

## Other verification

`pnpm test` (19 unit tests), `pnpm typecheck`, `pnpm lint` and `pnpm db:check` all exit 0.

## Deviations from Plan

**1. [Note] Column names in schema tests are camelCase keys**
- With `casing: 'snake_case'`, drizzle's `getTableConfig` reports TS keys, not SQL names. The tests convert camelCase to snake_case before comparing. The generated SQL has the expected snake_case names (checked in 0000).

**2. [Note] Local-time columns use `timestamp` with `mode: 'string'`**
- Keeps wall-clock values free of JS Date timezone conversion.

**3. [Note] Worktree base was reset**
- The worktree started on 2ccb220, not the expected base cd33b09; reset to cd33b09 per the startup check before any work.

**4. [Note] Plan said commit `feat(01-03): schema, migrations and idempotent seed` as one commit**
- Committed per task instead (two feat commits), per the parallel-execution instructions.

No Rule 1-3 fixes were needed.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-01-10 to T-01-13 and T-01-15 mitigated: errors print name and message only, trigger on price_observation, advisory lock, integer pence, container bound to 127.0.0.1 and removed).

## Self-Check: PASSED

Files and commits 425b9d9, 4cb279b verified present.
