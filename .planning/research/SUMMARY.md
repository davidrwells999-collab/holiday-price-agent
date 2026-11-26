# Project Research Summary

**Project:** Holiday Price Agent
**Domain:** Personal, read-only package-holiday price watcher (UK tour operators): Playwright scraping, Claude text extraction, pure true-cost maths, ntfy alerts, plus owner-required CI, evals and observability
**Researched:** 2026-11-26
**Confidence:** MEDIUM-HIGH (stack versions and APIs verified; seller-site behaviour and operator-specific rules not yet probed)

## Executive Summary

This is a deterministic pipeline with an LLM at the edges, not an agent that browses. Monitors like this are normally built as:
- scripted navigation: URL builders, fixed click paths and a narrow click allow-list;
- a text-to-JSON extraction call;
- pure functions for money and alert decisions;
- idempotent storage underneath.

Claude appears in two places only: seller-page extraction and deals-page extraction. Both calls have no tools and schema-constrained output. Mastra is the tool and workflow wrapper (one tool per seller, fan-out across sellers). An optional thin Mastra Agent could write the digest prose, but it cannot change alert decisions. The core value is a trustworthy phone alert, and that depends far more on validation gates than on the scraping.

Build in the owner's 8-deliverable order, because the dependencies run the same way:
1. Scaffold and schema.
2. The pure true-cost core and the eval harness.
3. The first seller end to end. This builds the whole spine: capture/parse split, extractor, validators, run recording and the PostHog wrapper.
4. Deals.
5. The other three sellers, as pure additions.
6. Alert rules and the safety gate.
7. CD, canary and dashboards.
8. README.

The stack is owner-fixed, but research changed three things. Use Node 22 LTS, because Mastra needs >=22.13. Use TypeScript ~6.0, not 7.x, because typescript-eslint only supports <6.1. Stay on Drizzle 0.45.x, because 1.0 is still a release candidate.

The main risks are false alerts and silent breakage:
- Every extracted price must appear in the raw page text and fall within config bounds.
- Store only confirmed total prices, with an explicit `price_basis`.
- Check the hotel, date, airport and party the page echoes back against the request.
- Stop a seller on any bot check, with no evasion and no retry.
- Keep money as integer pence.
- Before alerting, require a stored previous best. Stay silent on the first run, dedupe by quote identity, and re-scrape to confirm.

Operational risks and their guards:
- Evals: deterministic scorers and a pinned model keep cost down; fork-safe CI keeps secrets safe.
- PostHog: a no-op facade with an event allow-list.
- Fixtures: sanitised before commit.

## Key Findings

### Recommended Stack (detail in STACK.md)

- **Runtime and language:** Node 22 LTS (>=22.13) everywhere (Docker, CI, `.nvmrc`, `engines`), with TypeScript ~6.0.3.
- **`@mastra/core` 1.86.0:** tools and workflows. Production must not depend on the `mastra` CLI.
- **`@anthropic-ai/sdk` 1.14.0:** extraction via `messages.parse()` and `zodOutputFormat()`, with no tools, integer pence and nullable "not on page" fields.
- **Models:** `claude-haiku-5-5` by default and `claude-sonnet-5-5` as fallback. Model ids live in env/config plus a PostHog flag and are recorded in every eval run.
- **Database:** Postgres 17 with Drizzle 0.45.4, drizzle-kit 0.31.11 and `pg` 8.23.1 as the only driver.
  - Migrations are generated SQL applied by the runtime `migrate()` in a one-shot compose service.
  - drizzle-kit is not in the runtime image.
- **Playwright 1.65.1:** used as a library; Vitest is the test runner. zod 4.6.7 is the only zod major in the repo.
- **Scheduler:** croner 11 with `Europe/London`, `protect: true`, and a catch-up for missed runs. Not Mastra's in-process scheduler (DST and locking undocumented), and not node-cron.
- **Rate limiting and retries:** `p-queue` 10 plus a random 5–10 s sleep per seller. `p-retry` only for Anthropic and ntfy network calls.
- **Logging:** pino with redaction.
- **Tests and lint:**
  - Vitest 5.1.2 with coverage-v8 at the same version, and a 90% threshold scoped to `src/pricing`.
  - `@mastra/evals`.
  - ESLint 10, typescript-eslint 8.74, Prettier 3.10.
- **CI and updates:** current Action majors (checkout@v7, setup-node@v7, pnpm/action-setup@v6, docker actions v4–v7).
  - Renovate groups Mastra, PostHog, Drizzle and Vitest updates.
  - The Playwright npm version and image tag are bumped together.

