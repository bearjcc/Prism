# Agent instructions

v1 is the Chromium extension only (ADR 0002).

Start here:

1. `Documentation/adr/0002-extension-first-v1.md`
2. `Documentation/specs/2026-08-28-extension-v1-plan.md` (checkboxes)
3. `Documentation/specs/2026-08-28-mod-package-and-runtime.md`

Do not implement `apps/native`, gateway, `apps/web`, or a TLS proxy.

ASCII in tracked files. NZ/GB spelling in prose. AGPL-3.0-only.

Before claiming work finished or a bug fixed, run from the repo root:

1. `npm run build`
2. `npm test`
3. `npm run test:e2e` (Playwright; install once with `npx playwright install chromium`)

`test:e2e` is not part of `build`. The user may waive e2e if Chrome cannot run.
