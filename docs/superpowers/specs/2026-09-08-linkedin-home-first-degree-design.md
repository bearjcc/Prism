# LinkedIn Home first-degree feed filter

**Status:** approved  
**Date:** 2026-09-08  
**Mod id:** `linkedin-home-first-degree` (`prism.linkedin-home-first-degree`)

## Summary

Prism bundled mod that filters the signed-in LinkedIn Home feed (`linkedin.com/feed`) to show only original posts from first-degree connections and followed companies or pages. Everything else in the feed stream is stripped in place.

**Approach A (locked):** YouTube-Home-style allowlist filter. Mirror `mods/youtube-home-videos/` orchestration plus extension-owned Home allowlist extractors (`youtube.home.allowlist` pattern). Unlike YouTube Home, allowlisted LinkedIn posts stay as native DOM nodes; only non-allowlisted items are hidden or removed.

## Goals

- Reduce Home feed noise: no 2nd/3rd-degree posts, ads, reshares, or recommendation modules.
- Keep posts the user explicitly chose to follow (1st-degree people, followed companies/pages).
- Fail soft on DOM drift: surface a reason and keep retrying; do not burn the per-origin activation failure budget into a silent pause.
- Ship as a first-party bundled mod with catalogue entry, fixtures, and tests when implemented.

## Non-goals

- Profiles, search, messaging, notifications, jobs pages, or standalone company pages.
- Changing LinkedIn account settings, connection graph, or follow state.
- Replacing the feed with a custom Prism-owned layout (hide/remove non-allowlisted nodes only).
- Blocking network requests or injecting mod-authored CSS selectors against the whole page.
- Resolving ambiguous "maybe followed" entities without extractor evidence.

## User-visible behaviour

Applies only when the user is signed in on LinkedIn Home (`https://www.linkedin.com/feed` and equivalent Home routes). Other LinkedIn surfaces are untouched.

### Keep

| Item | Rule |
| --- | --- |
| First-degree person post | Original post card where the **original author** shows a 1st-degree badge (e.g. `• 1st` or equivalent first-connection indicator on the author line). |
| Followed company or page post | Original post card authored by a company or page the user follows: no 2nd/3rd/3rd+ badge on the author line, and not labelled Promoted or Sponsored. |

"Original post" means the primary content card, not a wrapper that only describes someone else's activity.

### Strip

| Category | Examples / signals |
| --- | --- |
| Extended network posts | Author line shows 2nd, 3rd, 3rd+, or equivalent non-first-degree badge. |
| Paid / amplified content | Promoted, Sponsored, or equivalent paid-placement labels. |
| Reshares and activity wrappers | Reshare cards; "X commented on…", "X likes…", and similar activity cards when the **underlying original author** is not allowlisted. |
| Home modules (non-post chrome) | People you may know, job recommendations, newsletters, LinkedIn News, and similar sidebar or in-feed modules that are not original posts from allowlisted authors. |

When a card is stripped, it is removed or hidden in place. The feed should not leave empty placeholders or broken layout where avoidable.

## Technical approach

### Capability and mod shape

| Piece | Detail |
| --- | --- |
| Capability id | `linkedin.home.allowlist` (new; registered in `packages/schema` alongside `youtube.home.allowlist`). |
| Mod package | `mods/linkedin-home-first-degree/` with `prism.yaml`, `src/index.ts`, `fixtures/`. |
| Mod activate | `prism.ui.allowlist("linkedin.home", "post")` (surface and item type names are implementation constants; spec locks capability family only). |
| Scopes | `https://www.linkedin.com/` (feed activation gated by URL/path checks in the extension). |
| Runtime | `native`, bundled first-party, catalogue entry on implementation. |

### Extension adapter (mirror YouTube Home)

1. **Feed discovery** — Locate the main Home feed container on `/feed` (signed-in). Use shadow-aware deep queries where LinkedIn nests content (`querySelectorAllDeep` or equivalent).
2. **Per-item classification** — For each feed child, run `extractLinkedinHome` to return structured JSON only (no HTML to the mod):
   - `allowlisted: boolean`
   - `reason`: e.g. `first-degree`, `followed-page`, `extended-network`, `promoted`, `activity-reshare`, `module`, `unknown`
   - Stable `id` for dedupe and ownership markers
3. **In-place filter** — Non-allowlisted children: `remove()` with hide fallback (`hidden`, `display: none`, `data-prism-owned="linkedin-home-hidden"`). Allowlisted children: leave DOM intact; mark owned where needed for refresh detection.
4. **SPA / late inserts** — `MutationObserver` plus existing surface-refresh hooks (`pageNeedsSurfaceRefresh` pattern) re-run classification when LinkedIn injects new feed items or modules.
5. **Undo** — Best-effort undo snapshot for small feeds (same policy as YouTube Home); skip on very large live feeds.

