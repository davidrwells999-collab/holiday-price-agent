---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 06
subsystem: infra
tags: [fixtures, sanitiser, pii-scan, gitleaks, tdd]
requires: [01-01]
provides:
  - Shared DETECTORS used by both sanitiser and scanner
  - sanitiseText, sanitiseHtml, sanitiseUrl
  - scanContent, scanPaths, selfTest
  - pnpm sanitise:fixture and pnpm scan:fixtures (with --self-test)
  - .gitleaks.toml for the plan 07 CI secret-scan job
affects: [01-07]
tech-stack:
  added: []
  patterns: [shared detector table, masked-preview findings, runtime-assembled secret-shaped test data]
key-files:
  created:
    - src/fixtures/detectors.ts
    - src/fixtures/sanitise.ts
    - src/fixtures/sanitise.test.ts
    - src/fixtures/scan.ts
    - src/fixtures/scan.test.ts
    - scripts/sanitise-fixture.ts
    - scripts/scan-fixtures.ts
    - .gitleaks.toml
  modified: []
key-decisions:
  - "opaque_token requires 32+ chars of [A-Za-z0-9_-] containing both a letter and a digit, so hotel-name slugs stay intact"
  - "Opaque matching uses a linear regex plus an accept() post-filter instead of lookaheads, avoiding quadratic backtracking (T-01-31)"
  - "ntfy_topic is env-driven, not a static DETECTORS entry; scanContent takes an env option"
requirements-completed: [CI-05]
duration: 15min
completed: 2026-11-27
---

# Phase 1 Plan 06: Fixture Sanitiser and PII/Secret Scan Summary

Pure-regex sanitiser and scan that keep emails, UK phones and postcodes, JWTs, API keys, opaque tokens, cookie headers, the ntfy topic and leftover scripts out of `evals/fixtures/**`. Findings carry only path, line, kind and a masked preview. A self-test plants every kind so the gate cannot silently pass.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Detectors and sanitiser | 46417f8 test (RED), 6ee4342 feat (GREEN) |
| 2 | Scan, CLIs, gitleaks config | 1d84a05 test (RED), 5f0b743 feat (GREEN) |

## Verification

- `pnpm test`: 49 tests pass (sanitise and scan suites plus plan 01 tests).
- `pnpm scan:fixtures` exits 0 (no evals/fixtures dir yet). `pnpm scan:fixtures --self-test` exits 0.
- Leak probe: a runtime-generated email in `evals/fixtures/probe/page.txt` made the scan exit 1, printing only `page.txt:2 email p***@***`. Probe deleted, never committed.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` all exit 0.
- Acceptance grep for secret-shaped literals in `src/fixtures/` and `scripts/` returns nothing.
- gitleaks was not run locally (binary not installed; docker image not pulled). The plan 07 CI job proves it.

## Deviations from Plan

**1. [Rule 1 - Bug, test only] Cookie sample prefixed on the line**
- A scan test prefixed every sample with "line ", so the line-anchored cookie header detector (correctly) missed it. Fixed the test to scan each sample at line start. Scanner unchanged.

**2. [Design refinement] opaque_token needs letter plus digit**
- The plan said "excluding pure-digit runs". Long hyphenated slugs (e.g. hotel names) would otherwise be redacted, contradicting "hotel names unchanged", so a token must contain at least one letter and one digit. Tradeoff: an all-letter 32+ char token is not caught by this detector (other detectors and gitleaks still apply).

**3. [Note] `.gitleaks.toml` is not Prettier-formatted**
- Prettier has no TOML parser here; the file was excluded from the format run and `format:check` passes.

**4. [Note] Extra helpers beyond the plan's exports**
- detectors.ts also exports `applyDetector`, `firstMatch`, `looksOpaque`; scan.ts exports `selfTest` (unit-tested, used by the CLI).

## TDD Gate Compliance

RED (`test(01-06)`) then GREEN (`feat(01-06)`) commits exist for both tasks. RED for task 1 was confirmed failing (module missing); no separate refactor commits were needed.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. Threat register items T-01-27 to T-01-31 are implemented as planned.

## Self-Check: PASSED

All eight plan files exist and commits 46417f8, 6ee4342, 1d84a05, 5f0b743 are in the branch history. STATE.md and ROADMAP.md were not touched.
