# Facebook Home friends-only feed filter

**Status:** approved  
**Date:** 2026-09-11  
**Mod id:** `facebook-home-friends` (`prism.facebook-home-friends`)

## Summary

Prism bundled mod that filters the signed-in Facebook Home feed (`facebook.com` `/` and equivalent Home routes) to show only original posts from Friends. Everything else in the feed stream is stripped in place.

**Approach A (locked):** LinkedIn-Home-style allowlist filter. Mirror `mods/linkedin-home-first-degree/` orchestration plus extension-owned Home allowlist extractors (`facebook.home.allowlist` pattern). Allowlisted Facebook posts stay as native DOM nodes; only non-allowlisted items are hidden or removed.

## Goals

- Reduce Home feed noise: no ads, suggested posts, Pages, Groups, Reels trays, PYMK, or reshares from non-Friends.
- Keep original posts whose author is a Friend.
- Fail soft on DOM drift: surface a reason and keep retrying; do not burn the per-origin activation failure budget into a silent pause.
- Ship as a first-party bundled mod with catalogue entry, fixtures, and tests.

## Non-goals

- Profiles, Messenger, Marketplace, Groups pages, Watch, notifications, or other Facebook surfaces.
- Changing Facebook account settings, friend graph, or follow state.
- Replacing the feed with a custom Prism-owned layout (hide/remove non-allowlisted nodes only).
- Blocking network requests or injecting mod-authored CSS selectors against the whole page.
- Keeping Page posts even when the user follows the Page.

## User-visible behaviour

Applies only when the user is signed in on Facebook Home (`https://www.facebook.com/` and equivalent Home routes). Other Facebook surfaces are untouched.

### Keep

| Item | Rule |
| --- | --- |
| Friend post | Original post card where the **original author** shows a Friend indicator (e.g. `Friends` relationship label, `aria-label` containing friend, or equivalent friendship badge on the author line). |

"Original post" means the primary content card, not a wrapper that only describes someone else's activity.

### Strip

| Category | Examples / signals |
| --- | --- |
| Paid / amplified content | Sponsored, Ad, or equivalent paid-placement labels. |
| Suggested content | Suggested for you, recommended post modules. |
| Pages | Posts authored by Pages, including Pages the user follows. |
| Groups | Group posts surfaced in Home. |
| Feed modules | Reels trays, People You May Know, and similar recommendation chrome that are not original Friend posts. |
| Reshares and activity wrappers | "X shared", "X commented on", and similar activity cards when the **underlying original author** is not a Friend. |

When a card is stripped, it is removed or hidden in place. The feed should not leave empty placeholders or broken layout where avoidable.

## Technical approach

### Capability and mod shape

| Piece | Detail |
| --- | --- |
| Capability id | `facebook.home.allowlist` (new; registered in `packages/schema` alongside `linkedin.home.allowlist`). |
| Mod package | `mods/facebook-home-friends/` with `prism.yaml`, `src/index.ts`, `fixtures/`. |
| Mod activate | `prism.ui.allowlist("facebook.home", "post")`. |
| Scopes | `https://www.facebook.com/*` (Home activation gated by URL/path checks in the extension). |
| Runtime | `native`, bundled first-party, catalogue entry on implementation. |

### Extension adapter (mirror LinkedIn Home)

1. **Feed discovery** - Locate the main Home feed container on `/` (signed-in). Use shadow-aware deep queries where Facebook nests content.
2. **Per-item classification** - For each feed child, run `extractFacebookHome` to return structured JSON only (no HTML to the mod):
   - `allowlisted: boolean`
   - `reason`: e.g. `friend`, `sponsored`, `suggested`, `page`, `group`, `module`, `activity-reshare`, `unknown`
   - Stable `id` for dedupe and ownership markers
3. **In-place filter** - Non-allowlisted children: `remove()` with hide fallback (`hidden`, `display: none`, `data-prism-owned="facebook-home-hidden"`). Allowlisted children: leave DOM intact; mark owned where needed for refresh detection.
4. **SPA / late inserts** - `MutationObserver` plus existing surface-refresh hooks re-run classification when Facebook injects new feed items or modules.
5. **Undo** - Best-effort undo snapshot for small feeds (same policy as LinkedIn Home); skip on very large live feeds.

