# Extension

**v1 product.** Chromium first. Firefox is a stub, not a second app.

Shared code: `src/`. Chrome manifest and unpacked load root: `targets/chrome/`.

Work queue: `Documentation/specs/2026-08-28-extension-v1-plan.md`.
Spec: `Documentation/specs/2026-08-28-mod-package-and-runtime.md`.

No desktop app, native host, or gateway is required.

## Load unpacked

From the repo root:

1. `npm install`
2. `npm run build` (TypeScript build plus `scripts/generate-bundled-mods.mjs`)

That writes the service worker, content script, popup, and bundled tracers into `apps/extension/targets/chrome/` (`dist/`, `bundled-mods/`, `bundled-mods.json`). There is no separate dist app folder to load.

3. Chromium: `chrome://extensions` (or Edge `edge://extensions`)
4. Enable Developer mode
5. Load unpacked and choose `apps/extension/targets/chrome`

Rebuild after mod or extension source changes, then click Reload on the extension card.

## Automated Chromium tests

Unit tests (`npm test`) do not launch a browser.

After `npm run build`, run `npm run test:e2e`. That starts Playwright, loads `targets/chrome` unpacked, and drives fixture pages (kitten slots, YouTube Home tiles, watch-page Reddit fallback). It does not hit live YouTube or Reddit. Install Chrome for Testing once with `npx playwright install chromium`. A later Puppeteer runner can reuse the same fixtures.

## Optional capabilities

Optional grants stay off until you enable them in the popup.

- **Reddit host prompt:** enable `reddit.comments.search` on `prism.youtube-reddit-comments`. Chromium then asks for `https://www.reddit.com/*`. Deny it and watch still works; the comments slot shows fallback copy.
- **Kitten egress:** `network.egress` on `prism.kitten-ad-replace` is off by default. Enabling it still goes through `prism.net.request` (the extension broker), not page `fetch`. Bundled kitten images remain the fallback.
- **DNR browser block:** `network.browser.block` compiles `filters/browser` into declarativeNetRequest rules for example third-party advert hosts. First-party YouTube adverts are slot work, not DNS.

The kitten mod is scoped to `<all_urls>` because advert slots are not one origin. The content script is installed on all URLs; the mod still only calls `visual.ad-slot.replace` on extracted handles. The popup explains this.

## Known breakage

- **YouTube DOM drift** is an adapter bug in the extension extractors (`youtube-home.ts`, `youtube-watch.ts`, ad-slot heuristics). It is not a reason to give a mod `querySelector`.
- **Reddit bot wall:** live `fetch` of reddit.com from the extension may be blocked. Record that as an engine issue. CI uses saved HTML fixtures and must not hit the live network.
- **Search uses `videoId`, not title.** `youtube.watch.videoId` returns `{ videoId }`. The Reddit tracer passes that id as the comment-search query.
- **`credentials: "omit"`** on the Reddit background `fetch`. The extractor does not send the signed-in Reddit cookie jar.
- **Comments cap** reuses `visual.ad-slot.replace` with extra kind and slot checks: only slot `youtube-comments`, and only `kind: "comments" | "message"` payloads after the Reddit optional grant path.

## Amy kitten journey (no desktop)

The bundled kitten tracer covers Search through Bob installs without a desktop runtime:

1. Amy searches bundled mods for advert replacement (`prism.kitten-ad-replace`).
2. The popup lists required slot replacement and optional network capabilities.
3. Amy reviews the package files and the all-sites disclosure.
4. Bob loads unpacked Chromium, enables the mod, and sees kittens in fixture slots.

Product story: `Documentation/amy-kitten-mod-journey.canvas.tsx` (ignore desktop as a runtime dependency). Package notes: `mods/kitten-ad-replace/README.md`.

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
