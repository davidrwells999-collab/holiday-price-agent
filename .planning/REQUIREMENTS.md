# Requirements: Holiday Price Agent

**Defined:** 2026-11-26
**Core Value:** A trustworthy phone alert when the **true cost** of a direct-flight holiday option drops enough to be worth booking.

## v1 Requirements

### Foundation (FND)

- [ ] **FND-01**: Owner can start the app and Postgres 17 with `docker compose up`. A one-shot `migrate` service applies migrations before the app starts (Node 22, `TZ=Europe/London`, Playwright Chromium in the image)
- [ ] **FND-02**: Owner configures the app from `.env` (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `NTFY_TOPIC`, optional `POSTHOG_API_KEY`/`POSTHOG_HOST`), validated by zod at startup, with a committed `.env.example`
- [ ] **FND-03**: The schema stores searches, quotes, append-only price observations, deals, alerts, runs and per-seller runs.
  - Money is integer pence.
  - Flight times are local wall-clock plus airport code.
  - Quotes carry `price_basis`.
  - Quotes are upserted on natural-key unique indexes.
- [ ] **FND-04**: An idempotent seed creates the Rixos Radamis search:
  - Party: 2A + child 4 + infant, with an optional 3A variant.
  - 7 nights, departures 3–31 May 2027.
  - BRS preferred, BHX acceptable.
  - Room setups: cheapest standard, two standard rooms, family room.
  - Airport cost config.
  - Every value is editable in the database, not hard-coded.
- [ ] **FND-05**: Each seller can be enabled or disabled through config, with an optional PostHog flag override
- [ ] **FND-06**: Telemetry goes through a facade that is a no-op when PostHog env is unset, and every event is checked against a typed allow-list

### Repo workflow & CI (CI)

- [ ] **CI-01**: The repo has `.coderabbit.yaml` (schema v2, chill profile, summary on, poem off).
  - Path filters exclude lockfiles, fixtures, migration snapshots and screenshots.
  - The specified path instructions cover sellers, pricing, agent and `**/*`.
- [ ] **CI-02**: A PR template asks for a description, test evidence and a "fixtures sanitised" checkbox
- [ ] **CI-03**: PR CI runs on every PR:
  - ESLint, Prettier check, `tsc --noEmit` and Vitest unit tests.
  - Docker image build.
  - A migration check against a throwaway Postgres service.
  - A single always-reporting `ci-success` aggregator check.
- [ ] **CI-04**: CI enforces ≥ 90% coverage on `src/pricing`
- [ ] **CI-05**: A fixture sanitiser plus a CI secret/PII scan blocks committing personal data or tokens in fixtures
- [ ] **CI-06**: Renovate (or Dependabot) opens grouped dependency PRs, and the CI jobs that need secrets skip cleanly on them
- [ ] **CI-07**: The README documents the branch protection settings:
  - Protected `main`, with no direct pushes.
  - `ci-success` required.
  - Conversation resolution required.
  - 0 required approvals for a solo repo.
  - A break-glass procedure if CodeRabbit is down.

### True cost (COST)

- [ ] **COST-01**: A pure, unit-tested function calculates `trueCost = headline + bags + airportCosts + overnightHotel − best(cashback | code + reduced cashback)` in integer pence. It returns a stored breakdown with `calcVersion`
- [ ] **COST-02**: Airport costs are config per airport (e.g. BHX petrol £35 + parking £100; BRS bus £30)
- [ ] **COST-03**: An overnight hotel (default £90) is added only when the return lands between 00:30 and 05:00 local time **and** the drive home is over 45 minutes. Boundaries and midnight-crossing flights are tested
- [ ] **COST-04**: The calculator chooses the better of a code or cashback for each quote and records the pick.
  - A manually entered code cuts cashback to the seller's reduced rate (Jet2 → £5, easyJet holidays → 1%, On the Beach → 0).
  - Auto-applied discounts already in the headline price are not counted twice.
- [ ] **COST-05**: Bags, transfers and infant fees are tri-state (included / extra £ / unknown). Unknown is flagged in the breakdown and never counted as £0
- [ ] **COST-06**: A conservative true cost (excluding or using only the default cashback) is calculated alongside the full one. Alert thresholds use the conservative figure

### Seller scraping (SELL)

