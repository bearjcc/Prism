# Prism website (`apps/web`)

Public landing and mod marketplace for first-party Prism tracer mods.

The catalogue lists the three bundled mods under `mods/` (`prism.kitten-ad-replace`, `prism.youtube-home-videos`, `prism.youtube-reddit-comments`). Listing pages show package id, scopes, capabilities, and install steps. Downloadable `.prism` archives are generated into `public/packages/` during `npm run build`.

Install counts and ratings come from the listing stats store. Dev and live start empty (zero installs, no ratings). Seeded numbers exist only in automated tests (`listing-stats.fixture.ts`).

Sign-in uses Auth.js (NextAuth v5) with GitHub and Google OAuth. Sessions are HttpOnly JWT cookies. Browse, search, download, and install stay anonymous; sign-in is required only to comment, rate, or publish.

Does not implement the Chromium extension. Do not change `apps/extension` from this package.

## Run

From the repo root:

```
npm install
npm run build
npm run dev --workspace=@prism/web
```

Open http://localhost:3000/explore

### Local sign-in

1. Generate a secret: `openssl rand -base64 32`
2. Create a `.env.local` file in `apps/web/` (not committed):

```
AUTH_SECRET=<output from openssl>
AUTH_URL=http://localhost:3000
AUTH_GITHUB_ID=<GitHub OAuth app client id>
AUTH_GITHUB_SECRET=<GitHub OAuth app client secret>
AUTH_GOOGLE_ID=<Google OAuth client id>
AUTH_GOOGLE_SECRET=<Google OAuth client secret>
```

3. Restart `npm run dev --workspace=@prism/web` and open http://localhost:3000/signin

At least one provider plus `AUTH_SECRET` must be set or the sign-in page explains that OAuth is not configured.

## OAuth app setup

### GitHub OAuth App

1. GitHub -> Settings -> Developer settings -> OAuth Apps -> New OAuth App
2. Application name: `Prism (web)` (or similar)
3. Homepage URL: `https://webprism.app`
4. Authorization callback URL:
   - Production: `https://webprism.app/api/auth/callback/github`
   - Local dev: `http://localhost:3000/api/auth/callback/github`
5. Copy Client ID -> `AUTH_GITHUB_ID`, generate Client Secret -> `AUTH_GITHUB_SECRET`

### Google Cloud OAuth client

1. Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client ID
2. Application type: Web application
3. Authorised JavaScript origins:
   - `https://webprism.app`
   - `http://localhost:3000` (local dev)
4. Authorised redirect URIs:
   - Production: `https://webprism.app/api/auth/callback/google`
   - Local dev: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID -> `AUTH_GOOGLE_ID`, Client secret -> `AUTH_GOOGLE_SECRET`

## Railway environment variables

Set these on the `@prism/web` service (monorepo root build):

| Variable | Required | Purpose |
|----------|----------|---------|
| `AUTH_SECRET` | Yes | Session signing secret (`openssl rand -base64 32`) |
| `AUTH_URL` | Yes (production) | Canonical site URL, e.g. `https://webprism.app` |
| `AUTH_TRUST_HOST` | Recommended on Railway | `true` - trust `X-Forwarded-Host` from the proxy |
| `AUTH_GITHUB_ID` | One provider min | GitHub OAuth client ID |
| `AUTH_GITHUB_SECRET` | With GitHub | GitHub OAuth client secret |
| `AUTH_GOOGLE_ID` | One provider min | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | With Google | Google OAuth client secret |

Do not commit secrets. Callback paths are fixed by Auth.js:

- `https://webprism.app/api/auth/callback/github`
- `https://webprism.app/api/auth/callback/google`

## Build

Root `npm run build` runs the extension TypeScript build, packs bundled mods, writes marketplace `.prism` downloads (`scripts/prepare-web-build.mjs`), then `next build` for this app.

`npm run build:web` is the Railway entry point: it builds from the monorepo root so `mods/` and `@prism/schema` are available. The web workspace `prebuild` also runs `prepare-web-build.mjs`, so `npm run build --workspace=@prism/web` generates downloads without a full extension build.

Railway should use monorepo root `/` with `railwayConfigFile` `/apps/web/railway.toml` (see that file for `build:web` and watch paths). An isolated `/apps/web` root skips mod sources and leaves `/packages/*.prism` missing in production.

## Extension detect

If the extension sets `document.documentElement.dataset.prism = "1"`, install copy switches to enabling the bundled mod in the popup. The website does not change extension code.

## Theme

`/` is always the black home scene. Other routes follow `prefers-color-scheme` plus a Light/Dark toggle (`localStorage` key `prism-theme`).

## Hosted sync (follow-up)

Account-backed mod enablement and preference sync needs a control API and Postgres per ADR 0009 and `Documentation/specs/2026-09-01-community-store-accounts-sync.md`. This change lands OAuth sessions first; sync is a separate phase once `apps/control` and storage exist.
