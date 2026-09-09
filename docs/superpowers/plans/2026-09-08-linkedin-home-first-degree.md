# LinkedIn Home first-degree feed filter - implementation plan

**Spec:** [`docs/superpowers/specs/2026-09-08-linkedin-home-first-degree-design.md`](../specs/2026-09-08-linkedin-home-first-degree-design.md)  
**Date:** 2026-09-08  
**Mod id:** `prism.linkedin-home-first-degree`

## Entry criteria

- [x] 2026-09-08 Design spec approved by Bear.
- [x] 2026-09-08 Implementation plan written (this file).
- [ ] Existing test suites green on `master` before task 1.

## Conventions

- **TDD:** add or extend a failing test, implement the minimum to pass, commit in small slices.
- **Verify:** after each task, run the cited command; full suite before PR merge.
- **Pattern reference:** YouTube Home allowlist (`mods/youtube-home-videos/`, `apps/extension/src/extractors/youtube-home.ts`, `apps/extension/src/phase-e.test.ts`).
- **DCO:** every commit `Signed-off-by: Joseph C Caswell <bearjcc@users.noreply.github.com>`.

---

## 1. Schema - register `linkedin.home.allowlist`

### Task 1 - Capability id in registry

| | |
| --- | --- |
| **Files** | `packages/schema/src/capabilities.ts`, `packages/schema/src/capabilities.test.ts` |
| **Test first** | Extend `CAPABILITY_IDS` expectation to include `"linkedin.home.allowlist"` after `"youtube.home.allowlist"`. Assert `CAPABILITY_REGISTRY["linkedin.home.allowlist"].resultSchema` is defined with `required: ["items"]` and per-item `allowlisted`, `reason`, `id` (no HTML fields). |
| **Implement** | Add `"linkedin.home.allowlist"` to `CAPABILITY_IDS`. Register `resultSchema` with `items` array of classified post objects (`id`, `title?`, `href?`, `allowlisted`, `reason`). |
| **Verify** | `npm test --workspace=@prism/schema -- capabilities.test` |

### Task 2 - Capability copy for marketplace

| | |
| --- | --- |
| **Files** | `apps/web/src/lib/capability-copy.ts` |
| **Test first** | In `catalogue.test.ts` or a small `capability-copy.test.ts`, assert `capabilitySummary("linkedin.home.allowlist")` returns non-generic copy mentioning LinkedIn Home and first-degree / followed-page filtering. |
| **Implement** | Add `CAPABILITY_SUMMARIES["linkedin.home.allowlist"]` entry. |
| **Verify** | `npm test --workspace=@prism/web -- capability` |

### Task 3 - Prism API gate

| | |
| --- | --- |
| **Files** | `apps/extension/src/prism-api.ts`, `apps/extension/src/gate.test.ts` (if gate behaviour changes) |
| **Test first** | In `gate.test.ts` or a focused `prism-api` test: with grant `linkedin.home.allowlist` only, `prism.ui.allowlist("linkedin.home", "post")` records handler call; without grant, no-op. |
| **Implement** | Extend `ui.allowlist` to assert `linkedin.home.allowlist` when `surface === "linkedin.home"` (keep existing `youtube.home` branch). |
| **Verify** | `npm test --workspace=@prism/extension -- gate.test` |

---

## 2. Fixtures and extractor

### Task 4 - Static Home fixture (sanitised)

| | |
| --- | --- |
| **Files** | `mods/linkedin-home-first-degree/fixtures/feed.html` |
| **Test first** | None yet (fixture-only); sanity-check file loads in JSDOM manually. |
| **Implement** | Minimal signed-in `/feed` DOM: feed container, one 1st-degree post (`1st`), one followed company post (no degree badge), one 2nd-degree post, one Promoted post, one activity wrapper ("X commented on..." with non-allowlisted underlying author), one PYMK module. Use `data-fixture-kind` attributes for test assertions. No credentials or PII. |
| **Verify** | `node -e "require('fs').readFileSync('mods/linkedin-home-first-degree/fixtures/feed.html')"` |

### Task 5 - Live-shaped fixture

| | |
| --- | --- |
| **Files** | `mods/linkedin-home-first-degree/fixtures/feed-live.html` |
| **Test first** | Referenced by task 6 tests (write tests before filling fixture if markup is uncertain). |
| **Implement** | Second fixture mirroring shadow-heavy / A/B-shaped markup (nested wrappers, alternate badge text). Same keep/strip coverage as `feed.html`. |
| **Verify** | Loaded by extractor tests in task 6. |

### Task 6 - Extractor unit tests (failing)

