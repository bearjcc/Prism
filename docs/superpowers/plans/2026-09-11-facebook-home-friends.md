# Facebook Home friends-only feed filter - implementation plan

**Spec:** [`docs/superpowers/specs/2026-09-11-facebook-home-friends-design.md`](../specs/2026-09-11-facebook-home-friends-design.md)  
**Date:** 2026-09-11  
**Mod id:** `prism.facebook-home-friends`

## Entry criteria

- [x] 2026-09-11 Design spec approved by Bear.
- [x] 2026-09-11 Implementation plan written (this file).
- [ ] Existing test suites green on `master` before task 1.

## Conventions

- **TDD:** add or extend a failing test, implement the minimum to pass, commit in small slices.
- **Verify:** after each task, run the cited command; full suite before PR merge.
- **Pattern reference:** LinkedIn Home allowlist (`mods/linkedin-home-first-degree/`, `apps/extension/src/extractors/linkedin-home.ts`, `apps/extension/src/phase-l.test.ts`).
- **DCO:** every commit `Signed-off-by: Joseph C Caswell <bearjcc@users.noreply.github.com>`.

---

## 1. Schema - register `facebook.home.allowlist`

### Task 1 - Capability id in registry

| | |
| --- | --- |
| **Files** | `packages/schema/src/capabilities.ts`, `packages/schema/src/capabilities.test.ts` |
| **Test first** | Extend `CAPABILITY_IDS` expectation to include `"facebook.home.allowlist"` after `"linkedin.home.allowlist"`. Assert `resultSchema` with `required: ["items"]` and per-item `allowlisted`, `reason`, `id`. |
| **Implement** | Add capability id and registry entry mirroring LinkedIn Home item schema. |
| **Verify** | `npm test --workspace=@prism/schema -- capabilities.test` |

### Task 2 - Capability copy for marketplace

| | |
| --- | --- |
| **Files** | `apps/web/src/lib/capability-copy.ts`, `apps/web/src/lib/capability-copy.test.ts` |
| **Test first** | Assert `capabilitySummary("facebook.home.allowlist")` mentions Facebook Home and friends-only filtering. |
| **Implement** | Add `CAPABILITY_SUMMARIES["facebook.home.allowlist"]` entry. |
| **Verify** | `npm test --workspace=@prism/web -- capability` |

### Task 3 - Prism API gate

| | |
| --- | --- |
| **Files** | `apps/extension/src/prism-api.ts`, `apps/extension/src/prism-api.test.ts` |
| **Test first** | With grant `facebook.home.allowlist` only, `prism.ui.allowlist("facebook.home", "post")` records handler call; without grant, no-op. |
| **Implement** | Extend `ui.allowlist` to assert `facebook.home.allowlist` when `surface === "facebook.home"`. |
| **Verify** | `npm test --workspace=@prism/extension -- prism-api.test` |

---

## 2. Fixtures and extractor

### Task 4 - Static Home fixture (sanitised)

| | |
| --- | --- |
| **Files** | `mods/facebook-home-friends/fixtures/feed.html` |
| **Implement** | Minimal signed-in Home DOM: feed container, one friend post, sponsored, suggested, page, group, activity reshare, reels/PYMK module. Use `data-fixture-kind` attributes. |
| **Verify** | Loaded by extractor tests in task 6. |

### Task 5 - Live-shaped fixture

| | |
| --- | --- |
| **Files** | `mods/facebook-home-friends/fixtures/feed-live.html` |
| **Implement** | Second fixture mirroring shadow-heavy / nested wrappers. Same keep/strip coverage as `feed.html`. |
| **Verify** | Loaded by extractor tests in task 6. |

### Task 6 - Extractor unit tests

| | |
| --- | --- |
| **Files** | `apps/extension/src/extractors/facebook-home.test.ts` |
| **Test first** | Golden `allowlisted` / `reason` per `data-fixture-kind`; feed discovery; no HTML in JSON. |
| **Implement** | `apps/extension/src/extractors/facebook-home.ts` |
| **Verify** | `npm test --workspace=@prism/extension -- facebook-home.test` |

### Task 7 - Extractor schema / phase-g guard

| | |
| --- | --- |
| **Files** | `apps/extension/src/phase-g.test.ts` |
| **Test first** | Extend extractor JSON schema and handle tests for `facebook.home.allowlist`. |
| **Implement** | Wire `facebook.home.allowlist` in content-script `extract` handler. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-g.test` |

---

## 3. Content-script allowlist wiring

### Task 8 - Allowlist handler tests

| | |
| --- | --- |
| **Files** | `apps/extension/src/phase-h.test.ts` (new; mirror `phase-l.test.ts`) |
| **Test first** | Mod activate, fixture allowlist, URL gate, fail-soft, late feed, `pageNeedsSurfaceRefresh`. |
| **Implement** | `applyFacebookHomeAllowlist` and related helpers in `content-script.ts`. |
| **Verify** | `npm test --workspace=@prism/extension -- phase-h.test` |

---

## 4. Mod package

### Task 9 - `prism.yaml`, `src/index.ts`, README tracer list

| | |
| --- | --- |
| **Files** | `mods/facebook-home-friends/`, `mods/README.md`, `scripts/check-mods-engine.test.mjs` |
| **Verify** | `npm test -- scripts/check-mods-engine.test.mjs` |

---

## 5. Bundle, catalogue, e2e

### Task 10 - Bundle and web package

| | |
| --- | --- |
| **Files** | `scripts/generate-bundled-mods.mjs`, `scripts/generate-web-packages.mjs`, generated targets |
| **Verify** | `npm run build` and `npm test` |

### Task 11 - Catalogue and preview

| | |
| --- | --- |
| **Files** | `apps/web/src/lib/catalogue.ts`, tests, `apps/web/public/previews/facebook-home-friends.webp` |
| **Verify** | `npm test --workspace=@prism/web -- catalogue` |

### Task 12 - E2E tracer

| | |
| --- | --- |
| **Files** | `e2e/tracer-fixtures.ts`, `e2e/tracer-assertions.ts`, `e2e/tracers.spec.ts`, `e2e/tracers-firefox.spec.ts` |
| **Verify** | `npm run test:e2e -- tracers.spec` |

---

## PR checklist

- [ ] `facebook.home.allowlist` registered and gated.
- [ ] Extractor + fixtures; no HTML in JSON.
- [ ] Allowlist hide/remove in place; SPA observer; fail-soft.
- [ ] Bundled mod + web `.prism` package + catalogue entry.
- [ ] `EMPTY_LISTING_STATS` only in production catalogue paths.
- [ ] `npm test` and e2e tracers green.
- [ ] LinkedIn/YouTube behaviour unchanged.
