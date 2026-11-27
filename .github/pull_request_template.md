## Summary

<!-- What changed and why. Link the requirement IDs this PR covers (e.g. CI-02). -->

## Test evidence

<!-- Commands run and their output: lint, typecheck, unit tests, integration/migration check, docker build. Link the CI run. -->

## Qodo Merge review

<!-- After Qodo posts its describe and review, fix or reply to every comment before asking the owner to merge. Record the outcome here. Keep PRs small to fit the free quota. -->

## Risks and dependencies

<!-- Anything that could go wrong, and any PRs this depends on. -->

## Checklist

- [ ] Fixtures sanitised (added via pnpm sanitise:fixture and pnpm scan:fixtures passes), or no fixtures changed
- [ ] No secrets, tokens or personal data in code, logs, fixtures or PostHog events
- [ ] Prompts or tool definitions changed -> evals updated (or not applicable)
- [ ] Schema changes have a generated migration (pnpm db:generate; never drizzle-kit push)
- [ ] Every Qodo Merge comment fixed or replied to
- [ ] Owner go-ahead received before merge (Claude never merges)