### Fail-soft and activation budget

LinkedIn DOM will drift. The allowlist path must **not** throw through `prism.ui.allowlist` on hostile or unexpected nodes.

| Requirement | Rationale |
| --- | --- |
| Extractor returns empty or `unknown` instead of throwing | Avoid counting benign drift as mod `activate` failures. |
| Classification errors hide individual items, not the whole mod | User keeps partial value while markup shifts. |
| Surface degradation reason in extension activity / popup when extractor cannot find feed or classifies zero items repeatedly | User sees "adapter mismatch" rather than a silent paused mod. |
| Do not consume `MOD_FAILURE_BUDGET` for extractor/allowlist soft failures | Prevents LinkedIn A/B markup from pausing the mod on the origin after three consecutive failures. Hard failures (mod script throw, missing grant) still follow existing pause rules. |

### Security and policy (unchanged Prism rules)

- Mod receives JSON from `prism.extract` / allowlist orchestration only; no `document`, `window`, `fetch`, or HTML strings from extractors.
- No mod CSS selectors over the full page; hiding is driven by extractor classification in extension code.
- Capability gate: `linkedin.home.allowlist` required in `prism.yaml`; off means no-op.

## Testing strategy

Test-driven, same bar as `mods/youtube-home-videos/` and `apps/extension/src/phase-e.test.ts`.

| Layer | Coverage |
| --- | --- |
| Mod unit | Activate calls only `prism.ui.allowlist("linkedin.home", "post")`; no other capabilities. |
| Extractor unit | Fixtures classify 1st-degree, followed page, 2nd/3rd, promoted, activity reshares, and modules correctly; JSON schema has no HTML fields. |
| Allowlist integration | Live-shaped fixture feed: allowlisted posts remain, stripped items removed or `data-prism-owned="linkedin-home-hidden"`; feed outside main column untouched. |
| Fail-soft | Broken feed child, detached node, or rejective DOM host does not throw through Prism API; mod stays active. |
| SPA refresh | Late-inserted feed child is classified on observer tick; `pageNeedsSurfaceRefresh` returns true for unlabelled children. |
| E2E (extension) | Bundled mod activates on `/feed` fixture URL; golden counts for kept vs stripped cards. |

Fixtures live under `mods/linkedin-home-first-degree/fixtures/` (sanitised captures of real feed structure; no credentials). Update fixtures when LinkedIn ship markup changes.

## Open risks

| Risk | Mitigation |
| --- | --- |
| LinkedIn DOM drift | Versioned extractor; fixture updates; fail-soft per-item hide; visible adapter-degraded state. |
| A/B markup and regional variants | Multiple selector paths; `unknown` bucket strips conservatively only when confidence is high for extended-network/promoted; activity cards resolve via underlying author walk. |
| "Followed page" without explicit badge | Heuristic: company/page actor line without degree badge and without promoted labels; document ambiguity in extractor tests. |
| Shadow DOM and lazy-loaded feed | Deep queries; wait for feed root with timeout (YouTube Home `waitForFeed` pattern); observer on feed subtree. |
| Activity cards masking original author | Walk inner author/subtitle nodes before classifying; strip when underlying author fails allowlist. |
| False positives hiding wanted posts | Golden tests for followed companies and 1st-degree edge cases; conservative promoted detection. |

## Implementation checklist

High-level only. Detailed TDD plan: [`docs/superpowers/plans/2026-09-08-linkedin-home-first-degree.md`](../plans/2026-09-08-linkedin-home-first-degree.md).

Detailed TDD plan: [`docs/superpowers/plans/2026-09-08-linkedin-home-first-degree.md`](../plans/2026-09-08-linkedin-home-first-degree.md).

- [ ] Add `linkedin.home.allowlist` to `packages/schema` capability registry and copy strings.
- [ ] Implement `apps/extension/src/extractors/linkedin-home.ts` (classification + feed discovery, shadow-aware).
- [ ] Wire `prism.ui.allowlist("linkedin.home", "post")` handler in `content-script.ts` (hide/remove, observer, `pageNeedsSurfaceRefresh`).
- [ ] Add `mods/linkedin-home-first-degree/` package (`prism.yaml`, `src/index.ts`, fixtures).
- [ ] Bundle mod in extension build; add catalogue entry in `apps/web/src/lib/catalogue.ts`.
- [ ] Unit and phase tests (mod activate, extractor, allowlist, fail-soft, SPA refresh).
- [ ] Capability summary and Explore preview metadata.
- [ ] Manual smoke on live signed-in `/feed` (out of band; not blocking spec PR).