**PostHog / LLM tracing (one path):**
- The addendum's `withTracing` is not the Mastra integration. Mastra's own route is `@mastra/posthog` `PosthogExporter`. `withTracing` belongs to `@posthog/ai` and wraps a raw provider client.
- Extraction uses the Anthropic SDK directly, so every LLM call goes through **one `@posthog/ai`-wrapped Anthropic client**, with `posthogTraceId: run_id` and `posthogPrivacyMode: true`, behind the telemetry facade.
- `@mastra/posthog` comes in only if a Mastra Agent later makes model calls. Leaving it out early avoids counting the same call twice.

**Eval persistence (owner decision):**
- Each suite emits one `eval_run` event with `suite, score, threshold, passed, git_sha, model` and `distinct_id: holiday-agent`.
- The event is sent with an awaited `captureImmediate` in `afterAll`, and the client is shut down in a Vitest `setupFiles` hook, not `globalSetup`.
- It is emitted before the assertion, so failures are recorded too. The Vitest assertion decides pass or fail.
- Nothing in CI uses Mastra local storage.

### Expected Features (detail in FEATURES.md)

**Must have (table stakes):**
- **Searches and history:** searches live in Postgres (seeded with Rixos Radamis). Price history per (seller, airport, date, room) plus the overall best.
- **True cost:** a pure calculator that stores its breakdown and a `calcVersion`. Code vs cashback is compared as `code + reduced cashback` vs `full cashback`.
- **Normalisation gates:**
  - `price_basis`: total vs per-person.
  - Echo check of party, hotel, date and airport.
  - Direct-only, based on normalised data; unknown counts as non-direct.
  - Bags, transfers and infant are tri-state; unknown warns and is never £0.
- **Outlier hold:** a price more than about 40% below the previous best is re-scraped once before any alert.
- **Health:** a freshness stamp, a run-health alert, and "last success per seller" in the digest.
- **Alerts:** each ntfy alert carries seller, date, airport, room, true cost, breakdown, deep link and why it fired.
  - 24h dedupe.
  - Runs twice daily, plus `once`.
  - Top-5 digest.
- **Owner-mandated engineering:**
  - Protected `main`, CodeRabbit, PR CI.
  - Five evals, a nightly canary, CD to GHCR.
  - PostHog events, dashboards, alerts, flags and error tracking, all optional at runtime.

**Should have (differentiators):**
- **Conservative true cost:** shown with and without cashback; thresholds use the conservative figure.
- **Cashback conditions model:** `isNewCustomer`, `voidedByCode`, cap, exclusions and `seen_at` staleness.
- **Alert content:**
  - Per-person and total price in every alert.
  - Priority tiers.
  - The previous best in the alert text.
  - A cheapest-date-window line in the digest.
- **Schema fields stored early, filled later:** ATOL and deposit.

**Defer (v2+):**
- Percentile against history (needs weeks of data).
- Cashback reliability factor.
- Deposit and balance display.
- DIY flights+hotel seller.
- Reward-seat watcher.
- Next.js dashboard.

**Never build:**
- Booking or sign-in.
- CAPTCHA solving or proxies.
- Price prediction.
- Cashback counted as a guaranteed price cut.
- Ingesting urgency text.
- High-frequency polling.

### Architecture Approach (detail in ARCHITECTURE.md)

A deterministic spine with the LLM at the edges, a pure core inside an impure shell, and page content treated strictly as data.

1. **Seller adapters** (`planJobs`, `scrape`), split into `capture` (Playwright, impure) and `parse` (snapshot text to Quote via the extractor). The split allows offline fixture replay, and failure artefacts become eval fixtures.
2. **Shared seller layer:**
   - BrowserSession: one context per seller per run, `en-GB`, `Europe/London`.
   - Throttle.
   - BlockDetector, which runs before extraction.
   - Consent decliner.
   - `safeClick` allow-list.
   - Artefact writer.
3. **ExtractorService:** a tool-less Claude call with page text in a delimited block.
   - zod plus evidence-in-text verification.
   - A cheap model.
   - A content-hash cache.
   - At most two retries.
4. **Pure `src/pricing/`:** normalise, true cost, alert rules and digest. No IO imports (enforced by lint) and a 90% coverage gate.
5. **Workflows:**
   - `priceRunWorkflow` fans out across sellers with `foreach` (concurrency about 4) and runs a sequential, throttled loop inside each seller step.
   - `dealsWorkflow` is separate and links to pricing only through the `deal` table.
   - Errors are caught inside steps, because a throw inside `.parallel()` fails the whole block.
