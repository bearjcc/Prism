# Extension v1 implementation plan

> **For agentic workers:** Implement this file's checkboxes in order. Spec: `Documentation/specs/2026-08-28-mod-package-and-runtime.md`. ADR: `Documentation/adr/0002-extension-first-v1.md`. Do not start `apps/native`, gateway, `apps/web`, Firefox product work, or TLS proxy work. Use the checkbox protocol below.

**Goal:** A Chromium MV3 extension that loads native `.prism` packages and proves the engine with three bundled mods: kitten ad replace, YouTube Home videos-only, Reddit comments on YouTube watch.

**Architecture:** Extension owns validation, capability gate, extractors, DNR, and local storage. Mods are data plus `prism.*` orchestration. Extractors that parse HTML live in the extension.

**Tech stack:** TypeScript, Chrome MV3 (`apps/extension`), `packages/schema` (shared types + validator). Tests: Node (vitest or node:test) for schema/gate; Playwright or jsdom fixtures for adapters. ASCII in tracked files. NZ/GB spelling in prose.

## Global constraints

- AGPL-3.0-only (`Documentation/adr/0001-project-licence.md`).
- Default deny; optional caps off until granted; runtime is the lock.
- Mods never receive `document`, `fetch`, cookies, or extractor HTML.
- No Native Messaging in v1.
- No general HTTPS MITM.
- `References/` is study only; licence check in Documentation before copy.
- Task state: `[ ]` / `[~] name YYYY-MM-DD` / `[x]` merged.
- Claim a task in a small commit before starting it.
- Do not start a phase whose entry is unmet.

## Agent entry (read first)

1. `Documentation/adr/0002-extension-first-v1.md`
2. This file
3. `Documentation/specs/2026-08-28-mod-package-and-runtime.md`
4. `Documentation/architecture.md` (trust model still applies; v1 horizon is extension-only)
5. `Documentation/amy-kitten-mod-journey.canvas.tsx` (product story; ignore desktop as a runtime dependency)

