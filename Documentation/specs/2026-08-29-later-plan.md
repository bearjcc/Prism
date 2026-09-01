# Later / v2 implementation plan

> Extension v1 (`2026-08-28-extension-v1-plan.md` A-G) and later Phases H-X are `[x]`. This file is the next work queue (Y onward). ADR 0002 still forbids `apps/native`, gateway, and TLS proxy.

**Goal:** Close Phase 0 leftovers that do not need a host; ship a Firefox target shim over the same `apps/extension/src`; start behaviour policies in the extension (paste first); keep UserCSS sanitise honest.

**Architecture:** Extension remains local state authority. Behaviour policies are global preferences with per-origin overrides, not new page JS for mods. Firefox is a thin manifest and copy of the Chrome pack. Native host and gateway stay scaffold.

**Tech stack:** TypeScript, Chrome/Firefox MV3, `packages/schema`. Tests: vitest; Playwright Chromium e2e stays the v1 gate. ASCII. NZ/GB spelling.

## Global constraints

- AGPL-3.0-only.
- Default deny for mods. Global behaviour policies are user preferences, disclosed, undoable, per-origin overridable.
- Mods never receive `document`, `fetch`, cookies, or extractor HTML.
- No Native Messaging, no `apps/native` implementation, no TLS MITM, no AMO listing, no Postgres/Meilisearch.
- Task state: `[ ]` / `[~] YYYY-MM-DD` / `[x] YYYY-MM-DD`.
- Claim a task `[~]` in this file before starting it. Do not start a phase whose entry is unmet.

## Explicitly do not do

- `apps/native/**` beyond existing scaffold
- Gateway, Pi-hole, Control D, TV DNS
- Firefox store listing / dead AMO button
- Hosted sync UI and pricing page
- Userscript bulk import that bypasses the gate
- Implementing both a fix and an exploit PoC for the gate

---

## Phase H -- Foundations leftover

Entry: none. Does not reopen native ADRs.

- [x] 2026-08-29 `CONTRIBUTING.md`: checkbox protocol, commit conventions, References licence check, DCO/AGPL note from ADR 0001.
- [x] 2026-08-29 ADR 0003: extension build toolchain (`esbuild`, `targets/chrome` and `targets/firefox` as thin shims over `apps/extension/src`). Index in `Documentation/adr/README.md`.
- [x] 2026-08-29 Traceability table: architecture requirement -> phase/spec that satisfies or defers it.
- [x] 2026-08-29 Catch-up: mark factually done Phase 0 items in `2026-08-27-implementation-plan.md` as `[x]` (task runner, eslint, editorconfig, LICENSE, ADR README, CI Windows/Linux build-test-lint, ASCII script, licence ADR). Leave native/gateway/store ADRs `[ ]` with a Deferred note pointing at ADR 0002. Do not mark host phases done.

Exit: clone docs tell a contributor how to work; ADR index lists 0003; historical plan no longer claims missing tooling that exists.

---

## Phase I -- References lock in CI

Entry: none.

- [x] 2026-08-29 CI job: verify `references.lock.json` (schema, unique dest, SHA format) and that restore scripts fail closed on SHA mismatch. Do not clone every study tree on every CI run unless a cheap `--verify-lock` path exists. Fail closed on tamper of the lockfile.

Exit: `npm run lint` or a dedicated script plus CI step fails if the lockfile is malformed or a restore SHA check is stubbed to always pass.

---

## Phase J -- Firefox target shim

Entry: Phase H ADR 0003 may land in parallel if it only documents current Chrome layout; Firefox implementation follows the ADR text.

- [x] 2026-08-29 Generate `apps/extension/targets/firefox` the same way as Chrome: bundled mods, `dist/*`, `popup.html`/`popup.css`. Zero policy logic in the shim.
- [x] 2026-08-29 Firefox MV3 manifest: same permissions story; background scripts form Firefox needs (`scripts` + module) rather than Chrome-only `service_worker` if that would not load. No AMO id, no store listing.
- [x] 2026-08-29 Tests: firefox target exists after `npm run build`; manifest has no enforcement logic; shared `src` is the only policy tree.
- [x] 2026-08-29 `apps/extension/README.md`: how to load unpacked in Firefox Nightly/stable, and that Firefox-as-product (AMO) is still later.

Exit: unpacked Firefox load path is documented; Chrome target still builds.

---

## Phase K -- Behaviour: allow paste

Entry: capability gate exists (v1 Phase C).