- [ ] **SELL-01**: Each seller is a Mastra tool wrapping a seller adapter (`planJobs`, then capture a page snapshot, then parse it into `Quote[]`). Adding a seller means one folder plus one registry line
- [ ] **SELL-02**: The Jet2holidays adapter returns quotes for every airport × date × room setup:
  - Occupancy is encoded as `r2c4_1` for one room and `r1c4r1c1` for two rooms.
  - BHX=98, BRS=118.
  - It reads `document.body.textContent`, including the hidden flight block.
  - It reaches `/options` for room upgrades and goes no further.
  - It handles "holiday no longer available".
- [ ] **SELL-03**: The TUI adapter screens with the calendar's per-person prices but stores only the click-through total, with rooms and flight times
- [ ] **SELL-04**: The On the Beach adapter:
  - keeps date ranges within one month;
  - applies the "Flight Stops = Direct" filter;
  - records the bag price.
- [ ] **SELL-05**: The easyJet holidays adapter (EGSS0063) returns quotes, with bags and transfers recorded as included where the page shows it
- [ ] **SELL-06**: Requests are throttled to one every 5–10 seconds per site with jitter, with a per-seller job cap per run. Calendars are used where a site has one
- [ ] **SELL-07**: Prices come from page text through a tool-less Claude extraction call with a schema-constrained output (Haiku 5.5 default, Sonnet 5.5 fallback, model configurable)
- [ ] **SELL-08**: Each extracted money figure must appear in the page text (evidence snippet) and pass zod plus sanity bounds. Otherwise the parse is rejected
- [ ] **SELL-09**: The page's echo of hotel, party, nights, date and airport is checked against the request. Mismatches are rejected
- [ ] **SELL-10**: Only direct flights are kept. A quote whose directness is unknown is treated as non-direct
- [ ] **SELL-11**: When a CAPTCHA or bot check is detected, the seller stops for the run.
  - The block is recorded as `blocked`, never as "sold out".
  - A cool-off is persisted.
  - The other sellers continue.
- [ ] **SELL-12**: Non-essential cookies are declined. Clicks go through a read-only allow-list (`safeClick`), and only search fields are ever filled
- [ ] **SELL-13**: Any failed parse saves a screenshot and the HTML/text snapshot as an artefact, which can be promoted to an eval fixture
- [ ] **SELL-14**: Every run is recorded (`run`, plus `seller_run` with ok / unavailable / blocked / parse_failed / error status and counts)

### Deals (DEAL)

- [ ] **DEAL-01**: A daily job checks TopCashback, Quidco, Blue Light Card, Student Beans, MSE and HotUKDeals for each seller. It extracts structured fields from the page text with Claude and upserts `deal` rows:
  - type, source, value (£ or %);
  - conditions and min spend;
  - expiry;
  - `stacks_with_cashback`;
  - new-customer-only, voided-by-code, cap;
  - `seen_at`.
- [ ] **DEAL-02**: Deal rows feed the true-cost calculator. Stale, expired or ineligible deals (e.g. Blue Light Card when not eligible) are excluded
- [ ] **DEAL-03**: Deal extraction treats page content as data, using the same tool-less extractor and evidence checks

### Agent workflow & scheduling (RUN)

- [ ] **RUN-01**: A Mastra workflow loads the active searches and fans out across enabled sellers, then over airport × date × room setup within each seller. It normalises results, drops non-direct quotes, calculates true cost and saves observations
- [ ] **RUN-02**: Price history gives the lowest-ever true cost per (seller, airport, date, room) and overall
- [ ] **RUN-03**: The scheduler runs at 07:45 and 19:45 Europe/London (DST-correct), with no overlapping runs and a catch-up after a missed run. Deals run daily before the morning price run
- [ ] **RUN-04**: Owner can trigger a manual run with `pnpm run once`

### Alerts (ALRT)

- [ ] **ALRT-01**: Owner gets an ntfy alert when the overall best true cost drops by ≥ £50 against the stored previous best
- [ ] **ALRT-02**: Owner gets an ntfy alert when a BRS option comes within £150 of the best BHX true cost
- [ ] **ALRT-03**: Owner gets an ntfy alert when a new deal worth £50 or more appears
- [ ] **ALRT-04**: Owner gets an ntfy alert when a deal that applies to the current best quote expires within 24 hours
- [ ] **ALRT-05**: The same alert reason for the same quote is never sent twice within 24 hours. Dedupe uses stable quote identity and claim-then-send status
- [ ] **ALRT-06**: Alerts are suppressed on the first-ever run and for sellers whose run is not ok. A big new low is re-scraped to confirm before alerting, and a per-run alert cap applies
- [ ] **ALRT-07**: Each alert shows seller, date, airport, room, true cost (per person and total), breakdown, the code/cashback pick, the previous best and a deep link. Raw page text is never included
- [ ] **ALRT-08**: Owner gets a daily digest of the top 5 options as a short text table, with the price age and the last successful run per seller
- [ ] **ALRT-09**: Owner gets a run-health alert when a seller is blocked or failing

