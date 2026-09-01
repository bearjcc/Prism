# Extension

**v1 product.** Chromium first. Firefox is an unpacked shim over the same `src/`, not a store-listed second app.

Shared code: `src/`. Chrome manifest and unpacked load root: `targets/chrome/`. Firefox unpacked root: `targets/firefox/`.

Work queue: `Documentation/specs/2026-08-28-extension-v1-plan.md`. Later Firefox-as-product (AMO listing) sits in `Documentation/specs/2026-08-29-later-plan.md`.
Spec: `Documentation/specs/2026-08-28-mod-package-and-runtime.md`.

No desktop app, native host, or gateway is required.

## Load unpacked

From the repo root:

1. `npm install`
2. `npm run build` (TypeScript build plus `scripts/generate-bundled-mods.mjs`)

That writes the service worker, content script, popup, and bundled tracers into `apps/extension/targets/chrome/` (`dist/`, `bundled-mods/`, `bundled-mods.json`) and the same pack into `apps/extension/targets/firefox/` (popup HTML and CSS are copied from Chrome; do not fork them). There is no separate dist app folder to load.

3. Chromium: `chrome://extensions` (or Edge `edge://extensions`)
4. Enable Developer mode
5. Load unpacked and choose `apps/extension/targets/chrome`

Firefox (temporary, not AMO):

1. Open `about:debugging#/runtime/this-firefox` (or Add-ons `about:addons` then Debug Add-ons / Load Temporary Add-on)
2. Load Temporary Add-on and choose `apps/extension/targets/firefox/manifest.json` (or the `targets/firefox` folder)

Rebuild after mod or extension source changes, then click Reload on the Chromium extension card, or reload the temporary add-on in Firefox.

The popup can also import a packed `.prism` zip (vanilla ZIP). The archive is validated with the same `prism.yaml` schema as bundled mods, stored in extension storage, and run through the capability gate. An imported id cannot replace a bundled tracer.

After install, pin Prism from the extensions menu. The toolbar badge is the count of enabled mods on the current tab (blank at zero). The popup lists mods that match this page first, including bundled mods that are still off. **Find mods for** this host opens the fixture Explore page (`http://localhost:3000/explore?q=`) with a search; Prism does not send the current site until that click. Right-click: Hide this element (this visit), Hide this element on this site (stored sanitised CSS), Pause Prism on this site. Mods cannot add context-menu items.

Mods with `runtime: native` (CSS, JSON/YAML, filter lists, and first-party `prism.*` JS shipped in this package) do **not** use `chrome.userScripts` and do **not** need Chromium's userscript toggle. Mods with `runtime: userscript` register only in the isolated `USER_SCRIPT` world, with `matches` equal to the package `scopes`. Remote `@require` / `http(s)` script URLs in the source are refused (fail closed; Prism does not fetch those bodies). If **Allow User Scripts** is off (Chrome 138+ extension details; older Chrome: Developer mode), that JavaScript is a no-op. CSS and DNR from the same package still apply when those capabilities are granted. The YAML flag is the Prism lock; omitting JS from the zip is optional packer convenience, not the security boundary. Unrestricted Tampermonkey-like MAIN-world execution is not shipped (historical Phase 9 review gate).

## Automated Chromium tests

Unit tests (`npm test`) do not launch a browser.

After `npm run build`, run `npm run test:e2e`. That starts Playwright, loads `targets/chrome` unpacked, and drives fixture pages (kitten slots, YouTube Home tiles, watch-page Reddit fallback). It does not hit live YouTube or Reddit. Install Chrome for Testing once with `npx playwright install chromium`. A later Puppeteer runner can reuse the same fixtures.

## Optional capabilities

Optional grants stay off until you enable them in the popup.