- [x] 2026-08-29 Global policy `behaviour.paste` (name in storage/UI): default on or documented default; capture-phase so the page cannot `preventDefault` paste/input for text fields; does not grant mods DOM access.
- [x] 2026-08-29 Per-origin override: disable paste-allow for one origin without affecting others.
- [x] 2026-08-29 Popup global policy panel: paste toggle + current-origin override. Disclose that this is a browser policy, not a mod capability.
- [x] 2026-08-29 Fixture HTML + vitest: site that blocks paste; policy on restores paste; origin override restores the block.
- [x] 2026-08-29 Safety: do not disable paste protection inside `password` fields if that would surprise (document the choice in the test).

Exit: fixture proves allow/deny per origin. No `apps/native`.

---

## Phase L -- UserCSS corpus honesty (no bulk userscript dump)

Entry: `packages/schema` `compileUserCss` already exists.

- [x] 2026-08-29 Corpus UserCSS packages (`corpus/usercss/*`) run through `compileUserCss`: accepted / sanitised / rejected counts recorded in a test. Forbidden `@import`, `url(`, update URLs, non-default preprocessors fail closed.
- [x] 2026-08-29 `apps/web` Create path copy already refuses userscript runtime dump; do not add one-click Violentmonkey import.
- [x] 2026-08-29 Do not bundle corpus UserCSS into the Chrome extension.

Exit: `npm test` includes UserCSS corpus counts. Extension bundled mods remain first-party `mods/` only.

---

## Phase M -- Behaviour: popup, title, scroll-lock

Entry: Phase K paste policy storage and popup panel.

- [x] 2026-08-29 Generalise policy storage if needed so paste, popup, title, and scroll-lock share default + `denyOrigins` (or equivalent per-policy) without duplicating message types carelessly.
- [x] 2026-08-29 Suppress unsolicited `window.open` / target=_blank popups that are not a user gesture; per-origin override; fixture + vitest.
- [x] 2026-08-29 Stable title: constrain `document.title` mutation after first set (or freeze to the first non-empty title); per-origin override; fixture + vitest.
- [x] 2026-08-29 Scroll-lock release: undo `overflow: hidden` on html/body and common overlay scroll traps when the policy is on; per-origin override; fixture + vitest.
- [x] 2026-08-29 Popup global policy panel lists these next to paste. Disclose each is a browser policy, not a mod capability.

Exit: three fixtures prove on/off per origin. Password/paste tests still pass.

---

## Phase N -- Behaviour: modals, consent, same-origin action

Entry: Phase M policy storage and popup panel.

- [x] 2026-08-29 Modal and chatbot-popup suppression: hide common cookie/chat overlay patterns on fixtures; per-origin override; do not grant mods querySelector of the live page.
- [x] 2026-08-29 Consent-interface rejection: dismiss or reject labelled consent UIs on a fixture; per-origin override.
- [x] 2026-08-29 Predefined same-origin user action primitive: explicit allowlist of actions only (no arbitrary click-all); tests for off-list refusal.
- [x] 2026-08-29 Browser-compatibility notes in apps/extension/README.md where enforcement is partial (MV3, Firefox).
- [x] 2026-08-29 Hard runtime safety: existing gate tests still prove mods cannot reach eval/page fetch/extractor HTML. Do not add an exploit PoC.

Exit: fixtures + vitest for the three behaviours. Paste/popup/title/scroll tests still pass.

---

## Phase O -- Restricted userscript world (no unrestricted mode)

Entry: v1 Phase C loader already skips `runtime: userscript` for `prism.*` `activate`; `chrome.userScripts` registration exists without an execution world.

- [x] 2026-08-29 `userscriptRegistrations` always sets Chromium `world: "USER_SCRIPT"`. Native `runtime: native` packages never appear in the register list. Tests: native entry source is not registered; userscript registrations include `world: "USER_SCRIPT"` and never `"MAIN"`.
- [x] 2026-08-29 Constrain matches to the package `scopes` only. Reject or strip remote `@require` / http(s) script URLs in userscript source (fail closed; no network fetch of script bodies). Tests for off-scope match and remote URL refusal.
- [x] 2026-08-29 Popup: trust label **Userscript**; constraints (world, scopes, no remote deps) visible; never place that label next to native-safe copy. Unrestricted / MAIN mode stays absent: no UI toggle, no register path. Do not add Violentmonkey bulk import.
- [x] 2026-08-29 `apps/extension/README.md`: restricted world vs native; Allow User Scripts still required; unrestricted Tampermonkey-like mode is not shipped (historical Phase 9 review gate).

Exit: vitest proves USER_SCRIPT only. Gate tests still prove native mods cannot eval / page fetch / extractor HTML. No `apps/native`.

---

## Phase P -- Behaviour: autoplay + hard invariants

Entry: Phase M/N policy storage and popup panel. YouTube autoplay extractor and corpus transcodes already exist; this phase is the **global behaviour policy**, not a new extractor.

