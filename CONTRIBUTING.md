# Contributing

First-party Prism code is licensed under AGPL-3.0-only (`LICENSE`, `Documentation/adr/0001-project-licence.md`). There is no copyright-assignment CLA. A Developer Certificate of Origin (DCO) Signed-off-by line, or an equivalent statement that you have the right to contribute the change under AGPL-3.0-only, is enough.

v1 is the Chromium extension only (ADR 0002). Do not implement `apps/native`, gateway, or a TLS proxy. `apps/web` visual work is a parallel build under `Documentation/specs/2026-08-28-marketplace-website-design.md`.

Work queues:

- v1 Chromium extension: `Documentation/specs/2026-08-28-extension-v1-plan.md` and `Documentation/specs/2026-08-28-mod-package-and-runtime.md` (ADR 0002).
- Later / v2 (Firefox unpack shim, behaviour policies, Phase 0 leftovers): `Documentation/specs/2026-08-29-later-plan.md`.
- Historical host, gateway, registry, and related ADRs: `Documentation/specs/2026-08-27-implementation-plan.md`. Do not execute it as the current queue.

Architecture requirements map to those plans in `Documentation/traceability.md`.

The git index is the published source tree: what is required to build, test, and scan. Editor settings, assistant transcripts, session canvases, and other local tool state are not.

## Task checkboxes

Plans use markdown task state:

- `[ ]` not started
- `[~] YYYY-MM-DD` in progress (optional initials)
- `[x] YYYY-MM-DD` done

Claim a task as `[~]` before starting it. Mark `[x]` only when the work, tests, and documentation for that task exist. Do not start a phase whose entry criteria are unmet.

## Commits

Match existing history: one-line, imperative subject; optional longer body. Describe the change, not a chat session. Examples of the house style: `Harden extension runtime boundaries.` / `Add Playwright Chromium e2e for unpacked tracer fixtures.` Do not require `feat:` / `fix:` prefixes. Do not skip hooks. Do not commit unless a maintainer asks.

## References/

`References/` is gitignored study material restored from `references.lock.json`. It is not a source tree to copy from by default. Copying into `apps/`, `packages/`, `mods/`, or `corpus/` needs a licence check recorded under `Documentation/` first (ADR 0001, `Documentation/corpus-licence.md` where corpus is involved). GPL-2.0-only code cannot be combined with this AGPL-3.0-only tree.

## Text

ASCII only in tracked files. NZ/GB spelling in prose (colour, behaviour, sanitise, licence). `npm run lint` runs ESLint, `scripts/check-text.mjs`, `scripts/verify-references-lock.mjs`, and `scripts/check-publishable-tree.mjs`. `npm test` includes `scripts/check-mods-engine.test.mjs`, which fails closed if `mods/*/prism.yaml` is missing.

From the repo root, the verbs are `npm run build`, `npm test`, `npm run lint`, `npm run scan`, and `npm run test:e2e` (Playwright Chromium; not part of `build`). `npm run verify` is lint, scan, and test. `test:e2e` may be waived if Chrome cannot run. Do not waive `scan`.

## Do not trust: scan, test, and verify

Edits and user-submitted mods are untrusted until they pass the gates. Tests passing is not a review.

- Tracked tree: `npm run lint` fails if git contains paths outside the publishable allowlist in `scripts/check-publishable-tree.mjs` (hidden paths except CI and scan config; extra root markdown; `*.canvas.tsx`).
- Code: `npm run scan` runs the configured scanner with `npx` (`scripts/scan-untrusted.mjs`). Do not vendor that CLI. Gate config is `.aislop/config.yml`. The score floor is 80. Findings still print; they are not waived.
- Mods: `scripts/check-mods-engine.mjs` (via `npm test`) validates `mods/*/prism.yaml`. Sideload and marketplace packages get the same schema, capability gate, and fixture tests. No package is trusted because of who wrote it.
- Local packages also pass the shared whitelist inspector at author/import, pack/CI, and runtime boundaries. Pack findings are fail-closed; runtime native code has no page DOM.
