# Engine corpus (not shipped)

Private UserCSS, filter slices, and transcoded userscripts used as fixtures. `generate-bundled-mods` reads `mods/` only. Do not publish these packages.

Restore feedstock, then sync copies:

```
powershell -File scripts/restore-references.ps1
node scripts/sync-corpus-from-references.mjs
```

## Layout

- `usercss/` -- Stylus-shaped CSS in `styles/`. Sanitise should accept Wide GitHub / github-wide. Catppuccin LESS is a reject-path (`url(`, `@import`).
- `filters/` -- EasyList host-block slice for DNR; cosmetic `##` lines compile to hide instructions (not DNR).
- `userscripts/` -- Prism transcodes. Remaining unknown capability ids stay `reject-capability` with `test.fails` until the registry grows. Miniplayer close is `youtube.watch.constrainMiniplayer`.

Licence: `Documentation/corpus-licence.md`.