| | |
| --- | --- |
| **Files** | `apps/extension/src/extractors/linkedin-home.test.ts` |
| **Test first** | Tests for `extractLinkedinHomeItem(child)` and `findLinkedinHomeFeed(document)` against `feed.html`: golden `allowlisted` / `reason` per `data-fixture-kind`; `findLinkedinHomeFeed` returns feed root; JSON output has no HTML string properties. Repeat key cases on `feed-live.html`. |
| **Implement** | Stub `linkedin-home.ts` exports that throw or return empty until task 7. |
| **Verify** | `npm test --workspace=@prism/extension -- linkedin-home.test` (expect red) |

### Task 7 - Extractor implementation

| | |
| --- | --- |
| **Files** | `apps/extension/src/extractors/linkedin-home.ts`, reuse `apps/extension/src/extractors/dom-query.ts` |
| **Test first** | Task 6 tests (already red). |
| **Implement** | `findLinkedinHomeFeed(root)` with deep/shadow-aware selectors; `classifyLinkedinHomeItem(element)` returning `{ id, allowlisted, reason }`; `extractLinkedinHome(root)` aggregating feed children. Heuristics per spec: 1st-degree badge, followed page (no 2nd/3rd+, not promoted), activity-card author walk, module detection. All paths try/catch -> `unknown` / empty, never throw. |
| **Verify** | `npm test --workspace=@prism/extension -- linkedin-home.test` (green) |

### Task 8 - Extractor schema / phase-g guard

| | |
| --- | --- |
| **Files** | `apps/extension/src/phase-g.test.ts` |
| **Test first** | Extend "extractor JSON schemas never expose HTML fields" to include `linkedin.home.allowlist`. Extend "extractor outputs are JSON handles" with `extractLinkedinHome` on fixture. |
| **Implement** | Wire `linkedin.home.allowlist` in content-script `extract` handler if exposed (optional for mod; required for tests and future `prism.extract`). Return `{ items: [...] }` matching schema. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-g.test` |

---

## 3. Content-script allowlist wiring

### Task 9 - Allowlist handler tests (failing)

| | |
| --- | --- |
| **Files** | `apps/extension/src/phase-l.test.ts` (new; mirror `phase-e.test.ts` structure) |
| **Test first** | `activate` from mod calls `prism.ui.allowlist("linkedin.home", "post")` only. Fixture activation on `https://www.linkedin.com/feed`: allowlisted posts visible; stripped nodes removed or `data-prism-owned="linkedin-home-hidden"`; stray node outside feed untouched. |
| **Implement** | Import mod from `mods/linkedin-home-first-degree/` once task 12 exists; stub handler in `content-script.ts` until task 10. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-l.test` (red) |

### Task 10 - `applyLinkedinHomeAllowlist` core

| | |
| --- | --- |
| **Files** | `apps/extension/src/content-script.ts` |
| **Test first** | Task 9 integration tests. |
| **Implement** | Branch `handlers.allowlist` for `linkedin.home` + `post`. `applyLinkedinHomeAllowlist(feed, doc)`: iterate feed children, classify, `safeRemoveFeedChild` (reuse YouTube helper or LinkedIn-named twin) when not allowlisted; mark allowlisted with `data-prism-owned="linkedin-home-kept"`. Never throw through handler (fail-soft). |
| **Verify** | `npm test --workspace=@prism/extension -- phase-l.test` (partial green) |

### Task 11 - Feed wait and activation gate

| | |
| --- | --- |
| **Files** | `apps/extension/src/content-script.ts` |
| **Test first** | In `phase-l.test.ts`: "waits for a late Home feed before activating the allowlist" (copy `phase-e` late-feed test). URL gate: only `/feed` paths activate; `/in/` profile URL does not. |
| **Implement** | `waitForLinkedinHomeFeed` + `DEFAULT_LINKEDIN_HOME_WAIT_MS`; push wait in `activateContentMods` when manifest requires `linkedin.home.allowlist`. Path check in `findLinkedinHomeFeed` or activation guard. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-l.test` |

### Task 12 - SPA refresh and `pageNeedsSurfaceRefresh`

| | |
| --- | --- |
| **Files** | `apps/extension/src/content-script.ts`, `apps/extension/src/extractors/linkedin-home.ts` |
| **Test first** | `phase-l.test.ts`: late-inserted feed child stripped on observer tick; `pageNeedsSurfaceRefresh` true when feed has unowned children. `linkedinHomeFeedHasUnlabelledPosts` helper test. |
| **Implement** | Export `linkedinHomeFeedChildren` / ownership check; extend `pageNeedsSurfaceRefresh` and existing `watchPageSurfaces` observer path to re-run LinkedIn allowlist (same debounce as YouTube). |
| **Verify** | `npm test --workspace=@prism/extension -- phase-l.test` |

### Task 13 - Fail-soft and adapter degradation signal

