# Prism website (`apps/web`)

Public landing and community mods portal. First-party fixture listings until a registry exists. No Postgres.

Install counts and ratings come from the listing stats store. Dev and live start empty (zero installs, no ratings). Seeded numbers exist only in automated tests (`listing-stats.fixture.ts`).

Does not implement the Chromium extension. Do not change `apps/extension` from this package.

## Run

From the repo root:

```
npm install
npm run dev --workspace=@prism/web
```

Open http://localhost:3000

## Build

Root `npm run build` runs the extension TypeScript build, then `next build` for this app.

## Extension detect

If the extension sets `document.documentElement.dataset.prism = "1"`, Install becomes Installed. The website does not change extension code.

## Theme

`/` is always the black home scene. Other routes follow `prefers-color-scheme` plus a Light/Dark toggle (`localStorage` key `prism-theme`).
