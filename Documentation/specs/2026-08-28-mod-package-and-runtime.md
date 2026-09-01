# Mod package and extension runtime (v1)

## Status

Accepted. 2026-08-28. Pairs with ADR 0002.

## What a `.prism` is

Not a programming language. Not JSX.

**Authoring:** a directory of ordinary files.

**Release:** the same tree after TypeScript compile, hashed, as a **vanilla ZIP** named `*.prism` (7-Zip opens it).

The extension loads **either** an unpacked directory (dev: files copied into the extension package at build) **or** a zip. Layout is identical.

```
mods/<id>/
  prism.yaml              # identity, runtime, capabilities, scopes, deps
  src/index.ts            # optional; native orchestration only
  styles/                 # CSS; UserCSS import lands here after sanitise
  assets/
  fixtures/
  filters/browser/        # optional ABP/uBO-style lists -> DNR + cosmetic
```

v1 does **not** ship `filters/dns/` or `gateway/`. If those directories exist, the extension ignores them.

Runtime field:

- `runtime: native` -- `prism.*` plus CSS plus optional browser filters. Extension-owned code. Does not use `chrome.userScripts`. Chromium's Allow User Scripts toggle is not required.
- `runtime: userscript` -- page JavaScript registered with `chrome.userScripts`. The author must set this flag. If it is off, the loader never registers or `import()`s that JS even when `src/index.js` is in the zip. Pack still compiles TypeScript (simple bundler). If the flag is on but the user has not enabled Allow User Scripts (Chrome 138+ extension details; older Chrome: Developer mode), the script is a no-op; CSS and DNR from the same package still apply when those capabilities are granted.

Trust labels in the popup: **CSS** (styles only), **CSS + JSON** (native declarative / `prism.*` engine), **Userscript** (needs the Chrome toggle).

Compiled JS in the zip is what *may* run. TypeScript is never `eval`'d.
Native package source passes the shared whitelist inspector before it can be
packed or activated. Pack policy findings are errors, not warnings. Runtime
capability gating and DOM isolation remain enforcement boundaries when an
earlier package check is bypassed.

## Capabilities

Android model:

- `capabilities.required` -- install must grant or the mod does not activate.
- `capabilities.optional` -- off until the user enables; mod must remain useful.

Missing grant: method is a safe no-op and emits a denied activity event.
Required missing grants still prevent activation. Obfuscation does not bypass
the gate.

v1 families used by tracers:

| Id                       | Use                                                                   |
| ------------------------ | --------------------------------------------------------------------- |
| `visual.ad-slot.replace` | Kitten: replace detected ad slots with bundled images                 |
| `visual.hide`            | Hide matched semantic or selector-backed slots                        |
| `network.browser.block`  | DNR block of declared hosts (optional for kitten)                     |
| `network.egress`         | Field-level connector (optional kitten remote images; off by default) |
| `youtube.home.allowlist` | Home feed: only video items from the extractor                        |
| `youtube.watch.videoId`  | Watch page video id                                                   |
| `reddit.comments.search` | Cross-site comments JSON for a query                                  |

`reddit.comments.search` is **optional**. YouTube watch UI works without it.

Mods **must not** receive `document`, `window`, `fetch`, or HTML strings from extractors.

## `prism.*` (native)

Exact exports live in `packages/schema` as TypeScript types and in the extension as the gate. Shape:

- `prism.slots.replace(slot: AdSlotHandle, content: TrustedReplacement): void`
- `prism.styles.apply(cssText: string): void` -- sanitised CSS only
- `prism.ui.allowlist(surface: SurfaceId, itemType: ItemType): void`
- `prism.extract(capabilityId: string, input?: object): Promise<unknown>` -- only ids granted; result is JSON matching the capability schema
- `prism.net.request(contractId: string): Promise<BrokeredResponse>` -- only declared egress contracts

Site adapters (YouTube Home, YouTube Watch, generic ad-slot) are **extension code**, versioned with the extension.

## Three tracer mods

### 1. Kitten ad replacement (`mods/kitten-ad-replace`)

Blocklist-style: ads go away; kittens appear.

- Required: `visual.ad-slot.replace`, bundled images under `assets/`.
- Optional: `network.egress` for a remote image pool; `fallback` bundled; disabled by default.
- Optional: `network.browser.block` for known third-party ad hosts in `filters/browser/`.
- Must not click ads or forge rewards.
- Fixtures: HTML with labelled ad slots; golden: slots replaced, no network.

### 2. YouTube Home videos only (`mods/youtube-home-videos`)

Allowlist-style: if the user asked for videos, the UI is videos. Not shorts, ads, promotions, posts, polls, chatbots.

- Required: `youtube.home.allowlist`.
- Extractor in the extension returns `{ videos: VideoItem[] }`. The mod mounts only that.
- Fixtures: captured Home structure (sanitised); golden: only video tiles remain.

YouTube's DOM will drift. Adapter version and fixture update are engine work, not a reason to give the mod `querySelector`.

### 3. Reddit comments on YouTube (`mods/youtube-reddit-comments`)

Cross-site interaction without a public API key.

- Required: `youtube.watch.videoId`, `visual` comments-slot replace.
- Optional: `reddit.comments.search`.
- Extractor in the extension: uses host permissions to fetch Reddit **in the background**, parses HTML **inside the extension**, returns `{ comments: Comment[] }`. The mod never sees HTML or cookies.
- User must grant Reddit host access (Chrome permission prompt) when enabling the optional cap.
- Deny Reddit: YouTube comments slot shows a disabled/fallback state, watch page still works.

Do not open a hidden window of the user's profile for this. `fetch` from the extension with `host_permissions` plus a first-party parser is the v1 path. If Reddit blocks that, record it as an engine issue; do not fall back to injecting a community userscript into reddit.com.

## UserCSS import (not a tracer, but format-locked)

Sanitise CSS: reject `url(`, `@import`, update URLs. Wizard can wait. Pack: name + CSS file -> `prism.yaml` + `styles/`.

After sanitise, `mapUserCss` classifies top-level hide declarations (`display: none`, `visibility: hidden`, `content-visibility: hidden`) as `visual.hide` instructions (selector + declaration). Remaining safe CSS is the `prism.styles.apply` payload. `@media` and other at-rules stay on that payload. Native packages with `styles/` still declare `visual.hide`; the loader applies styles only through `prism.styles.apply`, which asserts that capability. There is no CSS injection path without it.

## Security invariants (review-blocking)

- Default deny per mod.
- Data: mods do not add primitives.
- Every gate decision can be logged (activity UI may be minimal in v1; tests must see the event).
- Undo for reversible DOM changes.
- No hosted service required.
- Trust is not for sale (unchanged).
