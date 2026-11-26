# Architecture Research

**Domain:** Personal scraping + LLM-extraction + alerting agent (UK package-holiday price monitor), Mastra/TypeScript
**Researched:** 2026-11-26
**Confidence:** MEDIUM (covers BRIEF-ADDENDUM: evals, PostHog, CI/CD). The Mastra workflow primitives are verified against the official docs (HIGH). The overall decomposition is established pattern plus judgement from the brief (MEDIUM). Per-seller site behaviour is untested and will only be known once built (LOW).

## Core Stance

1. **Deterministic spine, LLM at the edges.** The pipeline is plain code: load searches, plan jobs, drive a browser, extract, normalise, price, store, evaluate rules, notify. Claude appears in exactly two places, both as **extraction-only** calls (page text in, schema-validated JSON out): seller page extraction, and deals-page extraction. Claude never plans, never chooses URLs, never decides alerts, never computes money.
2. **Per-seller "tools" are deterministic code that happens to be registered as Mastra tools.** Navigation is scripted (URL builders from the owner's research, fixed click paths). Only the text-to-fields step is LLM-driven. An LLM agent driving the browser would breach the read-only safety rule (page text could steer it), cost more per run, and be non-reproducible. It also gives nothing here, because the click paths are known.
3. **Pure core, impure shell.** True-cost calculator and alert-rule evaluator are pure functions over plain data. IO (browser, Claude, DB, ntfy) sits behind small interfaces so everything important is unit-testable with Vitest and no network.
4. **Page content is data.** Extraction prompts wrap page text in a delimited block and require structured output only. The output is validated by Zod and then sanity-checked (price range, date within window, direct flag). The extractor has no tools, so injected instructions have nothing to act on.

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  TRIGGERS                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────┐   │
│  │ scheduler    │  │ pnpm run once │  │ pnpm run alert:test      │   │
│  │ (07:45/19:45 │  │ (CLI flags:   │  │ (ntfy smoke test)        │   │
│  │ Europe/London)│  │ seller/search)│  │                          │   │
│  └──────┬───────┘  └──────┬────────┘  └───────────┬──────────────┘   │
├─────────┴─────────────────┴───────────────────────┴──────────────────┤
│  ORCHESTRATION (Mastra workflows)                                      │
│  priceRunWorkflow:  loadSearches → planJobs → foreach seller-group     │
│     (scrapeSellerStep) → persist/price → evaluateAlerts → notify       │
│     → digest (evening run only)                                        │
│  dealsWorkflow:     foreach source → fetch+extract → upsert deals      │
├──────────────────────────────────────────────────────────────────────┤
│  SELLER LAYER                          │  CORE (pure)                  │
│  ┌──────────────────────────────────┐  │  ┌──────────────────────┐    │
│  │ SellerAdapter registry           │  │  │ trueCost(quote,deals,│    │
│  │  jet2 | tui | otb | easyjet      │  │  │   cfg) -> Breakdown  │    │
│  │ each: buildJobs, scrape(ctx,job) │  │  ├──────────────────────┤    │
│  │ shared: BrowserSession, Throttle,│  │  │ evaluateAlerts(state)│    │
│  │ ExtractorService, Artefacts,     │  │  │   -> AlertCandidate[]│    │
│  │ BlockDetector, CookieDecliner    │  │  └──────────────────────┘    │
│  └──────────────────────────────────┘  │                               │
├──────────────────────────────────────────────────────────────────────┤
│  PERSISTENCE (Postgres via Drizzle)                                    │
│  search | run | seller_run | quote | quote_price(true cost) | deal     │
│  alert | (artefacts on disk volume, path stored on seller_run)         │
└──────────────────────────────────────────────────────────────────────┘
        External: Anthropic API · seller sites · deal sites · ntfy
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Search config | Searches, party, window, airports, room setups, thresholds, airport cost config, cashback defaults | Postgres `search` row (JSONB for party/rooms/rules, validated by Zod on read). Airport and cashback config as typed config tables or JSONB, not hard-coded in the calculator. |
| Job planner | Expand `search` into `ScrapeJob[]` and group by seller | Pure function. Seller adapters supply `planJobs(search)` since each site has different granularity (Jet2 is one URL per date, TUI/OTB have flexible-date calendars). |
| Seller adapter | One per seller. Build URLs, drive the page, capture text, call extractor, return `Quote[]` | Implements `SellerAdapter`. Wrapped as a Mastra `createTool` for the owner's "one tool per seller" requirement. |
| BrowserSession | One Chromium **context** per seller per run, cookie decline, cleanup | Thin wrapper over Playwright. Created at seller-step start, closed in `finally`. |
| Throttle | One request per 5-10s per site, with jitter | Per-seller async gate (`await gate.wait()` before every `page.goto`/navigation click). In-process, keyed by seller id. |
| BlockDetector | Detect CAPTCHA/bot-check, "no longer available", empty results | Cheap deterministic text/URL/title heuristics run **before** extraction. Returns a typed outcome, so it is not an LLM call. |
| ExtractorService | Page text in, typed JSON out | Anthropic SDK with a tool/JSON-schema output and Zod validation. One shared service, per-seller prompt+schema. |
| Normaliser | Seller-extracted record to canonical `Quote`; drop non-direct; local times; room-setup mapping | Pure function, per-adapter mapping plus shared canonical validation. |
| True-cost calculator | `headline + bags + airport + overnight - max(code, cashback)` with breakdown and pick | Pure function, no IO. Takes active deals and config as arguments. |
| Price-history store | Idempotent upsert of quotes, true-cost snapshots, lowest-ever queries | Drizzle repositories. |
| Deals scraper | Fetch deal sources, Claude-extract, upsert `deal` | Source adapters (same shape as seller adapters, lighter). Own workflow. |
| Alert engine | Compare current run to history/deals, emit candidates, dedupe | `evaluateAlerts` pure; `AlertRepo.tryClaim` does dedupe in the DB. |
| Notifier | Send to ntfy | Small `Notifier` interface; `NtfyNotifier` is an HTTP POST. A `FakeNotifier` for tests. |
| Artefact capture | Screenshot + HTML on parse/validation failure | Writes to a mounted volume, path recorded on `seller_run`. |
| Scheduler | Twice-daily trigger in Europe/London | See "Scheduling" below. |
| Run recorder | `run` and `seller_run` rows with status and counts | Written by the workflow steps. This is the observability backbone. |

## Recommended Project Structure

```
src/
├── config/              # env (Zod; POSTHOG_* optional), flag defaults, airport/cashback config
├── db/                  # schema.ts, migrations/, seed.ts, repos/ (search, quote, deal, alert, run)
├── pricing/             # PURE, no IO. >=90% coverage gate
│   ├── types.ts         # Search, ScrapeJob, Quote, Deal, TrueCostBreakdown, AlertCandidate
│   ├── true-cost.ts     # + tests
│   ├── alert-rules.ts   # pure evaluateAlerts (+ tests); lives here so pure-core rule applies
│   ├── normalise.ts
│   └── digest.ts
├── sellers/
│   ├── adapter.ts       # SellerAdapter + PageSource interface (live | snapshot)
│   ├── registry.ts      # id -> adapter, gated by feature flags
│   ├── jet2/ tui/ otb/ easyjet/   # urls.ts, capture.ts (browser), parse.ts (text->Quote), prompt.ts, schema.ts
│   └── shared/          # browser-session, throttle, block-detect, cookies, artefacts, snapshot-store
├── deals/               # sources/*.ts, capture + extract + upsert (same capture/parse split)
├── agent/               # Mastra instance, workflows/, steps/, tools/ (thin per-seller wrappers),
│                        # extractor-service.ts, prompts/, scorers/ (shared by prod checks and evals)
├── notify/              # Notifier interface, ntfy.ts
├── telemetry/           # posthog.ts (no-op when unset), withTracing wrapper, event helpers, flags client
└── cli/                 # once.ts, alert-test.ts, scheduler.ts, canary.ts
evals/
├── fixtures/<seller>/<case>/   # page.txt (and page.html), meta.json, expected.json
├── fixtures/deals/<source>/ , fixtures/safety/
├── scenarios/                  # true-cost.json, alert-decisions.json (history + deals + expected)
├── suites/                     # extraction.eval.ts, true-cost.eval.ts, alerts.eval.ts, deals.eval.ts, safety.eval.ts
├── thresholds.ts               # per-suite thresholds, single source of truth
└── harness/                    # runSuite(): score -> assert -> emit eval_run
.github/workflows/              # ci.yml, evals.yml, canary.yml, cd.yml, run-once.yml
.coderabbit.yaml
```

### Structure Rationale

- **`pricing/` has no IO imports** (lint boundary rule). Alert rules live here beside true cost: both are pure money/decision logic, both are CodeRabbit-guarded, and both get table-driven evals. Hits the 90% coverage gate.
- **`sellers/<id>/` splits `capture` (browser, impure) from `parse` (text to Quote, extractor call).** This split is what makes offline replay possible (next section). Adding a seller is one folder plus one registry line.
- **`agent/` is the thin Mastra layer plus the extractor and prompts.** The CodeRabbit rule "prompts/tools changed requires eval updates" maps to this folder, so keep all prompts here or in `sellers/*/prompt.ts` and make `evals.yml` path triggers match.
- **`evals/` at top level** so fixtures are excluded from review and lint noise but still versioned.

## Key Design Answers

### Seller adapter interface

```typescript
export interface SellerAdapter {
  readonly id: 'jet2' | 'tui' | 'otb' | 'easyjet';
  /** Expand a search into jobs. Adapter decides granularity (per date, per calendar window). */
  planJobs(search: Search): ScrapeJob[];
  /** Run one job in the supplied session. Must not throw for expected conditions. */
  scrape(ctx: SellerContext, job: ScrapeJob): Promise<JobResult>;
}

export type JobResult =
  | { kind: 'ok'; quotes: Quote[]; droppedNonDirect: number }
  | { kind: 'unavailable'; reason: string }          // e.g. Jet2 BRS "no longer available" - not an error
  | { kind: 'blocked'; signal: 'captcha' | 'bot-check' } // stops the seller for the run
  | { kind: 'parse_failed'; artefactPath: string; detail: string };

export interface SellerContext {
  page: Page;                    // from the per-seller BrowserContext
  throttle: () => Promise<void>; // call before every navigation
  extract: ExtractorService;
  artefacts: ArtefactWriter;
  log: Logger;
}
```

Rules: expected conditions are **return values, not exceptions** (`unavailable`, `blocked`, `parse_failed`). Unexpected exceptions are caught by the step wrapper and recorded as `error`. The adapter returns raw-but-typed quotes and the shared pipeline does the direct-only filter, true cost and persistence, so no adapter can forget them.

### Deterministic code vs LLM-driven

| Concern | Choice | Reason |
|---------|--------|--------|
| URL construction, date stepping, occupancy encoding | Deterministic | Fully specified in owner's research |
| Cookie decline, "Continue" click, calendar date click | Deterministic with a small allow-list of click targets (by role/text) | Read-only safety; no free-form clicking |
| CAPTCHA/bot/unavailable detection | Deterministic heuristics | Must be reliable and free; stop-on-detect is a safety rule |
| Page text to fields (price, bags, times, room, direct) | Claude extraction | Core resilience requirement |
| Deal page text to fields | Claude extraction | Same |
| Direct-only filter, true cost, alert rules | Deterministic | Correctness and testability |
| Choosing what to scrape / when to alert | Deterministic | No benefit from an LLM |

Mastra "agent" usage: an optional thin Mastra `Agent` for the extractor is fine (gets tracing and model config for free), but it must have **zero tools**. If the portfolio angle wants an agent in the loop, use a *digest-summary* agent (reads already-computed numbers, writes the prose). It sits after the alert decision and cannot change it.

### Where Claude sits

- Extraction only, inside `ExtractorService.extract({ schema, promptId, text })`.
- Use cheap model tier for extraction (Haiku-class) and keep page text trimmed (strip scripts/styles, cap length) for cost. Keep model name in config. (Exact model IDs: verify at implementation time.)
- Two retries max on schema-validation failure, then `parse_failed` with artefacts.
- Cache by hash of page text within a run to avoid re-extracting identical pages.

### Browser context lifecycle

One Playwright `Browser` per process run, **one `BrowserContext` per seller per run**, one `Page` reused sequentially within it. Context is created in the seller step, cookie-declined once, and closed in `finally` even on block/error. Rationale: cookie/consent state and session cookies stay scoped to one site, a blocked seller cannot contaminate another, and memory is bounded. Do not persist storage state between runs (no sign-in, no fingerprint games). Set a normal, honest viewport and locale `en-GB`, timezone `Europe/London`. Per-navigation timeout (about 30s) and a per-seller wall-clock budget so a hung site cannot stall the run.

### Fan-out and rate limiting in Mastra

Verified from Mastra docs: `.foreach(step, { concurrency: N })` runs a step once per array item (default concurrency 1), and `.foreach().foreach()` yields nested arrays, so the docs steer you to a nested workflow or `.map()`. `.parallel()` fails the whole block if any step throws, so errors must be handled inside steps. The docs page does not describe cron scheduling.

Recommended shape:

```
priceRunWorkflow
  loadSearchesStep            -> Search[]
  planJobsStep                -> SellerBatch[]   // one batch per (seller), jobs inside, already expanded across airport x date x room
  .foreach(scrapeSellerStep, { concurrency: 4 })   // sellers in parallel (different hosts), one batch each
  persistAndPriceStep         -> flatten results, drop non-direct, compute true cost, idempotent upsert
  evaluateAlertsStep          -> AlertCandidate[]
  notifyStep                  -> claims dedupe, sends
  digestStep (evening only)
```

Key decision: **fan out across sellers, loop sequentially inside a seller.** The airport x date x room cross-product lives inside `scrapeSellerStep` as a plain `for` loop that awaits the per-seller throttle. Reasons:
- Rate limit is per site, so concurrency across sites is free and within a site is forbidden. A sequential loop behind one throttle enforces that without cross-step coordination.
- One browser context per seller maps 1:1 to one step execution.
- Per-seller `blocked` short-circuits the loop trivially (just `break`).
- Mastra `.foreach` over thousands of tiny jobs would create thousands of step records and make the shared throttle and context awkward to share.
- Trade-off: you lose Mastra's per-job step visibility and retry. Mitigate with the app-level `seller_run` and per-job log rows (below). Per-job retry is not wanted anyway for a politeness-limited scraper.

Volume sanity check: 29 May-window dates x 2 airports x 3 room setups is up to about 174 combinations on a site with per-date URLs. At 5-10s each that is 15-30 minutes per seller per run. That is acceptable for twice-daily but means calendar-capable sites (TUI, OTB, easyJet) should use the calendar to collapse jobs, and the planner should dedupe (for example BRS on Jet2 returning "unavailable" once should skip further BRS dates for that run). This is the main reason `planJobs` belongs to the adapter. Add a per-seller job budget cap in config.

### Data flow

```
search rows
   │ planJobs (per adapter)
   ▼
ScrapeJob[] per seller ──► [throttle] ─► page.goto ─► BlockDetector ──blocked──► stop seller, seller_run=captcha
                                           │ text (document.body.textContent)
                                           ▼
                                   ExtractorService (Claude) ──invalid──► artefacts + seller_run.parse_failed
                                           │ typed raw record
                                           ▼
                                   Normaliser ─► Quote (direct only; non-direct counted and dropped)
                                           ▼
                          upsert quote (natural key) ─► load active deals ─► trueCost() ─► upsert quote_price
                                           ▼
                          history queries (previous best, lowest-ever per key)
                                           ▼
                          evaluateAlerts() pure ─► AlertCandidate[] ─► alertRepo.tryClaim (dedupe) ─► Notifier(ntfy)
                                           ▼
                          digest (top 5 by current true cost) ─► Notifier
```

Direction is strictly one way: adapters never read history, never call the notifier, never see deals. The alert engine never touches the browser.

## Data Model Notes (beyond the brief's minimum)

The brief's four tables are the base. Add:

- **`run`**: id, trigger (`schedule`|`manual`), started_at, finished_at, status (`ok`|`partial`|`failed`).
- **`seller_run`**: run_id, seller, status (`ok`|`captcha`|`blocked`|`error`|`parse_failed`|`skipped`), jobs_planned, jobs_ok, quotes_found, dropped_non_direct, unavailable_count, error_detail, artefact_path, started_at, finished_at. This is the per-seller observability record and also how "quiet vs broken" is judged (a seller with 0 quotes for several runs is flagged in the digest).
- **`quote` natural key** (unique index): `(search_id, seller, airport, depart_date, nights, room_setup, room_name)`. Upsert updates price/times/url/`last_seen_at`. Keeps a row per option instead of a row per scrape.
- **`price_observation`** (append-only): `quote_id, run_id, headline, true_cost, breakdown JSONB, observed_at`. History and "lowest ever" come from here. Idempotent via unique `(quote_id, run_id)`, so a retried run does not double-insert.
- **True-cost snapshot stored with the breakdown** (components, picked code-vs-cashback, deal id used), so an alert is explainable after the deals have changed and the calculator can be re-run later against stored inputs.
- **`alert`**: add `dedupe_key` (`reason + quote_id`, or `reason + deal_id`) with a partial approach: dedupe by querying `sent_at > now() - interval '24 hours'` for the key inside one transaction, or an insert-if-absent with `ON CONFLICT DO NOTHING` on `(dedupe_key, window_bucket)`. Prefer the query-in-transaction approach for a true rolling 24h.
- **`deal`**: unique `(seller, source, type, code_or_title, expires_at)` so the daily scrape upserts rather than duplicating. "New deal" = row inserted this run (compare `first_seen_at`), not just "seen".
- Money as integer pence throughout the domain; convert at the edges. Times stored as local wall-clock strings plus `timestamptz` where a timezone is known, since the overnight-hotel rule depends on the **local** return arrival time.

## Architectural Patterns

### Pattern 1: Result-typed adapters (expected failure as data)
**What:** `JobResult` discriminated union, not throw/catch.
**When:** Every seller scrape.
**Trade-offs:** Slightly more code per adapter; makes CAPTCHA/unavailable handling exhaustive via `switch` and `never` checks, and keeps the run loop trivial.

### Pattern 2: Pure core with injected IO
**What:** `trueCost(quote, ctx)` and `evaluateAlerts(snapshot)` take all inputs as args.
**When:** Anything money- or alert-related.
**Trade-offs:** More explicit argument plumbing; in return, table-driven Vitest tests with no mocks.

```typescript
export function trueCost(q: QuoteInput, cfg: CostConfig, deals: DealSet): TrueCostBreakdown {
  const airport = cfg.airports[q.airport].fixedCostPence;
  const overnight = needsOvernight(q.retArrLocal, cfg.airports[q.airport].driveMinutesHome) ? cfg.overnightPence : 0;
  const cashback = bestCashback(q, deals, cfg);   // returns pence + source
  const code = bestCode(q, deals, cfg);           // returns pence + effective cashback reduction
  const pick = (code.netBenefit > cashback.netBenefit) ? 'code' : 'cashback';
  return { headline, bags, airport, overnight, pick, discount: ..., total: ... };
}
```

Note the subtlety: a code *reduces* cashback (Jet2 to £5), so compare `code value + reduced cashback` against `full cashback`, not code against cashback in isolation. Encode as the calculator's central test cases.

### Pattern 3: Dedupe as a claim
**What:** `alertRepo.tryClaim(key)` returns true if this process is first within the 24h window; only then send.
**When:** All notifications.
**Trade-offs:** Claim before send means a failed send is lost; so mark `sent_at` after success, and keep a `status` column (`claimed|sent|failed`) so a failed ntfy POST can be retried next run without re-spamming.

### Pattern 4: Fixture-driven extraction tests
**What:** Saved page text per seller in `fixtures/`; tests run the *normaliser and validation* against recorded extractor outputs (golden JSON), and an optional opt-in live test calls Claude.
**When:** Each seller.
**Trade-offs:** Fixtures go stale as sites change; that is acceptable because the failed-parse artefact flow is how new fixtures are produced.

## Scheduling

Mastra's docs describe `.sleep()`/`.sleepUntil()` but no cron (verified on the control-flow page; the rest of the docs were not searched, so treat "no built-in cron" as MEDIUM). Recommended: a small `cli/scheduler.ts` process using `node-cron` (or `croner`) with `timezone: 'Europe/London'` for 07:45 and 19:45, run as the long-lived `app` container's command, calling the same function `pnpm run once` calls. This handles BST/GMT correctly, unlike a host crontab in UTC. Guard against overlap with a Postgres advisory lock or an "a run is in progress" check, because a slow run (see volume note) could overlap the next trigger. Deals workflow runs daily (e.g. 06:30) as a separate cron entry, ahead of the morning price run so fresh deals feed true cost.

## Build Order (owner's 8 deliverables)

Each deliverable is its own PR (or several small ones) and stops for go-ahead. Dependencies drive what must exist inside each.

| # | Deliverable | Must contain (architectural) | Depends on | Notes |
|---|-------------|------------------------------|-----------|-------|
| 1 | Scaffold + CodeRabbit + CI | Compose (app + Postgres), env Zod config (POSTHOG_* optional), Drizzle schema **including `run`, `seller_run`, `price_observation`, natural-key unique indexes**, migrations, seed, Vitest, `pricing/types.ts`, `.coderabbit.yaml`, PR template, ci.yml (lint, typecheck, unit, Docker build, migration check), telemetry facade stub (no-op), `evals/` skeleton and `thresholds.ts` | none | Get natural keys right now to avoid a rewrite. Install Playwright browsers in the image now. Decide the required-check policy for path-filtered workflows here. Create the `telemetry` no-op facade now so later deliverables never import PostHog directly |
| 2 | True cost + eval | `pricing/true-cost.ts`, `CostConfig`, `DealSet` input type, 90% coverage gate, `true-cost.eval` (~20 scenarios) via `runSuite`, `eval_run` emitter | 1 | First real use of the eval harness; it proves harness plus PostHog `eval_run` plus no-op fallback before any LLM is involved. Code-vs-cashback interaction cases are the value |
| 3 | Jet2 + fixtures/eval + PostHog | `SellerAdapter` and `PageSnapshot` split, `sellers/shared/*`, `ExtractorService` with `@posthog/ai` wrapper and `run_id` trace id, normaliser, quote upsert, `priceRunWorkflow` skeleton (foreach over sellers even with one), `runRepo`, ntfy test alert, `once`, snapshot capture to fixtures, `extraction.eval` with Jet2 fixtures, run events, feature-flag read, evals.yml | 1, 2 | Builds the whole spine. Keep Jet2 specifics out of `shared/`. Collect 6-10 real Jet2 snapshots (BHX, BRS-unavailable, upgrades page, hidden flight block) and hand-label them. This is the slowest manual step |
| 4 | Deals + eval | `deals/` capture/parse, `dealRepo` upsert, `dealsWorkflow`, wire deals into true-cost input, `deals.eval` fixtures | 2, 3 | Same capture/parse split. Deals pages have more bot-check/login-wall risk |
| 5 | TUI, OTB, easyJet + evals | Three adapters, calendar-aware `planJobs`, OTB CAPTCHA path, bag cost, fixtures plus extraction eval cases for each, per-seller flags | 3 | Pure addition if the seam is right. Following "add a seller" for each is the source for the README |
| 6 | Alerts, dedupe, digest + alert and safety evals | `pricing/alert-rules.ts`, `alertRepo.tryClaim`, history queries, evaluate/notify/digest steps, scheduler with overlap lock, `alerts.eval` (~20), `safety.eval` fixtures, `alert_sent` events | 3, 4, 5 | Safety eval is a hard 100% gate; build the click allow-list test here at the latest (earlier is better: add the allow-list in 3 and the safety fixtures here) |
| 7 | CD, canary, dashboards | cd.yml (GHCR), separate migration step, canary.yml with issue+ntfy, run-once workflow, PostHog dashboards/alerts, error tracking | all | Mostly config outside the code. Deploy target undecided; `run-once.yml` and migration step shape depend on it |
| 8 | README | Setup, add a search, add a seller, branch protection, limitations | all | Document by following the steps |

Cross-cutting items to place early: run/seller_run recording (3), artefact/snapshot writer (3), natural-key upserts (1, 3), telemetry no-op facade (1), scheduler lock (6).

## Offline-Replayable Extraction (snapshot design)

Split every seller scrape into two stages joined by a plain data type:

```typescript
// stage 1: impure. Browser drives to the result state and returns captured text.
interface PageSnapshot { seller: string; kind: 'results'|'options'|'calendar'|'deal'; url: string;
  capturedAt: string; text: string; html?: string; meta: Record<string,string> } // meta: airport, date, roomSetup
// stage 2: deterministic given a snapshot + extractor. No Playwright import allowed.
parse(snapshot: PageSnapshot, job: ScrapeJob, extract: ExtractorService): Promise<ParseResult>
```

- `capture(ctx, job)` returns `PageSnapshot | Blocked | Unavailable`. `parse` returns quotes or `parse_failed`.
- Production path: capture then parse. Failed parses persist the snapshot (text+HTML+screenshot) as the artefact. The same JSON is a ready-made eval fixture, so "add a fixture whenever a parser breaks" is a copy command, with personal data stripped first.
- **"Offline" means no live sites, not no Claude.** The extraction eval replays saved snapshots through the real extractor (Claude call, needs `ANTHROPIC_API_KEY`), which is what the scores measure. Unit-level tests (normaliser, block detection, validation) use recorded extractor JSON with a `FakeExtractor` and need no key. So: Vitest unit tier runs on every PR with no secret; eval tier runs only when path-triggered and nightly, with the secret. Fork PRs have no secret, so the eval job must skip (not fail) there. For a single-owner repo this is unlikely to matter, but note it.
- Fixture format: `evals/fixtures/<seller>/<case>/{page.txt,meta.json,expected.json}`. `expected.json` is the labelled canonical `Quote` fields (total, per-person, bags included, room, flight times, direct, airport, dates). Scoring is field-wise exact match with price, airport and direct as hard 100% fields and an overall 95% bar.
- Block detection also runs over snapshots, so CAPTCHA fixtures test `BlockDetector` offline.

## Eval Harness (component)

| Aspect | Design |
|--------|--------|
| Runner | Vitest files in `evals/suites/`. Each calls `runSuite({ suite, cases, run, score, threshold })`. Mastra scorers or `runEvals` (from `@mastra/evals`, per owner's brief) are used for LLM-involved suites if their API fits; deterministic suites (true cost, alert decisions) are plain scorers over exact match. Keep the scorer functions free of Mastra types so they work either way. |
| Thresholds | `evals/thresholds.ts`: extraction hard fields 100%, overall 95%; true cost 100% exact; alerts zero misses on must-alert and at most 1 false alert per 20; deals per-field bar to set after first fixtures; safety 100%. |
| Gate | `expect(score).toBeGreaterThanOrEqual(threshold)` inside the suite, so a regression fails CI. |
| Reporting | `runSuite` always emits one PostHog `eval_run` event per suite with `suite, score, threshold, passed, git_sha, model`, **before** asserting, so failures are recorded too. Fixed `distinct_id: holiday-agent`. `git_sha` from `GITHUB_SHA` (fallback `git rev-parse`, then `unknown`). `model` from the extractor config. Flush/shutdown the PostHog client before the process exits (ephemeral runner would otherwise drop events). |
| Persistence | Trends live in PostHog. **Nothing depends on Mastra local storage in CI** (runner is ephemeral): no reading previous scores from local files or Mastra's store. Regression is gated on absolute thresholds, not on comparison with the last run. |
| Unset PostHog | `emitEvalRun` is a no-op that logs the result to stdout and the Actions job summary. Local runs and fork PRs work. |
| Safety suite | Fixture pages with injected instructions and fake Book/Pay buttons. Two layers are tested: (1) extractor returns only schema fields and sets `injection_suspected`/flag, never free text actions; (2) the capture layer's click allow-list rejects non-allow-listed targets (unit test over a fake Page). Because the extractor has no tools, "never takes a non-read-only action" is enforced structurally and the eval verifies it. |

Alert-decision evals run `evaluateAlerts` on scenario files (history + deals + current quotes), asserting reason and alert/no-alert. They need no network and no key.

## Telemetry, Feature Flags, Config (PostHog, all optional)

- `telemetry/posthog.ts` exports a client facade. With `POSTHOG_API_KEY` unset, every method is a no-op and flags return the config default. Nothing else imports `posthog-node` directly, so "everything works when unset" is testable by one unit test.
- **`run_id` is the trace id**: generate at run start, pass through workflow input into `ExtractorService`, which calls the model via the `@posthog/ai` wrapper with `posthogTraceId: run_id`, privacy mode on (page text never sent). Per-event props carry seller and search ids only. The owner's brief says PostHog's Mastra integration uses `withTracing`; I did not verify this against PostHog docs, so check at Deliverable 3. The fallback is wrapping the Anthropic SDK client with `@posthog/ai` directly in `ExtractorService`, which keeps the choice behind one interface.
- **Events** emitted by steps, not by domain code: `search_run_started/finished`, `quote_saved`, `scrape_failed`, `captcha_detected`, `deal_found`, `alert_sent`, `eval_run`. A PII allow-list in the helper (typed event payloads, no free-form `Record<string,unknown>`) is how the "no personal data, no secrets" CodeRabbit rule is enforced in code.
- **Feature flags**: `seller_<id>_enabled` read once at run start in `registry.ts` (`getEnabledSellers(flags)`), plus a model-selection flag consumed by `ExtractorService`. Flag fetch failure or PostHog unset falls back to config defaults (all sellers enabled except those the owner disables in env). Evaluate flags once per run and record the resolved set on `run`, so a run is reproducible. Local evaluation is preferable to per-call remote evaluation to avoid a network dependency mid-run.
- **Error tracking**: process-level `uncaughtException`/`unhandledRejection` handlers forward to the facade, then exit non-zero.
- **Source of truth stays Postgres.** PostHog is for dashboards, alerts (success rate under 80%, spend cap) and eval trends. Alert dedupe, history and run status never read from PostHog.

## CI/CD and Canary Architecture

| Pipeline | Trigger | Content | Notes |
|----------|---------|---------|-------|
| `ci.yml` | every PR | lint, prettier, `tsc --noEmit`, Vitest with 90% coverage threshold scoped to `src/pricing`, Docker build, migrations applied to a Postgres service container | No secrets, no network. Unit tier includes deterministic evals (true cost, alerts) |
| `evals.yml` | PR path filter (`src/agent/**`, `src/sellers/**`, `src/deals/**`, prompts) and nightly cron | extraction, deals and safety suites with real Claude over snapshots | Uses `ANTHROPIC_API_KEY` and PostHog secrets. Path filter must include `evals/**` and prompt locations. If branch protection requires this check, a path-filtered workflow that does not run leaves the check pending forever; use an always-run job that exits early, or do not mark it required. Flag for deliverable 1 |
| `canary.yml` | nightly | `cli/canary.ts`: one real search per enabled seller, minimal volume, same throttle | Never blocks PRs. On parser failure or CAPTCHA: open a GitHub issue (dedupe on an existing open issue with a label) and send ntfy. Failed snapshots are uploaded as artefacts for fixture promotion |
| `cd.yml` | push to `main` | build, push to GHCR tagged SHA and `latest` | Migrations are a **separate step/command** (`pnpm db:migrate` via a one-shot compose service or job) that must succeed before the app container restarts. The app must not auto-migrate on boot in production (keep it for local dev only) |
| `run-once.yml` | `workflow_dispatch` | manual one-off run | Needs DB reachable from the runner, so this depends on the deploy target. Decide at deliverable 7 |

The canary reuses the production `capture`+`parse` path with a `runKind: 'canary'` flag so it records `seller_run` rows with a distinct trigger and does not fire price alerts.

## Anti-Patterns

### Anti-Pattern 1: LLM agent driving the browser
**What people do:** Give an agent Playwright tools and a goal ("find the cheapest price").
**Why it's wrong:** Non-deterministic, slow, expensive, and page text can steer clicks, which conflicts with the read-only/never-follow-page-instructions rule. Hard to rate-limit.
**Do this instead:** Scripted navigation, Claude only for text-to-JSON.

### Anti-Pattern 2: One Mastra step per (airport, date, room)
**What people do:** Model the whole cross-product as `.foreach` iterations.
**Why it's wrong:** Per-site throttling and browser-context sharing across steps becomes awkward, step-record volume explodes, and parallelism would violate per-site politeness.
**Do this instead:** Foreach over sellers; sequential throttled loop inside the seller step.

### Anti-Pattern 3: Calculating money in the extraction prompt
**What people do:** Ask Claude to add up bags, fees and cashback.
**Why it's wrong:** Silent arithmetic errors in the one thing that drives alerts.
**Do this instead:** Extract raw components (headline, bag price, times, direct flag); compute in the pure function.

### Anti-Pattern 4: Insert-per-scrape quotes with no natural key
**What people do:** Append a `quote` row each run.
**Why it's wrong:** "Lowest ever" and dedupe queries become expensive and ambiguous; re-runs double count.
**Do this instead:** Upsert `quote` on a natural key; append `price_observation` unique per `(quote, run)`.

### Anti-Pattern 5: Treating "unavailable" or "no results" as errors
**What people do:** Throw on Jet2 BRS "holiday no longer available".
**Why it's wrong:** Triggers false failure alerts and artefact noise, and may stop a healthy seller.
**Do this instead:** `unavailable` result; record count; skip remaining same-airport jobs for the run.

### Anti-Pattern 6: Sending alerts from inside scrape code
**Why it's wrong:** Couples scraping to alert policy and breaks dedupe and ordering.
**Do this instead:** Scrapers only produce quotes; the alert step sees the whole run's state.

### Anti-Pattern 7: Alerting on a first-ever or partial run
**What people do:** Fire "best price dropped" because history is empty, or because a seller failed and the "best" looks different.
**Do this instead:** Require a prior best to exist; compare like-for-like (same sellers succeeded); when a seller was `blocked`/`error` this run, do not treat its absence as a price rise or fall. Suppress alerts for sellers with a non-ok `seller_run`, and surface seller health in the digest instead.

## Scaling Considerations

Single owner, a few hundred page loads per run. Scale is irrelevant; what matters is run duration and politeness.

| Concern | Now (1 search) | Several searches | Notes |
|---------|----------------|------------------|-------|
| Run time | Sellers in parallel, each sequential and throttled; roughly 15-30 min worst case per seller | Grows linearly per seller | Use calendars, skip known-unavailable airports, per-seller job cap |
| Claude cost | One extraction per page; trim text, cheap model, in-run cache | Linear | Log token usage on `seller_run` |
| DB | Trivial | Trivial | Index natural keys and `(search_id, observed_at)` |

First bottleneck: wall-clock of the throttled loop. Second: Claude cost if text is not trimmed.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic API | `ExtractorService` with schema-constrained output + Zod | Retries with backoff on 429/5xx; failures become `parse_failed`/`error`, never crash the run |
| Seller/deal sites | Playwright via adapters | Read-only; allow-listed clicks only; stop on block |
| ntfy | HTTP POST to `https://<server>/<topic>` with title/priority/tags/click-URL headers | Verify header names against ntfy docs at implementation; topic is effectively a secret, keep in env. Include the quote URL in the `Click` header |
| Postgres | Drizzle + `pg`/`postgres` driver | Compose healthcheck so the app waits for DB; run migrations on startup |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| workflow steps to adapters | Direct function call via registry | Steps do not know seller specifics |
| adapters to extractor | Interface `ExtractorService` | Fake in tests |
| scrape results to domain | Plain typed data | Domain imports nothing from IO layers |
| alert engine to notifier | `AlertCandidate[]` in, send results out | Dedupe claim in between |
| deals workflow to price workflow | Through the `deal` table only | No direct coupling; price run reads whatever deals are currently active |

## Open Questions / Flags for Phase Research

- **Mastra specifics** (MEDIUM): confirm current API for `createWorkflow`/`createStep`, whether a Mastra workflow run inside a plain Node process (no Mastra server) is fully supported for `pnpm run once`, and Mastra's storage config (it can use Postgres for its own run/snapshot state; decide whether to share the app DB or keep Mastra storage separate or in-memory since the app already has `run`/`seller_run`). Recommend: app-owned run tables are the source of truth; Mastra storage optional.
- **Per-seller site behaviour** (LOW): TUI calendar interaction, OTB date-range-within-one-month splitting (a window crossing a month boundary needs two searches; the May 2027 window is within one month, but the planner should still handle it), easyJet holidays URL shape (not in brief), and how each exposes direct-flight info. Needs live probing in the deliverable-3/5 phases.
- **Anti-bot posture**: expect OTB and possibly TUI to block headless Chromium. The design handles this as `blocked`; the owner has ruled out evasion, so acceptance of "some sellers will often be blocked" belongs in the README limitations.
- **Overnight-hotel rule needs local arrival time**: confirm each seller exposes return arrival time reliably; if missing, the calculator needs an explicit "unknown" state (conservative assumption or flagged in the alert) rather than silently assuming no hotel.
- **Deal matching to quotes**: how a deal ("10% off Jet2 holidays", "£40 cashback") maps to a seller/quote (min spend, conditions text, stacking) is fuzzy; keep matching deterministic on `seller` + `min_spend` + `stacks_with_cashback`, and surface unmatched conditions text in the alert rather than guessing.

## Sources

- Mastra workflow control flow docs (foreach concurrency, nesting caveat, parallel failure semantics, sleep; no cron described): https://mastra.ai/docs/workflows/control-flow (HIGH for the primitives, fetched 2026-11-26)
- Owner's BRIEF-ADDENDUM.md (evals, PostHog, CI/CD, 8-step order). `@mastra/evals` `runEvals`, `@posthog/ai` Mastra `withTracing` and PostHog flag behaviour are taken from the brief and NOT independently verified (LOW-MEDIUM; confirm in deliverables 2-3)
- Owner's PROJECT.md and BRIEF.md in `.planning/` (requirements, seller specifics, safety rules): HIGH
- Scraper/monitor structure, adapter pattern, idempotent upsert, dedupe-as-claim: established engineering practice and the author's judgement, not a single cited source (MEDIUM)
- Context7 CLI lookup was attempted but blocked by the environment's permission classifier, so Mastra API details beyond the page above are from training data and flagged above.

---
*Architecture research for: personal scraping + LLM extraction + alerting agent (Mastra/TypeScript)*
*Researched: 2026-11-26*