### Fail-soft and activation budget

Facebook DOM will drift. The allowlist path must **not** throw through `prism.ui.allowlist` on hostile or unexpected nodes.

| Requirement | Rationale |
| --- | --- |
| Extractor returns empty or `unknown` instead of throwing | Avoid counting benign drift as mod `activate` failures. |
| Classification errors hide individual items, not the whole mod | User keeps partial value while markup shifts. |
| Surface degradation reason in extension activity / popup when extractor cannot find feed or classifies zero items repeatedly | User sees "adapter mismatch" rather than a silent paused mod. |
| Do not consume `MOD_FAILURE_BUDGET` for extractor/allowlist soft failures | Prevents Facebook A/B markup from pausing the mod on the origin after three consecutive failures. |

### Security and policy (unchanged Prism rules)

- Mod receives JSON from `prism.extract` / allowlist orchestration only; no `document`, `window`, `fetch`, or HTML strings from extractors.
- No mod CSS selectors over the full page; hiding is driven by extractor classification in extension code.
- Capability gate: `facebook.home.allowlist` required in `prism.yaml`; off means no-op.

## Testing strategy

Test-driven, same bar as `mods/linkedin-home-first-degree/` and `apps/extension/src/phase-l.test.ts`.

| Layer | Coverage |
| --- | --- |
| Mod unit | Activate calls only `prism.ui.allowlist("facebook.home", "post")`; no other capabilities. |
| Extractor unit | Fixtures classify friend, sponsored, suggested, page, group, module, and activity reshares correctly; JSON schema has no HTML fields. |
| Allowlist integration | Live-shaped fixture feed: allowlisted posts remain, stripped items removed or `data-prism-owned="facebook-home-hidden"`; feed outside main column untouched. |
| Fail-soft | Broken feed child, detached node, or rejective DOM host does not throw through Prism API; mod stays active. |
| SPA refresh | Late-inserted feed child is classified on observer tick; `pageNeedsSurfaceRefresh` returns true for unowned children. |
| E2E (extension) | Bundled mod activates on Home fixture URL; golden counts for kept vs stripped cards. |

Fixtures live under `mods/facebook-home-friends/fixtures/` (sanitised structure with `data-fixture-kind` markers; no credentials). Update fixtures when Facebook ships markup changes.

## Open risks

| Risk | Mitigation |
| --- | --- |
| Facebook DOM drift | Versioned extractor; fixture updates; fail-soft per-item hide; visible adapter-degraded state. |
| A/B markup and regional variants | Multiple selector paths; `unknown` bucket; activity cards resolve via underlying author walk. |
| Friend indicator ambiguity | Heuristic: `Friends` label, `data-friend-indicator`, aria labels; document ambiguity in extractor tests. |
| Shadow DOM and lazy-loaded feed | Deep queries; wait for feed root with timeout; observer on feed subtree. |
| Activity cards masking original author | Walk inner author/subtitle nodes before classifying; strip when underlying author fails allowlist. |
| Page vs personal profile without clear badge | Strip when page/group/module signals present; friend indicator required for allowlist. |

## Implementation checklist

High-level only. Detailed TDD plan: [`docs/superpowers/plans/2026-09-11-facebook-home-friends.md`](../plans/2026-09-11-facebook-home-friends.md).

- [ ] Add `facebook.home.allowlist` to `packages/schema` capability registry and copy strings.
- [ ] Implement `apps/extension/src/extractors/facebook-home.ts` (classification + feed discovery, shadow-aware).
- [ ] Wire `prism.ui.allowlist("facebook.home", "post")` handler in `content-script.ts` (hide/remove, observer, `pageNeedsSurfaceRefresh`).
- [ ] Add `mods/facebook-home-friends/` package (`prism.yaml`, `src/index.ts`, fixtures).
- [ ] Bundle mod in extension build; add catalogue entry in `apps/web/src/lib/catalogue.ts`.
- [ ] Unit and phase tests (mod activate, extractor, allowlist, fail-soft, SPA refresh).
- [ ] Capability summary and Explore preview metadata.