- **Reddit host prompt:** enable `reddit.comments.search` on `prism.youtube-reddit-comments`. Chromium then asks for `https://www.reddit.com/*`. Deny it and watch still works; the comments slot shows fallback copy.
- **SponsorBlock skip times:** `youtube.watch.sponsorSegments` fetches `https://sponsor.ajay.app/api/skipSegments` from the service worker (`credentials: "omit"`). The mod receives `{ segments: { category, actionType, start, end }[] }` JSON. The extension seeks `video.html5-main-video` (then `video.video-stream`, then `video`) across those skip ranges; the mod never receives the media element. Enable a packed corpus mod that requires this cap and Chromium asks for `https://sponsor.ajay.app/*`. CI uses `corpus/userscripts/sponsorblock-segments/fixtures/skip-segments.json`; it must not hit the live API.
- **Kitten egress:** `network.egress` on `prism.kitten-ad-replace` is off by default. Enabling it still goes through `prism.net.request` (the extension broker), not page `fetch`. Bundled kitten images remain the fallback.
- **DNR browser block:** `network.browser.block` compiles `filters/browser` into declarativeNetRequest rules for example third-party advert hosts. First-party YouTube adverts are slot work, not DNS.

The popup lists required slot replacement and optional network capabilities. **Disable on this site** records an exact-origin exception (content mods skip that origin; DNR excludes it as an initiator) without turning the mod off globally. **Allow once this session** is the same skip for the current service-worker lifetime only: it is held in worker memory, not `chrome.storage.local`, and vanishes when the worker dies or the control is cleared. Behaviour policies have the same session skip beside the lasting origin override.

If a native mod's `activate` throws three times in a row on one origin (`MOD_FAILURE_BUDGET`), Prism pauses that mod on that origin only. The popup shows **Paused on this site after repeated failures** with **Resume on this site**. Pause and resume do not change grants. Sibling mods and other origins stay active. One throwing mod cannot fail the page or other mods.

## Known breakage

- **YouTube DOM drift** is an adapter bug in the extension extractors (`youtube-home.ts`, `youtube-watch.ts`, ad-slot heuristics). It is not a reason to give a mod `querySelector`.
- **SPA navigations** (YouTube `history.pushState` / `yt-navigate-finish`) abort the previous activation and run again for the new URL. Home vs watch scopes still apply.
- **YouTube autonav:** `youtube.watch.constrainAutoplay` clicks `.ytp-autonav-toggle-button` when `aria-checked="true"` and drops `autoplay` on `video.html5-main-video`. The mod receives `{ constrained, kind }` JSON, never the player element. The corpus transcode is `prism.corpus.youtube-autoplay-off`.
- **YouTube end screens:** `youtube.watch.constrainEndScreens` hides `.ytp-endscreen-content`, `.ytp-ce-element`, and `.ytp-cards-teaser` (plus labelled `data-prism-endscreen` fixtures). The mod receives `{ constrained, kind }` JSON, never overlay HTML. The corpus transcode is `prism.corpus.youtube-endscreen-off`.
- **YouTube miniplayer:** `youtube.watch.constrainMiniplayer` clicks `.ytp-miniplayer-close-button` when present and hides `ytd-miniplayer`, `#miniplayer`, and `.ytp-miniplayer-ui` (plus labelled `data-prism-miniplayer` fixtures). The mod receives `{ constrained, kind }` JSON, never miniplayer HTML. The corpus transcode is `prism.corpus.youtube-miniplayer-off`.
- **Live ad slots:** besides `data-prism-ad-slot` fixtures, the extractor labels `ytd-ad-slot-renderer`, `ytd-display-ad-renderer`, `ytd-in-feed-ad-layout-renderer`, `ytd-promoted-sparkles-web-renderer`, `ytd-player-legacy-desktop-watch-ads-renderer`, `ytd-action-companion-ad-renderer`, `ytd-promoted-video-renderer`, `.ytp-ad-player-overlay`, `ins.adsbygoogle`, and `#masthead-ad`. Handles only; page HTML is never given to mods. `kind: "message"` hides an ad slot with extension-owned copy (kitten still uses bundled images).
- **Reddit feed keywords:** `reddit.feed.posts` returns `{ posts: { id, title }[] }` JSON from labelled feed units (`shreddit-post`, `data-testid="post-container"`, old Reddit `.thing.link`). The corpus Reddit++ transcode hides matching titles with `visual.hide` CSS against those handles. The mod never sees post HTML.
- **Reddit bot wall:** live `fetch` of reddit.com from the extension may be blocked. Record that as an engine issue. CI uses saved HTML fixtures and must not hit the live network.
- **Search uses `videoId`, not title.** `youtube.watch.videoId` returns `{ videoId }`. The Reddit tracer passes that id as the comment-search query.
- **`credentials: "omit"`** on the Reddit background `fetch`. The extractor does not send the signed-in Reddit cookie jar.
- **Comments cap** reuses `visual.ad-slot.replace` with extra kind and slot checks: only slot `youtube-comments`, and only `kind: "comments" | "message"` payloads after the Reddit optional grant path.

