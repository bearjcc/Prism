# Upload to Immich

Send images from any page to your self-hosted Immich library. The mod only declares `media.immich.contextUpload`; the extension owns the menu, bytes, and upload.

## Desktop (Chromium and Firefox)

When the mod is enabled, open the page context menu, choose **Prism**, then **Upload to Immich** on an image. Right-click alone does nothing until you pick that item. The entry sits alongside **Hide this element** under the same **Prism** submenu. It appears only for images (`contexts: image`).

If Immich is not configured yet, the menu item opens Prism settings at the Immich section instead of failing silently.

## Firefox for Android and other touch browsers

Firefox for Android does not support the extension `menus` / `contextMenus` API ([MDN browser-compat-data: `firefox_android` `version_added: false`](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/menus.json)). Extension items cannot join the native long-press menu.

Prism shows a small **Upload to Immich** button chip after you hold on an image for about half a second without moving much. The native long-press menu is not blocked. The chip closes on scroll, tap outside, or timeout. Tap the chip to start the same extension-owned upload.

Enable **Always use the touch upload chip** in Prism settings if you want the chip on desktop too.

## Setup

1. Enable **Upload to Immich** in the Prism popup.
2. Open **Prism settings**, section **Immich server**.
3. Server URL: base URL you use in the browser (for example `http://100.64.0.2:2283` on Tailscale). No `/api` suffix.
4. In Immich: **Account settings** then **API keys** then **New API key**. Enable at least **asset.upload**.
5. Paste the key, **Test connection**, then **Save**. The browser asks for host access to that Immich origin (`optional_host_permissions` plus `permissions.request` on your gesture). This works on Firefox for Android 120+ the same way as desktop Firefox 128+.

Settings and the API key live in extension local storage on the device. They are not logged, exported, or sent in activity events.

## Capability

Required: `media.immich.contextUpload`. Native code calls `prism.extract("media.immich.contextUpload")` once at activate so the extension registers UI. No API key, no `fetch`, no image bytes in the mod sandbox.

## Image bytes

| Source | Behaviour |
| ------ | --------- |
| Public `http(s):` | Background fetch with `credentials: "omit"`. Cross-origin may need a one-time host permission for the image origin. |
| `data:` | Decoded in the extension. |
| `blob:` | Read in the content script (`credentials: "omit"`). |
| Cookie-gated same-origin | Content script may retry with the page cookie jar to read bytes; cookies are not sent to Immich. |
| `srcset` / `currentSrc` | Uses `currentSrc` when it differs from the clicked URL. |

Duplicates from Immich count as success. Unsupported types and oversize files show a notification with a short reason.
