# Firefox target

Thin MV3 manifest over `apps/extension/src`. `npm run build` (via `scripts/generate-bundled-mods.mjs`) writes `dist/`, `bundled-mods/`, `bundled-mods.json`, and copies `popup.html` / `popup.css` from `targets/chrome`. Chromium remains the v1 product; AMO listing is later.