### Evals (EVAL)

- [ ] **EVAL-01**: The eval harness (`@mastra/evals` inside Vitest) asserts thresholds so a regression fails CI. Each suite sends an `eval_run` PostHog event (suite, score, threshold, passed, git_sha, model) before asserting, and Mastra local storage is not relied on in CI
- [ ] **EVAL-02**: The true-cost eval has about 20 deterministic scenarios with exact expected £ values (BHX vs BRS, late landing, code vs cashback, multi-room, five people)
- [ ] **EVAL-03**: The extraction eval runs on sanitised real snapshots per seller in `evals/fixtures/<seller>/` with hand-labelled `expected.json`. It requires 100% on price, airport and direct, and ≥ 95% overall
- [ ] **EVAL-04**: The deals extraction eval runs on saved cashback/code pages and checks rate, min spend, expiry and the stacking flag
- [ ] **EVAL-05**: The alert-decision eval has about 20 history + deals scenarios. It allows zero missed must-alerts and at most 1 false alert per 20
- [ ] **EVAL-06**: The safety eval is a 100% hard gate. Fixture pages with injected instructions and booking buttons must never cause a non-read-only click or fill, and the page must be flagged
- [ ] **EVAL-07**: The evals CI job runs on PRs touching `src/agent/**`, `src/sellers/**`, `src/deals/**` or prompts, and nightly, using `ANTHROPIC_API_KEY` from secrets. Deterministic suites run on every PR, including forks

### Delivery & operations (OPS)

- [ ] **OPS-01**: On merge to `main`, the Docker image is pushed to GHCR, tagged with the git SHA and `latest`
- [ ] **OPS-02**: The deploy runs DB migrations as a separate guarded step before the new version starts, on the chosen target (home server/VPS or Fly.io/Railway)
- [ ] **OPS-03**: Owner can trigger a "run once now" job via `workflow_dispatch`
- [ ] **OPS-04**: A nightly live canary runs one real search per seller. On a parser failure or CAPTCHA it opens a deduped GitHub issue and sends an ntfy alert, and it never fails PRs
- [ ] **OPS-05**: OpenTelemetry is the single instrumentation layer. Mastra's built-in tracing exports over OTel, and spans go to PostHog via `PostHogSpanProcessor` (`@posthog/ai/otel`), with no second wrapper, so there is no double counting. LLM calls show as `$ai_generation` (cost, tokens, latency, model). There is one trace per search run with a `run_id` attribute, and the span tree is workflow run → seller → (airport, date, room) search → page load → extract → LLM call → true-cost → db write → alert
- [ ] **OPS-10**: Playwright steps (navigate, wait-for-price, read text, CAPTCHA check) get manual spans with attributes seller, url (query secrets stripped), status, duration and captcha_detected. Failed parses call `span.recordException` and set status ERROR. Span attributes never contain page HTML, prompts with page content or personal data, only sizes and hashes
- [ ] **OPS-11**: Owner can inspect traces locally through an optional `jaeger` compose service (profile `debug`), enabled by setting `OTEL_EXPORTER_OTLP_ENDPOINT`. With PostHog/OTel env unset, tracing is a no-op
- [ ] **OPS-06**: Custom PostHog events are emitted with a fixed `distinct_id` of `holiday-agent` and no personal data: `search_run_started`/`finished`, `quote_saved`, `scrape_failed`, `captcha_detected`, `deal_found`, `alert_sent`, `eval_run`
- [ ] **OPS-07**: PostHog dashboards show best true cost over time per seller and airport, scrape success rate, CAPTCHA rate, LLM cost per run and per month, and alerts sent
- [ ] **OPS-08**: PostHog alerts fire when seller success rate is under 80% over 24h and when LLM spend exceeds £X per day
- [ ] **OPS-09**: Uncaught exceptions are sent to PostHog error tracking. Model selection can be switched with a feature flag

### Documentation (DOC)

- [ ] **DOC-01**: The README covers:
  - setup;
  - how to add a search;
  - how to add a seller;
  - running evals;
  - PostHog setup and dashboards;
  - the responsible-use policy;
  - known limitations.

## v2 Requirements

