# Prism website (`apps/web`)

Public landing and mod marketplace for first-party Prism tracer mods. No Postgres.

The catalogue lists the three bundled mods under `mods/` (`prism.kitten-ad-replace`, `prism.youtube-home-videos`, `prism.youtube-reddit-comments`). Listing pages show package id, scopes, capabilities, and install steps. Downloadable `.prism` archives are generated into `public/packages/` during `npm run build`.

Install counts and ratings come from the listing stats store. Dev and live start empty (zero installs, no ratings). Seeded numbers exist only in automated tests (`listing-stats.fixture.ts`).

Does not implement the Chromium extension. Do not change `apps/extension` from this package.

## Run

From the repo root:

```
npm install
npm run build
npm run dev --workspace=@prism/web
```

Open http://localhost:3000/explore

## Build

Root `npm run build` runs the extension TypeScript build, packs bundled mods, writes marketplace `.prism` downloads (`scripts/generate-web-packages.mjs`), then `next build` for this app.

## Extension detect

If the extension sets `document.documentElement.dataset.prism = "1"`, install copy switches to enabling the bundled mod in the popup. The website does not change extension code.

## Theme

`/` is always the black home scene. Other routes follow `prefers-color-scheme` plus a Light/Dark toggle (`localStorage` key `prism-theme`).
