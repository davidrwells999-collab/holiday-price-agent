---
phase: 01-scaffold-coderabbit-pr-template-ci-branch-protection
plan: 08
status: complete
requirements: [CI-08, CI-01, CI-03, CI-07]
completed: 2026-11-27
---

# Plan 01-08 Summary: Phase 1 PR, CI green, Qodo review addressed, merged

**One-liner:** Opened PR #2 with all of Phase 1. CI is green on all 8 required checks. All 15 Qodo findings are fixed and replied to. Branch protection is applied on `main`, and PR #2 is rebase-merged on the owner's explicit instruction.

## What happened
- Owner setup: Qodo Merge was already installed. The CodeRabbit app is still installed by owner choice: it auto-skips (under 10 stars) and is ignored. No CodeRabbit CLI is used. Renovate app and the `ANTHROPIC_API_KEY` secret are deferred (optional).
- PR #2 (`phase-1/scaffold` into `main`) was opened with test evidence and the Qodo outcome table (`01-PR-BODY.md`).
- First CI run: 7/8 green, and `docker-build` failed its image-size gate. Cause: the 700 MB cap came from Docker Desktop's *compressed* size (541 MB), while CI measures the *unpacked* linux/amd64 image at 1317 MB. The cap was recalibrated, then tightened after Qodo feedback, to 1450 MB (baseline +10%), with a rule to re-measure when the base image or Chromium changes.
- Qodo raised 13 inline findings and 2 Low findings in its summary. Every one was fixed with a test (one commit each), replied to, and its thread resolved:
  - **Integration tests:** a throwaway per-run test DB.
  - **Boot cleanup:** the pool is closed on both failure paths.
  - **Fixture scan:** fails closed on a missing root or binary files; scans all formats.
  - **Sanitiser:** strips unquoted and relative links; scans before writing, then writes atomically.
  - **Tracing provider:** wrapped with sanitising.
  - **ntfy:** generic detectors, with the limit documented.
  - **Compose:** a `seed` service runs before `app`.
  - **Exception telemetry:** sends only hashes.
  - **Pricing purity lint:** extended.
  - **Image size cap:** tightened.
  - **Price history:** TRUNCATE blocked (migration 0002).
  - **Renovate:** `minimumReleaseAge: 3 days`.
- Final: 145 unit tests. The integration suite passed twice in a row on a throwaway Postgres 17.12. CI is green on all 8 checks.
- Branch protection on `main` was applied with `gh api` after owner confirmation and read back:
  - required checks: lint, typecheck, unit-tests, evals, docker-build, migration-check, secret-scan and ci-success (strict);
  - 0 approvals, conversation resolution required, admins included;
  - no force pushes or deletions;
  - Qodo is not required.
- PR #2 was rebase-merged at 2026-11-27T10:48Z on the owner's explicit instruction ("Apply + you merge PR 2").

## Deviations
- The Dockerfile uses BuildKit cache mounts instead of `rm -rf /var/lib/apt/lists/*`, because the harness blocked the `rm`. The result is the same.
- `eslint-config-prettier` is held at 10.1.8 (10.1.9 was a suspicious same-day release).

## Follow-ups
- Optional: the `ANTHROPIC_API_KEY` Actions secret (evals skip until set) and the Renovate app.
- Every later PR must be up to date with `main` before merge (strict protection).