6. **Persistence:**
   - `run` and `seller_run`.
   - `quote`, upserted on a natural key.
   - `price_observation`, append-only and unique per (quote, run), with the breakdown as JSONB.
   - `deal`.
   - `alert`, with a dedupe key and status.
7. **Supporting pieces:**
   - Telemetry facade: a no-op when unset, with a typed event allow-list.
   - Eval harness: `runSuite` scores, emits `eval_run`, then asserts.
   - Scheduler: croner, a run lock and catch-up.

### Critical Pitfalls (32 in PITFALLS.md; D = deliverable)

1. **The LLM invents or misreads a price and it poisons history.**
   - Every money figure must appear literally in the page text, with an `evidence` snippet.
   - zod and config bounds, plus arithmetic cross-checks.
   - Failures are quarantined, and a big new low is re-scraped to confirm.
   - Covered in D3, D4 and D6.
2. **Prompt injection from page text.**
   - The extractor has no tools and gets page text as a delimited data block.
   - Raw page text never goes into an ntfy body.
   - Test the enforcement layer itself (`safeClick` and the fill allow-list, with a spy Page), or the safety gate can never fail.
   - Covered in D3, D4 (highest risk: HotUKDeals and MSE) and D6.
3. **Per-person vs total confusion and per-seller party encoding.**
   - A `price_basis` column; only totals are persisted.
   - TUI calendar prices are for screening only; click through to the total.
   - A seller-neutral party model with pinned encoder tests and an echo check.
   - Covered in D1, D3 and D5.
4. **Bot detection handled badly.**
   - Detect and stop, with no evasion or retry. An unknown or empty page means "unknown", not "sold out".
   - Persist a `blocked_until` cool-off.
   - Match Jet2's "no longer available" text explicitly.
   - Volume is up to about 700 page loads per run, so use calendars, job caps and an unavailable-skip.
   - Covered in D3, D5 and D6.
5. **False or spammy alerts.**
   - Dedupe on stable quote identity, with a price bucket and hysteresis against the stored previous best.
   - Silent on the first run, and sellers whose `seller_run` is not ok are skipped.
   - A per-run alert cap.
   - The `alert` row is written after a successful send.
   - Covered in D6; the schema support goes in D1.

**Operational pitfalls:**
- Eval flakiness, cost and fork-PR secrets: CI structure in D1; pinned model and cache in D3.
- Fixtures leaking PII: CodeRabbit excludes fixtures, so CI scanning has to catch it (D1, D3).
- PostHog capturing page content or PII: the allow-list wrapper plus a privacy test (D3).
- Branch-protection deadlocks and path-filtered required checks (D1).
- Canary issue spam, and GitHub runner IPs being challenged (D7).
- Watchtower skipping migrations (D7).

## Implications for Roadmap

Eight phases, one per deliverable. Each is its own PR (or a few small ones), and ends with CI green, CodeRabbit comments resolved, and a stop for the owner's go-ahead before merge.

### Phase 1: Scaffold, CodeRabbit, PR template, CI, branch protection steps

**Delivers:**
- Project setup:
  - Node 22 `.nvmrc` and `engines`, and a pinned pnpm.
  - Compose: app, Postgres 17 with healthcheck, a one-shot `migrate` service, `shm_size`, `init`, `TZ=Europe/London`.
  - zod env config, with PostHog optional.
- Drizzle schema:
  - Tables `run`, `seller_run`, `price_observation`.
  - Natural-key unique indexes.
  - Money in pence; flight times as local wall-clock plus airport.
  - `price_basis` and a per-seller `enabled` flag.
- Migrations and an idempotent seed.
- Vitest layout: `unit`, `extraction` and `integration` projects; live tests excluded.
- Code skeleton: `pricing/types.ts`, a no-op telemetry facade with a typed allow-list, and an `evals/` skeleton with `thresholds.ts`.
- `.coderabbit.yaml` and a PR template with a "fixtures sanitised" checkbox.
- `ci.yml`:
  - Lint, Prettier, `tsc` and unit tests.
  - Docker build with gha cache.
  - Migrations run twice on a Postgres 17 service, plus a drift check.
  - A `ci-success` aggregator as the single required check.
  - A guard for fork and Renovate PRs.
- Fixture sanitiser and secret scan.
- Renovate.
- README branch-protection steps: 0 approvals for a solo repo, conversation resolution required.

**Research flag:** skip. Quick checks only: the Playwright image (prefer `node:22-bookworm-slim` plus `playwright install --with-deps chromium`) and the `.coderabbit.yaml` schema.

### Phase 2: True-cost calculator, tests, true-cost eval

**Why now:** pure logic, so the eval harness, `eval_run` and the PostHog-unset fallback are proven before any model call.

