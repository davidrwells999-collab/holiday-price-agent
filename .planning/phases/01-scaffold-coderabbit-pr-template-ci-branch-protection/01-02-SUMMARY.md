---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 02
subsystem: config-telemetry-sellers
tags: [zod, env, telemetry, posthog-facade, tracing, feature-flags]
requires: [01-01]
provides:
  - loadEnv/loadDbEnv/EnvValidationError and .env.example
  - Telemetry facade with strict event allow-list (8 events), no-op backend
  - No-op Tracing facade with span name and attribute allow-lists
  - resolveSellerEnablement (config decides, flag overrides)
affects: [plan 04 boot wiring, Phase 3 PostHog/OTel backends]
tech-stack:
  added: []
  patterns: [facade with no-op default, zod strictObject allow-list, timeout-raced flush]
key-files:
  created:
    - .env.example
    - src/config/env.ts
    - src/config/env.test.ts
    - src/telemetry/events.ts
    - src/telemetry/telemetry.ts
    - src/telemetry/telemetry.test.ts
    - src/telemetry/tracing.ts
    - src/telemetry/tracing.test.ts
    - src/sellers/enablement.ts
    - src/sellers/enablement.test.ts
  modified: []
key-decisions:
  - "Env errors use only issue path + custom messages, so received values never appear"
  - "Tracing facade exports sanitiseSpanAttribute so a real provider can enforce the allow-list and URL stripping"
requirements-completed: [FND-02, FND-05, FND-06]
metrics:
  tasks: 3
  files: 10
  completed: 2026-11-27
---

# Phase 1 Plan 02: Env, Telemetry and Seller Enablement Summary

Pure, IO-free foundations: zod env validation that never echoes values, a telemetry facade enforcing a strict 8-event allow-list (no-op when PostHog unset), a no-op tracing facade, and seller enablement resolution with optional flag override. No new dependencies.

## Commits
- 90f8ae0: env validation and .env.example (Task 1)
- 72b869d: telemetry facade and tracing (Task 2)
- b204d71: seller enablement resolver (Task 3)

## Verification
`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` all pass (44 tests). No posthog-node or @opentelemetry references in src/.

## Deviations from Plan
- Worktree base was reset to cd33b09 per the startup check (merge-base had differed).
- TDD: tests and implementation were written together per task and committed once per task, so there are no separate RED commits.
- Commits are on the worktree branch, not phase-1/scaffold, per orchestrator instruction.
- The `.env.example` is not run through prettier (no parser); tests use a `delete` on a copy rather than destructuring to satisfy the no-unused-vars lint rule.
- Added `Object.hasOwn` guard so inherited keys like `constructor` are treated as unknown events.

## Known Stubs
None. Real PostHog/OTel backends are intentionally deferred to Phase 3.

## Self-Check: PASSED
