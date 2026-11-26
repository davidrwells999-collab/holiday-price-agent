# Feature Landscape

**Domain:** Personal, read-only package-holiday price watcher (UK tour operators), true-cost calculation, deal/cashback awareness, ntfy alerts
**Researched:** 2026-11-26
**Confidence:** MEDIUM. Competitor feature sets (Google Flights, Skyscanner, Hopper, camelcamelcamel, Holiday Pirates, cashback sites) and UK package-holiday rules (ATOL, deposits, infant fees) come from domain knowledge. No live sources were checked in this pass. Items marked (verify) are operator-specific facts that must be confirmed against each seller's T&Cs or live pages before they are coded as rules.

## How the reference products inform this

| Product | What it does well | Take for this project |
|---------|-------------------|-----------------------|
| Google Flights tracking | Per-route tracking, "price is low/typical/high" context, price history graph | Context against own history ("lowest ever for this date/room") beats raw price |
| Skyscanner / Kayak alerts | Threshold and "any drop" alerts, flexible dates, email/push | Dedupe and throttling are essential, otherwise alerts become noise |
| Hopper | Predictive "wait or buy" advice, price freeze | Prediction is a trap for one user with sparse data. Do not build it. Use history percentile instead |
| camelcamelcamel | Full price history chart, target price, lowest-ever flag | "Lowest ever" and target price are core. Chart is deferred (dashboard) |
| Holiday Pirates / deal sites | Curated deals, urgency framing | Curated by humans. The agent's version is a filtered, personalised deal feed. Avoid urgency/marketing copy |
| Cashback sites (TopCashback, Quidco) | Rate tables, T&C exclusions, tracking rules | Rates change often and carry conditions. Model conditions, not just percentages |

## Table Stakes

Features without which the alert cannot be trusted. Missing any of these means the owner will stop believing the alerts.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Configurable searches in DB (party, dates, airports, rooms, thresholds) | Every tracker has saved searches | Low | In brief. Seed with Rixos search |
| Pure, unit-tested true-cost calculator with a visible breakdown | The core value. The alert must show *why* the number is what it is | Med | In brief. Breakdown line items must be stored with the quote, not recomputed later with changed config |
| Price history per (seller, airport, date, room) and overall best | Needed for "drop" and "lowest ever" | Low | In brief |
| Direct-flight-only filter applied after extraction | Brief rule | Low | Do it on normalised data as well as via site filter (the site filter can silently fail) |
| ntfy alert with the key facts: seller, date, airport, room, true cost, breakdown, deep link | Alert must be actionable on a phone in 5 seconds | Low | Include the link to the exact search URL |
| Alert dedupe (same reason + same quote, 24h) | Alert fatigue is the number one reason users abandon trackers | Low | In brief |
| Per-person vs total normalisation (flagged, asserted) | TUI shows per-person calendar prices, others show totals. Mixing them gives a 2-4x error that looks like a spectacular deal | Med | Every `Quote` must carry `priceBasis` and a sanity check on party size. Reject quotes where total / party-size is implausible vs history |
| Stale-price / freshness handling (`scraped_at`, max age) | Cached or availability-stale prices are the classic false alert. Calendar prices are often cached and differ from the checkout/details total | Med | Alert only on a price confirmed on a details/total view, not a calendar cell alone. Show "scraped N min ago" in the alert |
| Outlier / parse-sanity gate before alerting | LLM extraction can misread (drop a digit, take a deposit as total, take per-person as total) | Med | Reject or hold for confirmation any price more than ~40% below the previous best. Re-scrape once to confirm before alerting. Log held items |
| Quote validity checks: correct hotel, party, nights, airport, date | A wrong hotel or party size gives a wrong true cost | Med | Assert extracted fields equal the search request. Mismatch means quote discarded |
| Party composition handled explicitly, including infant | Infant fees and lap-infant rules change the total. Jet2 and others charge per-infant or include infants differently (verify per seller) | Med | Model `infantCost` as an explicit line item with source (included, fee, unknown). Unknown must not silently be 0 |
| Bags and transfers modelled as included / extra / unknown | easyJet holidays often includes both, Jet2 and On the Beach often do not (per brief) | Med | Tri-state, not boolean. "Unknown" adds a visible warning on the alert. Transfers are not in the brief's formula. Sharm transfers are a real cost if excluded (verify) |
| Failure handling: CAPTCHA stops the seller, screenshot+HTML on parse failure | Brief | Med | In brief |
| Run health signal: "seller X failed N runs in a row" alert | A silent scraper is indistinguishable from a quiet market. Matches the owner's own "broken vs quiet" concern | Low | One ntfy per seller per failure streak, deduped. Distinct low-priority channel or tag |
| Daily digest of top 5 | Brief | Low | In brief. Include "last successful run per seller" so stale sellers are obvious |
| Twice-daily schedule + manual `once` run | Brief | Low | In brief |
| Politeness: rate limit with jitter | Brief | Low | In brief |