| | |
| --- | --- |
| **Files** | `apps/extension/src/content-script.ts`, `apps/extension/src/page-activity.ts` (if row copy needed), `apps/extension/src/phase-l.test.ts` |
| **Test first** | Hostile child that rejects `remove()` does not throw; mod stays `active`. Repeated empty feed classification records activity hint (e.g. `linkedin.home.allowlist degraded: feed not found`) without incrementing `MOD_FAILURE_BUDGET`. |
| **Implement** | try/catch per child; optional activity event via existing gate record path when feed missing after wait. Document that soft failures must not call `recordModActivateFailure`. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-l.test mod-pause` |

### Task 14 - Sandbox runtime pass-through

| | |
| --- | --- |
| **Files** | `apps/extension/src/sandbox-runtime.ts`, `apps/extension/src/sandbox-runtime.test.ts` |
| **Test first** | Allowlist operation forwards `linkedin.home` surface without throw. |
| **Implement** | Confirm sandbox `allowlist` IPC already generic; add test if missing. |
| **Verify** | `npm test --workspace=@prism/extension -- sandbox-runtime.test` |

---

## 4. Mod package

### Task 15 - `prism.yaml` and manifest validation

| | |
| --- | --- |
| **Files** | `mods/linkedin-home-first-degree/prism.yaml` |
| **Test first** | `scripts/check-mods-engine.test.mjs`: extend `TRACER_IDS` to include `prism.linkedin-home-first-degree`. |
| **Implement** | Manifest: `id: prism.linkedin-home-first-degree`, `runtime: native`, `capabilities.required: [linkedin.home.allowlist]`, `scopes: [https://www.linkedin.com/]`, `fixtures` list. |
| **Verify** | `npm test -- scripts/check-mods-engine.test.mjs` |

### Task 16 - Mod activate source

| | |
| --- | --- |
| **Files** | `mods/linkedin-home-first-degree/src/index.ts` |
| **Test first** | Covered by `phase-l.test.ts` task 9 mod-only test. |
| **Implement** | `export async function activate(prism) { await Promise.resolve(prism.ui.allowlist("linkedin.home", "post")); }` |
| **Verify** | `npm test --workspace=@prism/extension -- phase-l.test` |

### Task 17 - Mod README (bundled tracer note)

| | |
| --- | --- |
| **Files** | `mods/README.md` |
| **Test first** | `phase-g.test.ts` bundled-mod readme list includes `linkedin-home-first-degree`. |
| **Implement** | Add tracer to list in `mods/README.md`. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-g.test` |

---

## 5. Bundle into extension build

### Task 18 - `generate-bundled-mods` picks up new mod

| | |
| --- | --- |
| **Files** | `scripts/generate-bundled-mods.mjs` (no code change if auto-discover), `apps/extension/src/shell.test.ts` |
| **Test first** | `shell.test.ts` / `firefox-target.test.ts`: bundled index includes `prism.linkedin-home-first-degree` entry path. |
| **Implement** | Run `node scripts/generate-bundled-mods.mjs`; commit generated `apps/extension/targets/*/bundled-mods/**` only as part of implementation PR (or CI build). For local verify, run full `npm run build`. |
| **Verify** | `npm test --workspace=@prism/extension -- shell.test` |

### Task 19 - Web package artefact

| | |
| --- | --- |
| **Files** | `scripts/generate-web-packages.mjs`, `scripts/generate-web-packages.test.mjs`, `scripts/prepare-web-build.test.mjs` |
| **Test first** | Extend `HOMEgrown` set and expected package count; assert `linkedin-home-first-degree.prism` written. |
| **Implement** | Add `"linkedin-home-first-degree"` to `HOMEgrown` in `generate-web-packages.mjs`. |
| **Verify** | `npm test -- scripts/generate-web-packages.test.mjs prepare-web-build.test.mjs` |

---

## 6. Catalogue and Explore metadata

### Task 20 - Catalogue listing

| | |
| --- | --- |
| **Files** | `apps/web/src/lib/catalogue.ts`, `apps/web/src/lib/catalogue-manifest.test.ts`, `apps/web/src/lib/mod-install.test.ts` |
| **Test first** | `catalogue-manifest.test.ts`: four homegrown mods; listing id `linkedin-home-first-degree` matches `mods/linkedin-home-first-degree/prism.yaml`. `mod-install.test.ts`: `bundledEntryPath("prism.linkedin-home-first-degree")`. |
| **Implement** | Add `CatalogueListing` with honest `EMPTY_LISTING_STATS` (0 installs, null rating), `site: linkedin.com`, capability row, `previewSrc: /previews/linkedin-home-first-degree.webp` (placeholder per previews README if capture unavailable). |
| **Verify** | `npm test --workspace=@prism/web -- catalogue` |

### Task 21 - Preview asset placeholder

| | |
| --- | --- |
| **Files** | `apps/web/public/previews/linkedin-home-first-degree.webp`, `apps/web/public/previews/README.md` |
| **Test first** | Catalogue / guest-site test asserts preview path exists for new id. |
| **Implement** | Minimal valid WebP placeholder; README notes temporary until live capture. |
| **Verify** | `npm test --workspace=@prism/web` |

### Task 22 - Explore filters

| | |
| --- | --- |
| **Files** | `apps/web/src/lib/catalogue.test.ts` |
| **Test first** | `filterCatalogue(..., "linkedin.com")` returns only LinkedIn mod(s). Site chip count updated. |
| **Implement** | Adjust test expectations only if listing added correctly in task 20. |
| **Verify** | `npm test --workspace=@prism/web -- catalogue.test` |

---

## 7. Unit, phase, and integration tests (summary gate)

### Task 23 - Phase-g corpus alignment

| | |
| --- | --- |
| **Files** | `apps/extension/src/phase-g.test.ts` |
| **Test first** | Mod count and fixture paths include LinkedIn Home. |
| **Implement** | Wire any missing imports / paths. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-g.test` |

### Task 24 - Full unit suite

| | |
| --- | --- |
| **Files** | (all above) |
| **Test first** | n/a |
| **Implement** | Fix any regressions. |
| **Verify** | `npm test` |

---

## 8. E2E (Playwright)

### Task 25 - E2E fixture stub

| | |
| --- | --- |
| **Files** | `e2e/tracer-fixtures.ts`, `e2e/fixture-server.ts` (if new route needed) |
| **Test first** | n/a |
| **Implement** | Export `linkedinFeedFixture` from mod fixtures. Optional `stubLinkedinHtml` helper in `tracer-assertions.ts` (mirror `stubYoutubeHtml`). |
| **Verify** | Typecheck: `npx tsc -p e2e` if configured |

### Task 26 - E2E tracer assertion

| | |
| --- | --- |
| **Files** | `e2e/tracer-assertions.ts`, `e2e/tracers.spec.ts`, `e2e/tracers-firefox.spec.ts` |
| **Test first** | `test("LinkedIn Home fixture keeps 1st-degree posts and strips the rest")` expecting kept text visible and `[data-fixture-kind]` stripped/hidden. |
| **Implement** | `assertLinkedinHomeTracer(page)`; enable mod in extension test profile if required. |
| **Verify** | `npm run test:e2e -- tracers.spec` (or project script) |

---

## 9. Documentation cross-links

### Task 27 - Spec and runtime doc pointers

| | |
| --- | --- |
| **Files** | `docs/superpowers/specs/2026-09-08-linkedin-home-first-degree-design.md`, `Documentation/specs/2026-08-28-mod-package-and-runtime.md`, `apps/extension/README.md` |
| **Test first** | n/a |
| **Implement** | Spec: link to this plan. Runtime spec: add LinkedIn Home tracer row in three-tracer table (or footnote). Extension README: list `linkedin-home.ts` adapter. |
| **Verify** | Manual read; `npm test` unchanged |

---

## 10. Manual live `/feed` smoke checklist

Out of band; not CI-blocking. Run signed-in on a real account after tasks 1-26 merge.

| Step | Pass |
| --- | --- |
| Enable `prism.linkedin-home-first-degree` on `https://www.linkedin.com/feed`. | [ ] |
| 1st-degree connection post remains visible. | [ ] |
| Followed company/page post remains visible (no false strip). | [ ] |
| 2nd / 3rd-degree post hidden or removed. | [ ] |
| Promoted / Sponsored post stripped. | [ ] |
| Activity card ("X commented...") stripped when underlying author not allowlisted. | [ ] |
| PYMK / jobs / news module stripped. | [ ] |
| Scroll load (SPA insert) filters new cards within ~2s. | [ ] |
| Navigate to `/in/me` or messaging: mod does not break non-feed pages. | [ ] |
| Extension popup: mod active (not paused); degradation copy if feed missing. | [ ] |
| Disable mod: feed returns to stock LinkedIn. | [ ] |

---

## PR checklist (implementation PR, after coding)

- [ ] `linkedin.home.allowlist` registered and gated.
- [ ] Extractor + fixtures; no HTML in JSON.
- [ ] Allowlist hide/remove in place; SPA observer; fail-soft.
- [ ] Bundled mod + web `.prism` package + catalogue entry.
- [ ] `EMPTY_LISTING_STATS` only in production catalogue paths.
- [ ] `npm test` and e2e tracers green.
- [ ] Manual smoke checklist attached or waived by Bear.

## Task count

**27** implementation tasks (tasks 1-27), plus **11** manual smoke checks (section 10).
