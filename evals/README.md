# Evals

Layout:

- `fixtures/<seller>/<case>/{page.txt,meta.json,expected.json}` saved page text and expected extraction
- `scenarios/` price-history scenarios for alert decisions
- `suites/*.eval.ts` suites, run with `pnpm test:evals`
- `thresholds.ts` the single source of truth for pass thresholds

Model-backed suites run only on trusted PRs and nightly. Deterministic suites (true cost, alerts) need no model.
