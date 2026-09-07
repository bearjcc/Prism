# Prism site and extension UI design

**Status:** approved  
**Date:** 2026-09-07

## Goals

- Serve first-timers and power users on Firefox and Chromium with F-Droid-grade usability and speed.
- No fake social proof: production listings show honest empty stats (0 installs, rating null).
- Full progressive enhancement: with JavaScript off, home narrative, Explore filters, mod detail, and install links must work.
- Anti-AI-slop: quiet OSS / F-Droid / userstyles.world feel. Spectrum colour is a restrained accent, not rainbow glow on chrome.

## Out of scope

- Create page redesign.
- Fake installs, ratings, or view counts.
- Discover / Library naming (Explore is the only discovery label).

## Home

### Above the fold (~85% viewport, black)

- Keep the prism scene as the hero focal point.
- Refine the prism graphic so the white hotspot does not wash out top-right CTAs.
- Move HomeSteps (Install, Enable, Explore) to the **top-right** on desktop.
- Restyle steps as real buttons:
  - **Install** — primary solid button.
  - **Enable a mod**, **Explore** — secondary clear link-buttons with focus rings.
- On mobile, stack steps under the blurb.
- Scene animation is enhancement only (respect `prefers-reduced-motion`).

### Below the fold (SSR, no What/Why/How labels)

Three narrative sections:

1. **Secure mods for sites you already use** — copy plus a real preview strip linking to `/mods/[id]`.
2. **Nothing runs until you allow it** — default-deny posture and capability disclosure.
3. **Install / enable / reshape** — HTML list with real hrefs (extension install, Explore, Create).

Demote the five colour slabs to a thin spectrum accent strip (not full-height blocks).

## Explore and mod detail

### Cards

- Screenshot-first with **real** images at `/previews/{id}.webp` (not CSS ModShot scenes).
- Card fields: preview, name, author, site, summary, capability hint, installs, rating.
- Medium density grid.
- Honest stats: 0 installs and "No ratings" are correct in production.

### Filters (progressive enhancement)

- Native GET form (`method="get"` `action="/explore"`) with `q`, `sort`, and `site` fields.
- `searchParams` on `explore/page.tsx` drive server-side filtering so filters work with JS off.
- Stable sort tie-break when all install counts are zero.

### Mod detail

- Large preview image.
- Capabilities table, scopes, install panel with `.prism` download, provenance metadata.
- Same preview images as Explore cards.

## Extension popup

- Quiet OSS chrome in `apps/extension/targets/chrome/popup.css` (and Firefox if separate).
- Hairline borders, spectrum accent on mark and focus only.
- Clearer buttons, no glow. Prefer CSS-only changes.

## Visual tone

- Black ATF on home; light inner pages.
- Hairlines over heavy shadows.
- Spectrum as thin strip or small mark accent — never full-page rainbow glow.
- Readable type, touch-friendly targets, visible focus rings.

## Testing constraints

- `EMPTY_LISTING_STATS` in production; `TEST_LISTING_STATS` is Vitest-only.
- Explore form must render without client hydration for filter state.
- ModShot tests assert `img[src^="/previews/"]`.