**Delivers:**
- `pricing/true-cost.ts`, plus `CostConfig` and `DealSet`.
- A `Pence` type with a single £ parser and basis-point rounding.
- The overnight-window function, tested at 00:29, 00:30, 04:59, 05:00, 05:01 and 23:59, plus a flight that crosses midnight.
- Tri-state bags, transfers and infant.
- The cashback conditions model and the conservative true cost.
- A stored breakdown with `calcVersion`.
- About 20 exact `it.each` scenarios.
- The 90% coverage gate.
- `runSuite` and `emitEvalRun`.
- The suite runs on every PR, including forks.

**Research flag:** skip. Confirm the `runEvals` import path and `captureImmediate` here.

### Phase 3: Jet2 end to end, extraction fixtures and eval, PostHog tracing and run events

**Why now:** this builds the whole spine and the trust gates, which later sellers reuse. Hand-labelling 6–10 real snapshots is the slowest step, so start early.

**Delivers:**
- The `SellerAdapter` interface and the `PageSnapshot` capture/parse split.
- The shared seller layer: browser session, throttle, BlockDetector, consent helper, a wait-until-ready-and-stable helper, the `safeClick` allow-list and the artefact writer.
- ExtractorService.
- The normaliser: direct only, echo check, `price_basis`.
- Storage and run records: quote upsert, `price_observation`, and `run`/`seller_run` recording.
- The `priceRunWorkflow` skeleton.
- The Jet2 encoder with pinned tests.
- An ntfy test alert and `once`.
- The `@posthog/ai` client, events, flags with a config fallback, and error tracking.
- `extraction.eval` (exact match: 100% on price, airport and direct; ≥ 95% overall) and an injection fixture.
- `evals.yml` with a path filter, a nightly run, a fork guard and an always-report gate.

**Research flag:** needs research. A live Jet2 spike covering:
- occupancy encoding for both layouts: `r2c4_1` (one room) and `r1c4r1c1` (two rooms). Both come from the brief and are not a conflict.
- the hidden flight block;
- the `/options` stop point;
- the BRS "no longer available" text;
- consent selectors and robots.txt;
- `@posthog/ai` export names;
- model parameters.

### Phase 4: Deals scraper and deals eval

**Delivers:**
- Capture and parse for the six sources.
- `dealRepo` upsert (unique key, `first_seen_at`, `seen_at`, `expires_at`).
- `dealsWorkflow`, running daily before the morning price run.
- Conditions fields: new-customer-only, voided-by-code, cap, exclusions and eligibility.
- Wiring into the true-cost input.
- `deals.eval`.
- A source allow-list.
- No alerts on unknown-expiry or ineligible deals.

**Research flag:** needs research.
- Current TopCashback and Quidco terms.
- Bot protection and robots.txt for each source.
- Matching deals to quotes.
- How `stacks_with_cashback` interacts with the "code cuts cashback" rule.

### Phase 5: TUI, On the Beach, easyJet holidays with fixtures and evals

**Delivers:** one PR per seller.
- Calendar-aware `planJobs`, a per-seller job cap and an unavailable-skip.
- TUI: click through to the total.
- On the Beach: month chunking, a verified "Direct" filter and a CAPTCHA fixture.
- easyJet: bags and transfers set in config.
- For every seller: an encoder with echo checks, plus fixtures and eval cases.
- Per-seller flags and `captcha_detected` events.

**Research flag:** needs research for each seller:
- the easyJet URL shape;
- TUI calendar mechanics;
- bot management;
- infant and transfer policies.

### Phase 6: Alert rules, dedupe, digest, scheduler, alert and safety evals

**Delivers:**
- Pure `alert-rules.ts` covering the four rules, with hysteresis.
- `alertRepo.tryClaim` with `claimed|sent|failed` status.
- Alert gating:
  - Silent on the first run.
  - Sellers whose run is not ok are suppressed.
  - A re-scrape confirms before alerting.
  - A per-run cap and a staleness window.
- A run-health alert with the `blocked_until` cool-off.
- Priority tiers.
- The digest: price ages, last success per seller and a cheapest-window line.
- Scheduling: croner with a Postgres advisory lock, a DST test on a mocked clock around 2027-03-28 and 2027-10-31, and catch-up.
- `alerts.eval`: about 20 scenarios, zero missed must-alerts and at most 1 false alert per 20.
- `safety.eval` (100%): tests `safeClick`, the fill allow-list and extractor flagging.

**Research flag:** skip. Agree the hysteresis margins with the owner.

### Phase 7: CD, nightly canary, PostHog dashboards and alerts