## Differentiators

Not expected of a minimal tool, but they are where this beats generic alerts. Ordered by value for trust.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Booking-protection tag per quote (ATOL / ABTA / package-travel regs) | All four sellers sell ATOL-protected packages, but a flights+hotel DIY combination later would not be. Showing protection status makes comparisons honest and prepares for the DIY seller | Low | Store as a seller-level attribute now (verify each seller's ATOL statement). Display only. Do not make it a filter yet |
| Deposit / payment-schedule awareness (low-deposit amount, balance due date) | Package prices can be booked on a small deposit. The "worth booking" decision depends on cash needed now and balance date. Also, cost differs if paid by credit card (Section 75 cover; some operators surcharge cards, verify) | Med | Capture deposit and balance date when visible on the details page, as display metadata only. Never feed it into true cost |
| "Cashback confidence" on each true-cost number | The cashback figure is the shakiest input. Show it as `confirmed` / `assumed` and show true cost both with and without it | Med | See cashback caveats below. Alert thresholds should be evaluated on the **conservative** number (cashback excluded or assumed-only-at-default-rate), so a drop that exists only because a cashback rate rose does not look like a price drop |
| Cashback caveat modelling | New-customer-only rates (On the Beach 3% is conditioned on new customer, per brief), code usage voiding cashback, and per-booking caps and exclusions are exactly where users get burned | Med | Deal rows carry `conditions`, `newCustomerOnly`, `voidedByCode`, `cap`, `excludes` (e.g. deposits, taxes, flights-only). Calculator applies rules rather than raw percentages. Cashback is paid weeks or months after return and may track as pending/declined. Present as "expected", never as a price reduction in the quoted total |
| Code-vs-cashback pick shown | Brief. Distinctive among tools | Low | Show both options and the winning one |
| Price-per-person AND total in every alert | Removes the per-person/total confusion for the human too | Low | Always print "£X total (£Y pp for 2A+1C+1I)" |
| Context vs own history (percentile, lowest-ever, "N days since lower") | Replaces Hopper-style prediction with something honest and explainable | Low | Needs history. Becomes meaningful only after a few weeks of data |
| Alert priority tiers (urgent / normal / digest) with ntfy priority | A genuine new low should buzz. A "BRS near BHX" note should not | Low | Map alert reasons to ntfy priority and tags |
| Alert includes why it fired and what changed | "Was £2,340, now £2,260 (-£80), BHX 12 May, family room" | Low | Include previous best and date seen |
| Cheapest-date-window view in the digest (cheapest depart date per airport) | Flexible-date windows are the whole point of a 3-31 May window | Low | Aggregate query over existing data |
| Seller reconciliation of shape drift (extraction schema validation with Zod) | Fast detection when a seller's page changes | Med | Zod-validated extraction with confidence. Failures captured as above |
| Deal expiry tracking tied to current best quote | Brief | Med | In brief. Needs a join between deal applicability and best quote |
| Transport cost model with drive-time threshold and late-return overnight rule | Brief. Rare in any consumer tool | Med | In brief. Config per airport. Edge cases: return landing exactly at 00:30 or 05:00, flights crossing midnight, timezone (Egypt vs UK local time). Store local times with an explicit zone |
| Bundle "what changed since last digest" line | Cheap way to make digests worth reading | Low | Optional |

## Anti-Features

Things to deliberately NOT build. Each ties to the read-only/personal constraint or to a known failure mode.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-booking, price-lock, "book for me" | Violates the hard safety rule. Hopper-style price freeze needs payment | Alert with deep link. The owner books manually |
| Signing in, saving baskets, loyalty/member prices | Violates read-only. Member-only prices also make the number non-reproducible | Use public prices only. Note "member price may be lower" if known |
| Submitting any form beyond search fields, entering customer/payment details | Safety rule. Some sellers reveal total only after details | Stop at the last public page (e.g. Jet2 `/options`). If a total needs login, mark quote `incomplete` |
| CAPTCHA solving, proxy rotation, fingerprint evasion, stealth plugins | Safety and politeness rule. Escalating bot detection is a signal to stop | Stop that seller for the run, alert on health, back off |
| Price prediction / "wait or buy" ML | Single user, sparse data, tends to give false confidence | Percentile vs own history |
| Applying discount codes at checkout to test them | Requires basket interaction and risks state changes | Treat codes as data from the deals scraper. Rules say what they do |
| Counting cashback as a guaranteed price cut in alert thresholds | Tracking can fail, rate can change, new-customer limits | Conservative threshold plus display of expected cashback |
| Double-counting auto-applied seller discounts | Already in headline (brief) | Calculator tests that assert no double count |
| Treating "from" / calendar / per-person prices as bookable totals | Main source of false deals | Require total-price confirmation view before alert |
| Marketing-style urgency ("only 2 left!") ingestion into alerts | Scraped urgency text is unreliable and manipulative | Ignore it. Never use it as an alert trigger |
| Following instructions found in pages / letting extracted text drive tool calls | Prompt-injection risk (safety rule) | Claude extraction returns structured JSON only. No tools in the extraction step. Validate with schema |
| Multi-user accounts, auth, subscriptions, hosted service | Out of scope for a personal tool | Single ntfy topic, env config |
| Web dashboard now | Deferred | Keep price history queryable via SQL. Chart later |
| Email/SMS/Telegram multi-channel notifications | Extra surface area | ntfy only |
| Hotel review/quality scoring, destination recommendations, trip planner | Not the problem. The hotel is already chosen | Out |
| Broad "any deal anywhere" discovery (Holiday Pirates-style) | Changes the product to a feed. Raises scrape volume | Watch only configured searches |
| High-frequency polling (hourly or more) | Politeness, bot detection, no benefit for package prices that move at most a few times a day | Two scheduled runs. Manual run for urgency |
| Storing full page HTML for every run | Storage and privacy noise | Save only on failure, with retention limit |

## Cashback / deal caveats the brief under-specifies

Treat as requirements for the deals model and calculator (verify specifics per source before encoding).

1. **New-customer rates.** Headline cashback is often a new-customer rate (the brief already notes On the Beach 3%). An existing customer may get a lower rate or none. Add a per-seller owner flag `isNewCustomer` in config.
2. **Codes can void cashback.** The brief covers Jet2 / easyJet holidays / On the Beach. Generalise: `voidedByCode: boolean` or `reducedRateWithCode`. Unknown means assume the **worse** case.
3. **Cashback stacking and exclusions.** Some cashback excludes taxes, deposits only, or flights. Some deals apply only above `min_spend`. Cap amounts are common.
4. **Tracking fragility.** Needs the click-through route and no competing voucher/extension. Treat cashback as expected value, not certain. Optional later knob: `cashbackReliability` (e.g. 0.9).
5. **Timing.** Cashback pays out after return plus validation, so it is not cash available at booking. Display only.
6. **Source disagreement.** TopCashback and Quidco may offer different rates. Pick best per run and record the source on the quote so the alert can say "via TopCashback 3%".
7. **Staleness of deal rows.** A rate seen 5 days ago may be gone. Store `seen_at` and ignore deals not re-confirmed within N days (suggested 3) unless they carry a future `expires_at` recently confirmed.
8. **Blue Light Card / Student Beans.** Eligibility-gated. Add an owner eligibility flag. Ineligible deals are excluded from true cost and must not trigger "new deal" alerts.
9. **Deals pass on false positives.** Forum sources (HotUKDeals, MSE) include expired or irrelevant posts. Require seller match and an expiry or a recent post date before alerting.

## True-cost correctness checklist (acceptance-test candidates)

- Per-person vs total: TUI calendar price x party size equals the details total within tolerance, else flag.
- Infant: lap infant fee included or explicit "unknown". Child age 4 at **return date** (some operators price by age at travel; verify) and infant under 2 at return date.
- Transfers: included / extra / unknown shown. Included means 0, unknown means warn.
- Bags: included / extra with price / unknown. Hold luggage per person vs per booking, record unit.
- Overnight hotel: arrival times as local UK time, midnight-crossing and boundary cases tested.
- Airport costs: BHX parking is per trip duration, so verify 7 vs 8 days if returning after midnight.
- Room setups: "two standard rooms" total must be the sum of both rooms, not one.
- Currency / VAT: GBP only, assert it.
- Alert thresholds computed on stored breakdown, so config changes do not rewrite history. Store `calcVersion`.

## Feature Dependencies

```
Search config (DB) -> Seller tools (Quote[]) -> Normalisation + sanity gates -> Quote storage
Quote storage -> Price history -> Lowest-ever / percentile context
Normalisation (per-person/total, bags/transfer/infant tri-state) -> True-cost calculator
Deals scraper -> Deal rows (conditions, expiry) -> True-cost calculator (best of code vs cashback)
True-cost calculator + History -> Alert rules -> Dedupe -> ntfy
Alert rules (deal expiry) -> requires "current best quote" + deal applicability join
Run health tracking (per-seller outcome) -> Health alert + digest "last success" line
Booking-protection tag -> (later) DIY seller comparison
Deposit/payment metadata -> display only (no dependency on calculator)
```

## MVP Recommendation

Prioritise (in line with the owner's 7 deliverables):
1. Table stakes from the first Jet2 vertical slice: normalisation gates (total vs per-person, party/hotel assertions, tri-state bags/transfers/infant), stored breakdown, freshness stamp, deduped ntfy alert.
2. True-cost calculator with cashback conditions model (`isNewCustomer`, `voidedByCode`, caps) from the start. Retrofitting conditions into a percentage-only schema is costly.
3. Run-health alert and "last success per seller" in digest. Cheap and prevents silent failure.
4. One differentiator early: conservative true cost (with and without cashback) and "why it fired" alert text.

Defer:
- Deposit/balance-date metadata, ATOL tag display: low-cost add-ons once sellers work (store the fields in the schema early, populate later).
- Percentile context: needs weeks of history.
- Cashback reliability factor: only if cashback outcomes get logged by the owner (no feedback loop exists yet).
- Dashboard, DIY seller, reward-seat watcher: per brief.

Owner-mandated engineering scope (CI, CodeRabbit, evals, PostHog, canary, CD) follows the addendum's deliverable order: CI and `.coderabbit.yaml` in 1, true-cost eval in 2, extraction eval and PostHog tracing in 3, deals eval in 4, per-seller fixtures in 5, alert and safety evals in 6, CD/canary/dashboards in 7.

## Quality, Operations and Observability (owner-required, from BRIEF-ADDENDUM.md)

The owner explicitly requires these, so they count as TABLE STAKES for this project (same weight as the Table Stakes section above). PostHog pieces are optional at runtime: everything must work with the env unset. Several also protect alert trustworthiness.

### Required (owner-mandated)

| Feature | Category | Complexity | Notes / Dependencies |
|---------|----------|------------|----------------------|
| Protected `main`, small PRs, CodeRabbit review with resolved comments, `.coderabbit.yaml` (schema v2, path_instructions, path_filters) | Required, workflow | Low | Deliverable 1. Path instructions encode the safety rules (read-only sellers, pure pricing, evals required for `src/agent/**`, no secrets or personal data in PostHog). Needs GitHub repo and branch protection documented in README |
| PR CI: lint, Prettier, `tsc --noEmit`, Vitest, 90% coverage on `src/pricing`, offline fixture extraction tests, Docker build, migration check on throwaway Postgres | Required, CI | Med | Deliverable 1 starts with lint/type/unit/Docker. Fixture tests and migration check added as their deliverables land. No live sites in PR CI |
| Dependabot or Renovate | Required, CI | Low | Any time after scaffold |
| CD: GHCR image tagged SHA + `latest`, migrations as a separate step, manual `workflow_dispatch` run-once, deploy target chosen later | Required, CD | Med | Deliverable 7. Depends on Docker build and migrations. Deploy target is an open decision |
| Eval 1, extraction: per-seller fixtures with hand-labelled `expected.json`; 100% on price/airport/direct, 95% overall; add a fixture for every production parser break | Required, evals | Med-High | Per seller deliverable (3, 5). Depends on saved page snapshots, so the failure-capture feature (screenshot+HTML) is the fixture source. Strip personal data. Fixtures excluded from CodeRabbit |
| Eval 2, true cost: ~20 deterministic scenarios with exact expected GBP | Required, evals | Low-Med | Deliverable 2. Add the gaps from this research as scenarios: per-person vs total, infant fee unknown, transfers excluded, midnight boundary, code voiding cashback, no double-counted auto discount |
| Eval 3, alert decisions: ~20 history+deal scenarios, zero misses on must-alert, at most 1 false alert per 20 | Required, evals | Med | Deliverable 6. Depends on alert rules and dedupe. Include scenarios for the outlier hold, stale deal and ineligible deal (this research) |
| Eval 4, deals extraction: saved cashback/code pages with expected rate, min spend, expiry, stacking | Required, evals | Med | Deliverable 4. Add expected fields for new-customer-only, voided-by-code and caps |
| Eval 5, safety hard gate (100%): injected-instruction pages and booking buttons, agent must flag and never act | Required, evals, hard gate | Med | Deliverable 6. Needs the sellers' action allow-list to be enforceable and testable (extraction step has no tools) |
| Eval runner in Vitest via `@mastra/evals`/`runEvals`, scores recorded to Mastra storage, evals job on relevant PRs and nightly using `ANTHROPIC_API_KEY` | Required, evals | Med | Costs LLM spend per run, so path-filter the PR trigger as specified. Verify current `@mastra/evals` API during phase research |
| Nightly live canary: one real search per seller, opens GitHub issue and ntfy on parser failure or CAPTCHA, never fails PRs | Required, reliability | Med | Deliverable 7. Overlaps with the run-health alert suggested in this research. Share the failure-detection code, but canary is CI-side and run-health is runtime |
| PostHog LLM analytics via `@posthog/ai`/`posthog-node`, `$ai_generation`, `run_id` as trace ID, privacy mode on for page content | Required, observability | Med | Deliverable 3. Verify the Mastra `withTracing` integration against current docs |
| PostHog custom events: `search_run_started/finished`, `quote_saved`, `scrape_failed`, `captcha_detected`, `deal_found`, `alert_sent`, `eval_run`; fixed `distinct_id` `holiday-agent`, no personal data | Required, observability | Low-Med | Add event properties for the trust features: `price_basis`, `held_for_outlier`, `cashback_confidence` |
| PostHog dashboards (best true cost per seller/airport, scrape success, CAPTCHA rate, LLM cost, alerts) and alerts (seller success under 80% per 24h, LLM spend cap) | Required, observability | Low-Med | Deliverable 7. Dashboards are configured in PostHog, so document them (or export JSON) in the README |
| PostHog feature flags per seller (`seller_on_the_beach_enabled`) and model switching | Required, observability | Low-Med | Must degrade gracefully: unset keys or unreachable PostHog should fall back to local config defaults. A flag outage must not silently disable all sellers |
| PostHog error tracking for uncaught exceptions | Required, observability | Low | |
| Everything works with `POSTHOG_API_KEY`/`POSTHOG_HOST` unset | Required constraint | Low | Design telemetry as a no-op adapter behind an interface. Test it in CI with the keys unset |

### Dependencies (quality, operations and observability)
```
Failure capture (screenshot + HTML) -> offline-replayable fixtures -> extraction eval + offline CI tests
Extraction must be a pure function of saved page text (no live browser) -> fixtures replay in CI
Seller tools + Quote schema -> extraction eval (100% price/airport/direct, 95% overall)
True-cost calculator -> true-cost eval + 90% coverage gate on src/pricing
Alert rules + dedupe -> alert-decision eval (0 missed must-alert, <=1 false per 20)
Deals scraper -> deals eval
Action allow-list / tool-less extraction -> safety eval (100% hard gate)
Evals in Vitest -> evals CI job (path-filtered + nightly) -> scores to Mastra storage + eval_run event
Docker build + migrations -> CD to GHCR (SHA + latest) -> deploy step (migrations first)
Per-seller feature flags (with local-config fallback) -> gate the workflow fan-out over seller x airport x date x room
Telemetry no-op adapter -> PostHog events/LLM tracing/error tracking -> dashboards + PostHog alerts
Canary -> shares failure-detection code with runtime run-health; ntfy remains primary alert channel
```

### Interaction with core features
- Run-health alerts (suggested) vs PostHog "success rate under 80%" alert: keep ntfy run-health as the primary channel, because the owner's phone alerting must not depend on an optional third-party service. PostHog is the secondary, analytic layer.
- Feature flags vs the "stop seller on CAPTCHA" rule: the flag is a manual switch, CAPTCHA stop is per run. Keep them separate.
- Privacy: page content may include personal details (none expected for public search pages), so keep privacy mode on and exclude prompts and page text from events.

### Anti-features within this scope
- Do not let CI call live seller sites on PRs (flaky, impolite, breaks politeness rule).
- Do not auto-merge PRs or bypass the "wait for go-ahead" rule, including Dependabot.
- Do not send quote URLs with personal params, party details beyond counts, or ntfy topic to PostHog.
- Do not gate alerts on PostHog flags being reachable.
- Do not make the canary fail PRs (explicitly specified).

## Gaps and items to verify

- Per-seller infant policy and price (Jet2, TUI, On the Beach, easyJet holidays) for a lap infant to Sharm. (verify, LOW)
- Whether Sharm transfers are included at each seller. (verify, LOW)
- ATOL / ABTA statements per seller and where they appear on pages. (verify, MEDIUM that all four are ATOL-protected)
- Deposit amounts, balance due dates and card surcharges per seller. (verify, LOW)
- Current TopCashback / Quidco terms: new-customer definitions, caps, exclusions, tracking rules. (verify, LOW)
- How per-person pricing for children and infants appears on the TUI calendar. (verify from live page, LOW)
- Current `@mastra/evals` / `runEvals` API and the PostHog Mastra `withTracing` integration. Not verified this session.

## Sources

- Owner brief, addendum and project context: `.planning/BRIEF.md`, `.planning/BRIEF-ADDENDUM.md`, `.planning/PROJECT.md` (HIGH for what the owner wants)
- Competitor feature knowledge (Google Flights, Skyscanner, Hopper, camelcamelcamel, Holiday Pirates, TopCashback, Quidco): training knowledge, not re-verified this session (LOW to MEDIUM)
- UK package-holiday protection and payment conventions (ATOL, Package Travel Regulations, Section 75): training knowledge (MEDIUM for general rules, LOW for operator-specific details)