- [x] 2026-08-29 Global policy `behaviour.autoplay` (default + `denyOrigins`): when on, constrain autoplay / autonav on fixture HTML (reuse or wrap existing watch extractor helpers). Per-origin override. Does not grant mods DOM access.
- [x] 2026-08-29 Popup global policy panel lists autoplay next to other behaviour policies. Disclose browser policy, not a mod capability.
- [x] 2026-08-29 Fixture HTML + vitest: autoplay on; policy on constrains; origin override restores autoplay. Existing paste/popup/title/scroll/overlay/consent tests still pass.
- [x] 2026-08-29 Hard invariants: origin exception / policy off cannot grant a mod `eval`, page `fetch`, or extractor HTML. Add or extend tests (no exploit PoC). Browser-compat notes in README where autoplay enforcement is partial (MV3, Firefox).

Exit: fixture proves on/off per origin. No unrestricted userscript. No host.

---

## Phase Q -- Mods engine CI gate

Entry: `mods/` tracers exist (v1 D-F). Historical Phase 0 leftover.

- [x] 2026-08-29 Root script (or vitest) fails if `mods/*/prism.yaml` is missing or empty, and runs validate + existing tracer fixture coverage for those packages. Wire into `npm test` or `npm run lint` so CI cannot pass with a silent empty engine. Do not clone References. -- `scripts/check-mods-engine.mjs` plus `scripts/check-mods-engine.test.mjs` (`npm test`).

Exit: deleting or emptying `mods/` would fail CI. Current three tracers still pass.

---

## Phase R -- Expression language ADR (no host)

Entry: none. Historical Phase 0 leftover that ADR 0002 does not defer. Does not reopen native language, store, signatures, or gateway ADRs.

- [x] 2026-08-29 ADR 0004: native mod expression language for the first runtime, and whether bounded WASM is in or out. Index in `Documentation/adr/README.md`. Catch-up checkbox in `2026-08-27-implementation-plan.md`. Traceability row. Decision must match shipped v1: `prism.*` TypeScript orchestration, CSS, DNR, and extension extractors; no new CEL/JSON-logic language in this runtime; bounded WASM out until a later ADR. -- `Documentation/adr/0004-mod-expression-language.md`.

Exit: ADR 0004 accepted; Phase 0 expression-language checkbox `[x]`; no `apps/native`.

---

## Phase S -- Capability diff (schema only)

Entry: v1 Phase B capability registry. Not the hosted registry (historical Phase 10).

- [x] 2026-08-29 `packages/schema`: capability-diff between two manifests (required, optional, egress contracts). Human-readable increase and decrease. Tests: add, remove, required-to-optional, optional-to-required, egress field/origin change. Export from the package index. Do not add signing, ingest, or a registry service. -- `capabilityDiff` in `packages/schema/src/capability-diff.ts`.

Exit: `npm test` covers printable diffs. No host. No Postgres.

---

## Phase T -- Mod pause after repeated failures

Entry: v1 Phase C gate and popup. Historical Phase 2 robustness, extension-only.

- [x] 2026-08-29 Isolate mod JS failure so one throwing activate cannot break other mods or page load. Tests.
- [x] 2026-08-29 Record a failure budget per mod per origin; after a documented threshold, pause that mod on that origin; popup shows paused (not silent). Tests for threshold and that other origins and other mods stay active. Threshold: 3 consecutive activate failures (`MOD_FAILURE_BUDGET` in `apps/extension/src/mod-pause.ts`).
- [x] 2026-08-29 Hard invariants: pause/unpause cannot grant eval, page fetch, or extractor HTML. Existing gate tests still pass. No exploit PoC.

Exit: vitest proves isolation and visible pause. No `apps/native`.

---

## Phase U -- Marketplace a11y and performance gate (fixture site)

Entry: `apps/web` fixture catalogue exists. Design: `2026-08-28-marketplace-website-design.md`. Do not edit `apps/extension`. No Postgres, Meilisearch, or Chrome Web Store listing.

- [x] 2026-08-29 CI or `npm test`/`npm run lint` gate: inner-page text/control contrast (existing helpers ok) plus `prefers-reduced-motion` stills the home beam. Fail closed if a new inner route skips the shell contrast tokens.
- [x] 2026-08-29 Performance budget test for `/`, `/explore`, `/mods/:id` HTML: no account, no telemetry consent path. Do not add hosted search.

Exit: `npm test` fails if inner contrast or reduced-motion regressions land. Site remains a fixture catalogue.

---

## Phase V -- UserCSS map onto visual capabilities

Entry: Phase L corpus honesty. Historical Phase 9 leftover.