- **V2-01**: A "DIY" seller combining flights-only and hotel-only options (e.g. Hotels.com + easyJet flights)
- **V2-02**: A Virgin Atlantic reward-seat watcher reusing the alert pipeline
- **V2-03**: A Next.js dashboard with price history charts
- **V2-04**: Percentile against history in alerts (needs weeks of data)
- **V2-05**: Display of deposit, balance date and ATOL details (fields stored in v1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Booking, sign-in, entering personal or payment details | Hard safety rule: the agent is read-only |
| CAPTCHA solving, proxies, fingerprint evasion | Personal, polite, low-volume use only |
| Price prediction | Untrustworthy at this data volume; history context instead |
| Treating cashback as a guaranteed price cut | Cashback pays out later and is often voided; conservative cost is used for thresholds |
| Urgency/scarcity text as an alert trigger | Manipulative page content, and an injection vector |
| Live sites in PR CI | Flaky and impolite; offline fixtures only |
| Multi-user / hosted service | Single-owner personal tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| FND-04 | Phase 1 | Pending |
| FND-05 | Phase 1 | Pending |
| FND-06 | Phase 1 | Pending |
| CI-01 | Phase 1 | Pending |
| CI-02 | Phase 1 | Pending |
| CI-03 | Phase 1 | Pending |
| CI-05 | Phase 1 | Pending |
| CI-06 | Phase 1 | Pending |
| CI-07 | Phase 1 | Pending |
| COST-01 | Phase 2 | Pending |
| COST-02 | Phase 2 | Pending |
| COST-03 | Phase 2 | Pending |
| COST-04 | Phase 2 | Pending |
| COST-05 | Phase 2 | Pending |
| COST-06 | Phase 2 | Pending |
| EVAL-01 | Phase 2 | Pending |
| EVAL-02 | Phase 2 | Pending |
| CI-04 | Phase 2 | Pending |
| SELL-01 | Phase 3 | Pending |
| SELL-02 | Phase 3 | Pending |
| SELL-06 | Phase 3 | Pending |
| SELL-07 | Phase 3 | Pending |
| SELL-08 | Phase 3 | Pending |
| SELL-09 | Phase 3 | Pending |
| SELL-10 | Phase 3 | Pending |
| SELL-11 | Phase 3 | Pending |
| SELL-12 | Phase 3 | Pending |
| SELL-13 | Phase 3 | Pending |
| SELL-14 | Phase 3 | Pending |
| RUN-01 | Phase 3 | Pending |
| RUN-02 | Phase 3 | Pending |
| RUN-04 | Phase 3 | Pending |
| EVAL-03 | Phase 3 | Pending |
| EVAL-07 | Phase 3 | Pending |
| OPS-05 | Phase 3 | Pending |
| OPS-06 | Phase 3 | Pending |
| OPS-10 | Phase 3 | Pending |
| OPS-11 | Phase 3 | Pending |
| DEAL-01 | Phase 4 | Pending |
| DEAL-02 | Phase 4 | Pending |
| DEAL-03 | Phase 4 | Pending |
| EVAL-04 | Phase 4 | Pending |
| SELL-03 | Phase 5 | Pending |
| SELL-04 | Phase 5 | Pending |
| SELL-05 | Phase 5 | Pending |
| ALRT-01 | Phase 6 | Pending |
| ALRT-02 | Phase 6 | Pending |
| ALRT-03 | Phase 6 | Pending |
| ALRT-04 | Phase 6 | Pending |
| ALRT-05 | Phase 6 | Pending |
| ALRT-06 | Phase 6 | Pending |
| ALRT-07 | Phase 6 | Pending |
| ALRT-08 | Phase 6 | Pending |
| ALRT-09 | Phase 6 | Pending |
| RUN-03 | Phase 6 | Pending |
| EVAL-05 | Phase 6 | Pending |
| EVAL-06 | Phase 6 | Pending |
| OPS-01 | Phase 7 | Pending |
| OPS-02 | Phase 7 | Pending |
| OPS-03 | Phase 7 | Pending |
| OPS-04 | Phase 7 | Pending |
| OPS-07 | Phase 7 | Pending |
| OPS-08 | Phase 7 | Pending |
| OPS-09 | Phase 7 | Pending |
| DOC-01 | Phase 8 | Pending |

**Coverage:** 68/68 v1 requirements mapped, no orphans, no duplicates.

---
*Requirements defined: 2026-11-26*
*Last updated: 2026-11-26 after initial definition*
