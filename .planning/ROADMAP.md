# Roadmap: Holiday Price Agent

## Overview

A personal, read-only package-holiday price watcher: a deterministic scraping pipeline with Claude at the edges (page-text extraction only), pure true-cost maths, and trustworthy ntfy alerts. The roadmap is the owner's 8 deliverables from BRIEF-ADDENDUM.md, in order. The order matches the dependencies: schema and CI, then pure core and eval harness, then one seller end to end, then deals, then the other sellers, then alerts, then CD and dashboards, then the README.

**Delivery rule (applies to every phase):** each phase ships as its own PR (or a few small PRs). Before opening each PR, run `coderabbit review --base main` locally and fix or justify every finding, then put the summary in the PR description under "CodeRabbit CLI review". After the PR opens, address every Qodo Merge review comment (fix or reply). Keep PRs small to fit Qodo's free quota. The phase ends with PR(s) opened, CI green, Qodo review addressed, and then a STOP for the owner's go-ahead before merge. This is the final success criterion of every phase below.

**Granularity:** standard (8 phases, fixed by the owner's deliverable list).

## Phases

- [ ] **Phase 1: Scaffold, review config, PR template, CI, branch protection** - Runnable Docker Compose skeleton with schema, seed, PR guardrails and the CI required-check policy
- [ ] **Phase 2: True-cost calculator and eval harness** - Pure, fully tested true-cost function plus the eval harness proven on the true-cost eval
- [ ] **Phase 3: Jet2 end to end, extraction eval, PostHog tracing** - The whole scraping spine proven on one seller, with trust gates, fixtures, evals and telemetry
- [ ] **Phase 4: Deals scraper and deals eval** - Daily deal discovery feeding true cost, with safe extraction of untrusted deal pages
- [ ] **Phase 5: TUI, On the Beach, easyJet holidays** - The remaining three sellers added through the adapter interface, each with fixtures and evals
- [ ] **Phase 6: Alerts, dedupe, digest, scheduler, alert and safety evals** - Trustworthy ntfy alerts on a twice-daily DST-correct schedule, with hard safety gates
- [ ] **Phase 7: CD, nightly canary, PostHog dashboards and alerts** - Image published and deployed with guarded migrations, live canary, and operational dashboards
- [ ] **Phase 8: README** - Complete documentation for setup, extension, evals, PostHog and responsible use

## Phase Details

### Phase 1: Scaffold, review config, PR template, CI, branch protection
**Goal**: The owner has a runnable, CI-guarded repo skeleton where every later PR is automatically checked and reviewed, and the data model decisions that are costly to change later are locked in.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, CI-01, CI-02, CI-03, CI-05, CI-06, CI-07, CI-08
**Success Criteria** (what must be TRUE):
  1. `docker compose up` starts Postgres 17, runs the one-shot migrate service, then starts the app; with `.env` missing a required variable the app fails at startup with a clear zod error, and with PostHog env unset it still runs.
  2. After seeding (run twice with no change), the database holds the Rixos Radamis search with party, dates, airports, room setups and airport costs all editable as rows, and each seller can be switched on or off by config.
  3. A test PR runs lint, Prettier, `tsc`, unit tests, Docker build and a migration check twice on a throwaway Postgres, with our CI jobs (lint, typecheck, unit tests, docker build, migration check, plus evals when triggered, always reporting) as the only required checks; a PR containing a fixture with a token or personal data fails the scan.
  4. `.pr_agent.toml` (Qodo Merge rules, auto /describe and /review), the PR template (with the "fixtures sanitised" checkbox) and Renovate config are in the repo, Renovate/fork PRs skip secret-needing jobs cleanly, and the README lists the branch protection settings with neither Qodo nor CodeRabbit a required check.
  5. PR(s) opened, CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Skip (standard patterns). Quick checks only: Playwright image choice and `.pr_agent.toml` keys.

### Phase 2: True-cost calculator and eval harness
**Goal**: The owner can trust the money maths: true cost is a pure, deterministic, fully tested function, and regressions fail CI through an eval harness that works with no model call and with PostHog unset.
**Depends on**: Phase 1
**Requirements**: COST-01, COST-02, COST-03, COST-04, COST-05, COST-06, EVAL-01, EVAL-02, CI-04
**Success Criteria** (what must be TRUE):
  1. Given a quote, airport costs and deals, the calculator returns an integer-pence true cost with a stored breakdown and `calcVersion`, choosing the better of code or cashback and showing the pick, without double counting auto-applied discounts.
  2. The overnight hotel is added only for returns landing 00:30-05:00 with a drive over 45 minutes, verified at the boundary times and for midnight-crossing flights; unknown bags, transfers or infant fees are flagged and never counted as £0.
  3. A conservative true cost is produced alongside the full one, and the true-cost eval (about 20 scenarios with exact expected £ values) passes in CI, including on fork PRs.
  4. Deliberately breaking a calculator rule, or dropping `src/pricing` coverage below 90%, fails CI; each eval suite emits an `eval_run` event before asserting and degrades to a no-op when PostHog is unset.
  5. PR(s) opened, CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Skip (standard patterns). Confirm `runEvals` import path and `captureImmediate` behaviour.

### Phase 3: Jet2 end to end, extraction eval, PostHog tracing
**Goal**: The owner can run one real Jet2holidays search end to end and get validated, direct-only, true-cost-priced quotes stored with history, with every trust gate, run record and trace in place for the other sellers to reuse.
**Depends on**: Phase 2
**Requirements**: SELL-01, SELL-02, SELL-06, SELL-07, SELL-08, SELL-09, SELL-10, SELL-11, SELL-12, SELL-13, SELL-14, RUN-01, RUN-02, RUN-04, EVAL-03, EVAL-07, OPS-05, OPS-06, OPS-10, OPS-11
**Success Criteria** (what must be TRUE):
  1. `pnpm run once` scrapes Jet2 for every airport x date x room setup (BHX and BRS, one-room and two-room occupancy), throttled at 5-10 seconds with jitter, and saves direct-only quotes, append-only observations and per-seller run records, with lowest-ever true cost queryable per (seller, airport, date, room) and overall.
  2. A price not literally present in the page text, out of sanity bounds, or on a page whose hotel, party, nights, date or airport differs from the request is rejected; an unknown-direct quote is dropped and a "holiday no longer available" page is recorded as unavailable, not as a price.
  3. A CAPTCHA or bot check stops that seller for the run with a persisted cool-off and status `blocked`; a failed parse saves a screenshot and snapshot that can be promoted to an eval fixture; only search fields are filled and only allow-listed clicks are made.
  4. The extraction eval runs offline on sanitised Jet2 fixtures (100% on price, airport, direct; at least 95% overall, plus an injection fixture) and runs in the evals workflow on path-filtered PRs and nightly, skipping safely on forks.
  5. With PostHog configured, a `pnpm run once` produces a single OTel trace (`run_id` attribute) exported through `PostHogSpanProcessor`, with the span tree run → seller → search → page load (manual Playwright spans) → extract → LLM call (`$ai_generation`) → true-cost → db write. Failed parses show ERROR spans with recorded exceptions. Span attributes and events hold only sizes/hashes, no page content or personal data. `docker compose --profile debug up` shows the same trace in Jaeger. With PostHog/OTel env unset, tracing is a no-op and everything still works.
  6. PR(s) opened, CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Needs phase research. Live Jet2 spike (occupancy encoding `r2c4_1` / `r1c4r1c1`, hidden flight block, `/options` stop point, BRS unavailable text, consent selectors, robots.txt), `@posthog/ai/otel` `PostHogSpanProcessor` API, and Mastra OTel export config (no double instrumentation), model parameters.

### Phase 4: Deals scraper and deals eval
**Goal**: The owner's true-cost figures reflect current cashback and discount deals, discovered daily from the six deal sources, with page content strictly treated as data.
**Depends on**: Phase 3
**Requirements**: DEAL-01, DEAL-02, DEAL-03, EVAL-04
**Success Criteria** (what must be TRUE):
  1. A daily deals job visits TopCashback, Quidco, Blue Light Card, Student Beans, MSE and HotUKDeals for each seller and upserts deal rows with type, source, value, conditions, min spend, expiry, stacking flag, new-customer-only, voided-by-code, cap and `seen_at`.
  2. True cost for a quote uses current deals, and stale, expired or ineligible deals (for example Blue Light Card when not eligible) are excluded, which the owner can see change a quote's breakdown.
  3. Deal pages go through the same tool-less extractor with evidence checks, and a page containing injected instructions yields no action and no fabricated deal.
  4. The deals eval passes offline on saved cashback and code pages, checking rate, min spend, expiry and stacking flag against labelled expectations.
  5. PR(s) opened, CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Needs phase research. Current TopCashback/Quidco terms, bot protection and robots.txt per source, matching deals to quotes, `stacks_with_cashback` vs the "code cuts cashback" rule.

### Phase 5: TUI, On the Beach, easyJet holidays
**Goal**: The owner gets comparable quotes from all four sellers, each added as one folder plus one registry line with its own fixtures and evals.
**Depends on**: Phase 4
**Requirements**: SELL-03, SELL-04, SELL-05
**Success Criteria** (what must be TRUE):
  1. `pnpm run once` returns direct-only, validated quotes from TUI (screened by calendar per-person prices but stored only as the click-through total with rooms and flight times), On the Beach (date ranges within one month, "Direct" filter applied, bag price recorded) and easyJet holidays (EGSS0063, bags and transfers recorded as included where shown).
  2. Each seller respects the per-seller job cap and throttle, and a CAPTCHA on On the Beach stops only that seller while the others complete.
  3. Each seller has sanitised fixtures and extraction eval cases meeting the existing thresholds, and each can be disabled through config or its PostHog flag.
  4. PR(s) opened (one per seller), CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Needs phase research per seller. easyJet URL shape, TUI calendar mechanics, bot management, infant and transfer policies.

### Phase 6: Alerts, dedupe, digest, scheduler, alert and safety evals
**Goal**: The owner gets trustworthy ntfy alerts and a daily digest on a DST-correct twice-daily schedule, and the safety gate proves the agent can never take a non-read-only action.
**Depends on**: Phase 5
**Requirements**: ALRT-01, ALRT-02, ALRT-03, ALRT-04, ALRT-05, ALRT-06, ALRT-07, ALRT-08, ALRT-09, RUN-03, EVAL-05, EVAL-06
**Success Criteria** (what must be TRUE):
  1. The owner's phone receives an ntfy alert for each of the four rules (best true cost down at least £50; BRS within £150 of best BHX; new deal worth at least £50; best-quote deal expiring within 24h), each showing seller, date, airport, room, true cost per person and total, breakdown, code/cashback pick, previous best and deep link, and never any raw page text.
  2. The same reason for the same quote is never sent twice in 24 hours; nothing is sent on the very first run or for a seller whose run was not ok; a big new low is re-scraped to confirm; and a per-run cap applies.
  3. A daily digest shows the top 5 options with price age and last successful run per seller, and the owner is alerted when a seller is blocked or failing.
  4. The scheduler runs at 07:45 and 19:45 Europe/London across the 2027 DST changes, never overlaps runs, catches up after a missed run, and runs deals before the morning price run.
  5. The alert-decision eval (about 20 scenarios; zero missed must-alerts, at most 1 false alert per 20) and the safety eval (100% hard gate, injected instructions and booking buttons never cause a non-read-only click or fill, and the page is flagged) pass in CI.
  6. PR(s) opened, CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Skip (standard patterns). Agree hysteresis margins with the owner.

### Phase 7: CD, nightly canary, PostHog dashboards and alerts
**Goal**: The owner can ship merged code to a running deployment safely, find out when a seller parser breaks before the real run does, and see system health in PostHog.
**Depends on**: Phase 6
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04, OPS-07, OPS-08, OPS-09
**Success Criteria** (what must be TRUE):
  1. Merging to `main` pushes the image to GHCR tagged with the git SHA and `latest`, and the deploy runs migrations as a separate guarded step before the new version starts on the chosen target.
  2. The owner can trigger a "run once now" job from GitHub through `workflow_dispatch`.
  3. The nightly canary runs one real search per seller; a parser failure or CAPTCHA opens one deduped GitHub issue and sends an ntfy alert, and the canary never fails a PR.
  4. PostHog dashboards show best true cost over time per seller and airport, scrape success rate, CAPTCHA rate, LLM cost per run and per month, and alerts sent; alerts fire for seller success under 80% over 24h and for LLM spend above the daily limit.
  5. Uncaught exceptions appear in PostHog error tracking, and the model can be switched by feature flag.
  6. PR(s) opened, CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Needs phase research. Deploy target, run-once database reachability, whether runner IPs get challenged (canary from the deployment instead), PostHog configuration.

### Phase 8: README
**Goal**: The owner (or a future reader of the portfolio) can set up, extend, evaluate and operate the project from the README alone.
**Depends on**: Phase 7
**Requirements**: DOC-01
**Success Criteria** (what must be TRUE):
  1. A reader following the README from a clean checkout gets the app running with Docker Compose and a first `pnpm run once`.
  2. The README explains how to add a search and how to add a seller, and how to run each eval suite.
  3. The README covers PostHog setup and dashboards, the responsible-use policy and known limitations.
  4. PR(s) opened, CI green, CodeRabbit CLI review findings fixed or justified and summarised in the PR description, Qodo Merge review addressed, then STOP for the owner's go-ahead before merge.
**Plans**: TBD
**Research flag**: Skip (standard patterns).

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scaffold, review config, PR template, CI | 0/TBD | Not started | - |
| 2. True-cost calculator and eval harness | 0/TBD | Not started | - |
| 3. Jet2 end to end, extraction eval, PostHog | 0/TBD | Not started | - |
| 4. Deals scraper and deals eval | 0/TBD | Not started | - |
| 5. TUI, On the Beach, easyJet holidays | 0/TBD | Not started | - |
| 6. Alerts, digest, scheduler, alert and safety evals | 0/TBD | Not started | - |
| 7. CD, nightly canary, PostHog dashboards | 0/TBD | Not started | - |
| 8. README | 0/TBD | Not started | - |