## Behaviour policies (MV3 / Firefox)

Global policies (paste, popup suppress, title freeze, scroll-lock, labelled overlay hide, labelled consent reject, autoplay) run in the isolated world of the content script. They are browser preferences, not mod capabilities.

- Overlay hide matches only `[data-prism-modal]` and `[data-prism-chatbot]`. It does not inject a page-wide CSS dump. A page-world script that rebuilds those nodes can flash until the next MutationObserver pass.
- Consent rejection clicks `[data-prism-consent-reject]` and `[data-prism-consent-dismiss]` through an extension-internal same-origin allowlist, then hides `[data-prism-consent]`. Off-list action names are refused. Mods still cannot click arbitrary elements. This is not a GDPR or ePrivacy legal implementation.
- Autoplay constraint runs in the content-script isolated world: it reuses watch autonav / `html5-main-video` helpers and also drops `autoplay` on fixture `<video>` / `<audio>`. A MutationObserver covers late autonav and autoplay attributes. Site-owned players that start media from page JS without those attributes are not fully gated. Chromium MV3 and Firefox unpacked share this limit; neither ships a MAIN-world userscript to wrap HTMLMediaElement.play.
- Chromium MV3 does not wrap the page world's `window.open` without a MAIN-world script, which this pack does not ship. Isolated-world `window.open` wrapping and `navigator.userActivation` are best-effort. Firefox unpacked uses the same `src/` and the same isolated-world limit; it is not a second enforcement engine.
- Userscript mods still need Chromium **Allow User Scripts**. Behaviour policies do not use `userScripts` and do not add an `eval` path for mods.

## Amy kitten journey (no desktop)

The bundled kitten tracer covers Search through Bob installs without a desktop runtime:

1. Amy searches bundled mods for advert replacement (`prism.kitten-ad-replace`).
2. The popup lists required slot replacement and optional network capabilities.
3. Amy reviews the package files and the all-sites disclosure.
4. Bob loads unpacked Chromium, enables the mod, and sees kittens in fixture slots.

Package notes: `mods/kitten-ad-replace/README.md`.

## Traceability

Three bundled mods map to spec sections in `Documentation/specs/2026-08-28-mod-package-and-runtime.md`:

| Mod id                          | Directory                      | Spec section                                      |
| ------------------------------- | ------------------------------ | ------------------------------------------------- |
| `prism.kitten-ad-replace`       | `mods/kitten-ad-replace`       | Three tracer mods / 1. Kitten ad replacement      |
| `prism.youtube-home-videos`     | `mods/youtube-home-videos`     | Three tracer mods / 2. YouTube Home videos only   |
| `prism.youtube-reddit-comments` | `mods/youtube-reddit-comments` | Three tracer mods / 3. Reddit comments on YouTube |

Architecture invariants in that spec still hold for these tracers:

- Default deny per mod.
- Data: mods do not add primitives (`eval`, page `fetch`, `document`, extractor HTML).
- Every gate decision can be logged (tests assert activity events).
- Undo for reversible DOM changes (popup Undo last change).
- No hosted service required.
- Trust is not for sale.

## Mod safety layers

Prism treats local and imported packages as untrusted, including packages
written or built with an AI agent. The shared whitelist inspector runs at
author/import, pack/CI, and runtime boundaries. CSS and browser filters fail
closed, unsupported DNS and gateway trees are refused, and native JavaScript
is limited to reviewed `prism.*` orchestration.

Native mod code runs in a sandboxed iframe without same-origin access. The
content script keeps ownership of page DOM, browser APIs, cookies, extractor
parsing, and network brokers. Capability denials are safe no-ops and still
produce activity events. Required capabilities and optional host permissions
still need explicit grants.

Userscripts remain a separate, explicitly labelled runtime. They run only in
the restricted `USER_SCRIPT` world, within declared scopes, with remote script
dependencies refused. Prism does not describe userscripts as DOM-safe.

See `Documentation/specs/2026-09-01-mod-policy-layers.md` and ADR 0005 for
the local and future community-package workflow.