- [x] 2026-08-29 Map sanitised UserCSS rules onto `visual.hide` / `prism.styles.apply` (or documented equivalent) rather than treating compiled CSS as a raw page injection with no capability. Tests: hide-display:none maps; forbidden constructs still fail closed; corpus counts still recorded. Do not add Violentmonkey bulk import. Do not bundle corpus UserCSS into the Chrome pack. -- `mapUserCss` in `packages/schema/src/usercss-map.ts`; `prism.styles.apply` reconstitutes mapped CSS after `visual.hide` assert.

Exit: `npm test` proves mapping plus existing sanitise. Extension bundled mods remain `mods/` only.

---

## Phase W -- Current-page activity panel (extension-only)

Entry: v1 activity events exist. Historical Phase 6 subset. No host IPC.

- [x] 2026-08-29 Popup current-page panel lists visual, behavioural, and network rules affecting the active tab origin (mods, behaviour policies, DNR/site exceptions, pause). Honest "uncertain" when attribution is not known. Tests with a fixture origin. Do not add host IPC or Native Messaging. -- `pageActivityRows` in `apps/extension/src/page-activity.ts`; popup `#page-activity`.

Exit: vitest covers the panel data. Gate tests still pass. No exploit PoC.

---

## Phase X -- Compiled package cache validate on read

Entry: v1 loader stores imported `.prism` packs. Historical Phase 2 leftover.

- [x] 2026-08-29 Compiled package cache in extension storage validates with the same `validate` function on read, not only on write. Tampered or schema-invalid cached records are refused and not activated. Tests: good cache loads; mutated yaml/id/capabilities fail closed. Do not add a host store. -- `readCompiledPackageFromStorage` in `apps/extension/src/compiled-package-cache.ts`.

Exit: vitest proves read-path validation. Bundled mods still load.

---

## Phase Y -- Allow once (session exception)

Entry: Phase W panel and existing site exceptions. Historical Phase 6 subset. No host.

- [x] 2026-08-29 Allow once for the current browser session: a session-scoped origin exception for a chosen mod or behaviour policy that expires when the service worker dies or on an explicit clear. Distinct from lasting site exceptions. Popup control. Tests: session grant does not persist across a simulated worker restart; other origins unaffected. Pause/unpause and grants still cannot open eval / page fetch / extractor HTML. No exploit PoC. -- `session-exception.ts`; popup **Allow once this session**; in-memory worker store (not `chrome.storage.local`).

Exit: vitest covers session vs lasting exception. No Native Messaging.

---

## Phase Z -- Toolbar chrome (popup, badge, find, hide)

Entry: Phase W current-page panel and Phase Y allow-once. Competitive UI review: Stylus/TM popup + uBlock picker, not Tweeks on-page discovery. Registry still must not receive the current origin except as a user-started Explore search.

- [x] 2026-09-01 Popup: this-site mods first (scope match, including bundled off/on), other mods below; one-time pin hint; no marketing tab. Tests.
- [x] 2026-09-01 Toolbar badge: count of enabled mods on this tab; blank at zero; dim/title when the page is not injectable. Tab URL from the content script, not a `tabs` permission. Tests.
- [x] 2026-09-01 Find mods for this host: user-started Explore `?q=` only (no prefetch). Fixture catalogue origin is local web. Tests.
- [x] 2026-09-01 First-party context menu only: hide this element (session), hide on this site (persist sanitised CSS), pause Prism on this origin. No mod-defined `contextMenus`. Tests. Gate still refuses eval / page fetch / extractor HTML.

Exit: vitest covers partition, badge, find URL, hide selector, origin pause. Firefox unpack still copies Chrome popup files. No Tweeks panel or toast.

---

## Later still (not this file)

## Phase AA -- Three-layer local mod policy

Entry: Phase Z toolbar and existing v1 capability gate.

- [x] 2026-09-01 Local author/import, pack/CI, and runtime paths call one whitelist-first inspector independently.
- [x] 2026-09-01 Native package JS is restricted to the approved AST and runs without page DOM access.
- [x] 2026-09-01 CSS and browser filters fail closed; v1 DNS and gateway inputs are refused.
- [x] 2026-09-01 Capability denials no-op with activity events; required grants and browser host permission prompts remain explicit.
- [x] 2026-09-01 Community scan, fixture run, content verification, validation, runtime security, and publisher keying are documented only. Hosted registry and signing implementation remain deferred to Phase 10.

Exit: a bypassed author or pack check cannot grant native mod page DOM, undeclared capabilities, or silent host permissions. No `apps/native`, DNS engine, hosted registry, or unrestricted userscript.

---

## Later still (not this file)

Phase 10 registry and signing. Phase 4 host. Phase 9 unrestricted legacy (security review). Firefox-as-product / AMO. End screens and miniplayer extractors already exist (`youtube.watch.constrainEndScreens`, `youtube.watch.constrainMiniplayer`); further live YouTube drift is adapter bugs, not new host APIs.

