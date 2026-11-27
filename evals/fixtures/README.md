# Fixtures

- Fixtures enter only via `pnpm sanitise:fixture`.
- `pnpm scan:fixtures` must pass.
- Never commit screenshots or raw HTML containing scripts.
- Review bots cannot be told to skip or reliably check this folder, so the CI scan is the gate.