**Delivers:**
- `cd.yml`: push to GHCR tagged with the SHA and `latest`.
- Deployment:
  - A separate migration step guarded by an advisory lock.
  - A chosen deploy path.
  - `workflow_dispatch` run-once, either with database reachability solved or as a dry-run mode.
- `canary.yml`:
  - One fixed known-good search per seller.
  - Issues deduped by fingerprint, with comment-and-auto-close.
  - ntfy after N consecutive failures.
  - Never a required check, and never sends price alerts.
- PostHog dashboards and alerts:
  - Success rate under 80% over 24h, counting `blocked` separately from `failed`.
  - An LLM spend cap.
  - An alert when the nightly `eval_run` is missing.

**Research flag:** needs research. The deploy target, run-once reachability, whether runner IPs get challenged (canary from the deployment instead?), and PostHog configuration.

### Phase 8: README

**Delivers:**
- Setup, and how to add a search or a seller.
- Branch protection steps.
- Responsible-use policy and known limitations.
- How to run the evals and PostHog, and dashboard docs.

### Phase Ordering Rationale

- **Order is forced by dependencies:**
  - schema and CI before code;
  - pure true cost and the eval harness before the first LLM call;
  - one seller end to end before more sellers;
  - deals and sellers before alerts;
  - a working system before CD.
- **Decisions that must land in Phase 1:**
  - natural-key indexes;
  - `price_basis`;
  - pence columns;
  - local-time storage;
  - `run`/`seller_run`;
  - the telemetry facade;
  - the required-check policy;
  - the fixture sanitiser and secret scan.
- **Which suites need the API key:**
  - Deterministic suites (true cost, alert decisions) need none, so they run on every PR including forks.
  - Model-backed suites (extraction, deals, safety) run only on path-filtered PRs and nightly.

### Research Flags Summary
- **Needs research:** Phases 3, 4, 5 and 7.
- **Standard patterns:** Phases 1, 2, 6 and 8.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH, some MEDIUM | Versions from `npm view` on 2026-11-26. MEDIUM: Mastra scheduler, croner DST, `captureImmediate`, `@posthog/ai` exports, `runEvals` path |
| Features | MEDIUM | The owner brief is authoritative. UK operator rules come from domain knowledge |
| Architecture | MEDIUM | Mastra primitives verified against docs. Site behaviour untested (LOW) |
| Pitfalls | MEDIUM | Strong on engineering failure modes. Site-specific and legal/ToS items are LOW until the spikes |

**Overall:** MEDIUM-HIGH for the plan and its order. MEDIUM wherever seller-site behaviour matters.

### Gaps to Address
- **Jet2 occupancy:** pin `r2c4_1` and `r1c4r1c1` in encoder tests and confirm them live in Phase 3.
- **Conflicts between the research files, resolved here:**
  - scheduler = croner;
  - driver = `pg` only;
  - migrations = a separate one-shot step, never on boot;
  - PostHog = one wrapped Anthropic client.
- **Facts to verify for each operator:** infant policy, transfers, ATOL, deposits, card surcharges and cashback terms.
- **Run volume:** design for calendar use and job caps in Phase 3, then tune in Phase 5.
- **Open until Phase 7:** the deploy target and run-once database reachability.
- **Legal/ToS:** unverified for each site. A robots.txt check and `enabled` flags go in from Phases 1 and 3, and the README states the policy.
- **Unverified API names:**
  - `runEvals` path and `captureImmediate` (Phase 2);
  - `@posthog/ai` exports and model parameters (Phase 3);
  - TypeScript 6.0 with Mastra types (Phase 1).
- **CodeRabbit:**
  - It reads config from the PR base branch, so the Phase 1 config only takes effect after merge.
  - Agree a cap on re-requested reviews.

## Sources

- **Primary (HIGH):**
  - npm registry, 2026-11-26.
  - Anthropic models overview and structured outputs docs.
  - Mastra docs: workflows, control flow, scheduled workflows, tools, evals.
  - PostHog's Mastra install guide.
  - Drizzle migrations docs.
  - CodeRabbit configuration reference.
  - GitHub releases API and the MCR tag list.
  - The owner's documents.
- **Secondary (MEDIUM):**
  - Adapter, capture/parse and dedupe-as-claim patterns.
  - Playwright-in-Docker.
  - croner DST.
  - posthog-node flush behaviour.
- **Tertiary (LOW):**
  - UK operator facts.
  - Seller site behaviour.
  - GitHub fork and Dependabot secrets.
  - drizzle-kit locking.
  - Legal/ToS.

*Research completed: 2026-11-26. Ready for roadmap: yes.*