**Done when:** `npm test` (or the repo's one test command) passes schema, gate, and the three mod fixture suites; Chrome unpacked load applies all three mods on fixture pages; README in `apps/extension` says how to load it.

**Superseded for v1:** `Documentation/specs/2026-08-27-implementation-plan.md` (keep for deferred host/gateway/registry phases).

## File map (create unless noted)

| Path                                               | Responsibility                                |
| -------------------------------------------------- | --------------------------------------------- |
| `packages/schema/src/manifest.ts`                  | `prism.yaml` types                            |
| `packages/schema/src/capabilities.ts`              | Capability ids and JSON result schemas        |
| `packages/schema/src/validate.ts`                  | Validator, positioned errors                  |
| `packages/schema/src/pack.ts`                      | Compile TS, zip, hash; ignore `filters/dns`   |
| `apps/extension/src/gate.ts`                       | Per-mod capability gate + activity events     |
| `apps/extension/src/prism-api.ts`                  | `prism.*` bound per mod                       |
| `apps/extension/src/loader.ts`                     | Load bundled and imported packages            |
| `apps/extension/src/dnr.ts`                        | Compile `filters/browser` to DNR              |
| `apps/extension/src/css.ts`                        | Sanitise and inject CSS                       |
| `apps/extension/src/extractors/ad-slot.ts`         | Ad-slot handles from fixtures/live            |
| `apps/extension/src/extractors/youtube-home.ts`    | `{ videos }`                                  |
| `apps/extension/src/extractors/youtube-watch.ts`   | `{ videoId }`                                 |
| `apps/extension/src/extractors/reddit-comments.ts` | Fetch + parse -> `{ comments }`               |
| `apps/extension/targets/chrome/manifest.json`      | MV3; host_permissions only as optional grants |
| `mods/kitten-ad-replace/`                          | Tracer 1                                      |
| `mods/youtube-home-videos/`                        | Tracer 2                                      |
| `mods/youtube-reddit-comments/`                    | Tracer 3                                      |

Remove or stop using stub `mods/basic-ad-blocker` and `mods/enable-paste` once tracers exist, or rewrite them onto `prism.yaml`. Do not keep two formats.

---

## Phase A -- Tooling

Entry: none.

- [~] agent 2026-08-28 Root package script: `build`, `test`, `lint` covering `packages/schema` and `apps/extension`.
- [~] agent 2026-08-28 TypeScript project references: schema built before extension.
- [~] agent 2026-08-28 ASCII + NZ spelling check in CI or a script (may reuse Phase 0 ideas from the 2026-08-27 plan; do not pull native CI).
- [~] agent 2026-08-28 `LICENSE` AGPL-3.0-only at repo root if missing.

Exit: clone, install, `build` and `test` succeed with empty/placeholder tests.

---

## Phase B -- Schema and gate

Entry: Phase A.

- [ ] `prism.yaml` schema: id, version, runtime `native`, required/optional capabilities, site scopes, optional egress contracts, optional `filters/browser` paths, assets, fixtures.
- [ ] Validator rejects unknown fields, missing id, undeclared capability names, egress without contract.
- [ ] Capability registry for the seven v1 ids in the spec, each with JSON result schema where applicable.
- [ ] Gate tests: call without grant throws; optional grant off throws; activity event names layer, mod id, capability, outcome.
- [ ] Pack: `src/*.ts` -> JS; zip; content hash. Unpacked dir load uses the same validate function.

Exit: golden valid package accepted; rejection suite fails closed.

---

## Phase C -- Extension shell

Entry: Phase B.

- [ ] MV3 service worker loads bundled mods from a build-time generated `bundled-mods.json` (or equivalent) produced from `mods/*/prism.yaml`.
- [ ] Content script at `document_start` on `<all_urls>` or declared matches; **mods still scoped** by package `scopes`.
- [ ] Popup or side panel: list mods, enable/disable, required vs optional caps, grant/revoke optional.
- [ ] Undo last visual change per tab (kitten replace / allowlist hide).
- [ ] Isolation test: mod A cannot call a capability only B declared.

Exit: empty native mod with no caps loads and does nothing; a test mod with `visual.hide` cannot `prism.extract('reddit.comments.search')`.

---

## Phase D -- Kitten mod (blocklist)

Entry: Phase C, ad-slot extractor.

- [ ] Ad-slot extractor: from fixture HTML with `data-prism-ad-slot` (and a documented live heuristic if attempted). Returns handles, not HTML of the page.
- [ ] `mods/kitten-ad-replace`: `prism.yaml`, bundled kitten images, `src` calls `prism.slots.replace`.
- [ ] Optional egress contract stub: disabled; enabling without grant does not fetch; with grant still goes through broker (may be a mocked broker in tests).
- [ ] Optional DNR list of example third-party ad hosts; live YouTube ads that are first-party must still be handled by slots, not DNS fantasies.
- [ ] Fixture test: ads replaced by images; no `fetch` in the mod JS.

Exit: fixture page shows kittens in slots; disable mod restores (undo or reload). Amy journey stages Search through Bob installs, **without** desktop.

---

## Phase E -- YouTube Home allowlist

Entry: Phase C.

- [ ] `youtube-home.ts` extractor: fixture DOM or sanitised captured structure -> `{ videos: { id, title, href }[] }`. Drop shorts, ads, posts, polls, shelves that are not videos.
- [ ] `prism.ui.allowlist('youtube.home', 'video')` mounts only those items (replace feed container contents with extension-owned tiles, or hide non-video nodes **from extractor classification**, not from mod CSS selectors of the whole page).
- [ ] `mods/youtube-home-videos`.
- [ ] Fixture test: non-video units absent; video units present.

Exit: fixture Home is videos only. Record YouTube drift as adapter bugs, not mod bugs.

---

## Phase F -- Reddit comments on YouTube (cross-site)

Entry: Phase C, youtube-watch extractor.

- [ ] `youtube-watch.ts`: `{ videoId }` from watch URL or fixture.
- [ ] `reddit-comments.ts`: given a query string (e.g. video title + "site:reddit.com" or a documented search URL), `fetch` as extension, parse comments to `{ author, body, permalink }[]`. Never pass HTML to the mod.
- [ ] Host permission `https://www.reddit.com/*` requested **only** when the user enables `reddit.comments.search`.
- [ ] `mods/youtube-reddit-comments`: replace comments slot with rendered JSON. Optional cap off: fallback copy, watch still works.
- [ ] Tests: parser over saved Reddit HTML fixtures (no live network in CI). Gate: mod cannot read raw HTML.

Exit: fixture watch page + fixture Reddit HTML -> comments listed. Live Reddit may fail (bot wall); CI must not depend on live Reddit.

---

## Phase G -- Hardening and docs

Entry: D, E, F all `[x]`.

- [ ] `apps/extension/README.md`: load unpacked, grant optional caps, known YouTube/Reddit breakage.
- [ ] Capability disclosure strings in the popup (why Reddit, why all-sites kittens).
- [ ] No path from mod JS to `eval`, page `fetch`, or `innerHTML` of extractor output.
- [ ] Traceability: three mods map to spec sections; architecture invariants listed in the spec still hold.

---

## Explicitly do not do

- `apps/native/**` implementation
- Gateway, Pi-hole, Control D, TV DNS
- Firefox store listing (shim folder may stay empty)
- Marketplace website
- Userscript bulk import
- Hidden Playwright/Chrome profile scraper
- Implementing both a fix and an exploit PoC for the gate
