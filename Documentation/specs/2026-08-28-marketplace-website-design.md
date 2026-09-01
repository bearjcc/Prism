# Marketplace website design

## Status

Accepted for parallel build. 2026-08-28. Product and visual design for `apps/web`.

Fixture catalogue in `apps/web` (no hosted registry yet). Do not edit `apps/extension` from website work. Chrome Web Store listing and Postgres/Meilisearch are still later.

Pairs with: ADR 0001 (licence, money), ADR 0002 (extension-first), `Documentation/specs/2026-08-27-implementation-plan.md` Phase 11-12, `Documentation/architecture.md` (trust, UserCSS, userscripts, subscriptions).

## Job

People browse, install, comment on, rate, and publish Prism mods. The site is the install funnel and public search. It has no DNS or host privilege. Only the search query reaches the registry: no history, installed-mod list, or local policy.

0-hour user: understand Prism in about 30 seconds, get the extension or open Explore.

200-hour user: live on Explore and mod pages. No promotional chrome between pages. Density and sorts like UserStyles.world Explore, not Chrome Web Store featured noise.

## Visual targets

Craft: UserStyles.world catalogue job + Raycast Store polish (one type scale, one radius, hairline surfaces, intentional hover). Not Tweeks marketing chrome. Not Greasy Fork 2010s tables.

Brand field: white, black, prism light. Material reference: liquid iridescent crystal (soft facets, mixed spectrum, rim light), not Dark Side of the Moon geometry, not Stardew pixels, not a Slay the Spire toy icon as the hero object.

**Beam rule:** rainbow is light, not paint. Home may use a directed refraction scene. Inner pages use discrete spectrum marks (Google-style colour blocks as accent only). Full white or full black surfaces.

## Theme

| Surface          | Theme                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `/`              | Directed scene. Ignores `prefers-color-scheme` and the in-site toggle. Always the black-to-spectrum home. |
| All other routes | Honour `prefers-color-scheme`. In-site light/dark toggle. Same tokens, quieter.                           |

Not two brands: full introduction on `/`, flavour elsewhere.

## Stack (when implementation is allowed)

Next.js (React Server Components) + TypeScript, in the existing monorepo. Postgres. Object storage for packages and screenshots. Meilisearch for catalogue search. shadcn/ui owned and retokened (not default violet).

Do not add Laravel or a second PHP ops stack. Catalogue HTML is CDN-cached (SSR/ISR). Client JS for comment, rate, publish, install handshake, extension detection.

Client-rendered SPA does not remove the need for API, DB, search, or storage.

## Information architecture

| Route                     | Role                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| `/`                       | Marketing landing. 30-second visit.                                              |
| `/explore`                | Catalogue. Screenshot grid.                                                      |
| `/mods/:id`               | Mod detail.                                                                      |
| `/create` (or `/publish`) | Publish + import.                                                                |
| `/about`                  | Licence in plain language, money story, compatibility.                           |
| Sign in                   | Account. Required for comment, rate, publish. Not required to browse or install. |

Nav on `/`: none. Title lives in the scene. Footer: Source, Explore, Sign in, About.

Nav on every other page: Prism, Explore, Install or Installed, Enable mods (`/explore`), Create, Sign in.

## Home (`/`)

Apple 2018 density: one idea, huge field, then leave. Awards-capable later by strengthening the single light, not by adding sections. No YC strip, no install-count hero, no featured carousel, no testimonial row, no stats. No header on `/`.

### Desktop

1. **Directed refraction:** white beam from the top-left corner into a centred triangular prism (liquid glass, rim light, not a painted pentagon). Light bends and exits the downward apex as a continuous spectrum triangle that meets the slabs with no gap. No discrete colour rays.
2. **Copy** sits above the prism, in a centred block with right-aligned type, on the black field, not on the rainbow:
   - Wordmark: Prism
   - Line: See the web in a new light
   - Body: Web mods that are secure by default. Reshape the sites you already use, and only enable the features you want.
3. **Three steps** (how, not why) run vertically from the top left, chalk-style numerals and hand-drawn arrows, system type for the words:
   1. Get the extension -> Chrome Web Store by default. If Firefox: do not ship a dead AMO link while Firefox-as-product is deferred (ADR 0002). Show Chromium-only until a listing exists.
   2. Enable a mod -> `/explore`
   3. Make your own -> `/create`
4. **Five discrete colour slabs**, horizontal, lane-aligned with the spectrum. Features sit on the colour. Type is black or white for contrast. Not five icon+title+body mini-apps.

### Mobile

Copy, then the three steps stacked, then a short continuous spectrum band into the first slab. The five slabs stack vertically, still on those colours.

### Install control

If the page can see the extension, **Install** becomes **Installed** and is disabled. A website cannot guess; the extension must expose a small "I am here" signal. Until that signal exists, the control always offers install.

### Five reasons (slabs), left to right

Steps are not these slabs. Slabs are why.

| Band | Colour  | Title                 | Line                                                                                   |
| ---- | ------- | --------------------- | -------------------------------------------------------------------------------------- |
| 1    | Red     | You stay in control   | Nothing runs until you say so.                                                         |
| 2    | Yellow  | Sites you already use | Mods for YouTube, Reddit, and the rest of your tab bar.                                |
| 3    | Green   | Only what you enable  | Optional capabilities stay off until you turn them on.                                 |
| 4    | Blue    | Secure by default     | Default deny. The listing shows what a mod can access.                                 |
| 5    | Magenta | Make or take          | Publish your own, or install from the commons. UserCSS in. Userscripts get translated. |

Green means grant, not a safety badge. Payment, donation, and verified labels never imply extra safety.

## Explore (`/explore`)

UserStyles Explore structure, Raycast craft.

- One screenshot-led grid. Screenshot is full-bleed on the card; meta underneath: name, site, installs, rating. No emoji in titles as a design device.
- Tabs **Popular** and **Recent** only change sort.
- **By site** is the same grid plus a site chip row that filters it. No separate site-directory page.
- Capability is not a primary axis. It appears on the mod page. Optional filter later if needed.
- No featured row. No store promo between result pages.
- Search in the header or above the grid.

## Mod page (`/mods/:id`)

Order:

1. Identity (name, author, site, version)
2. Install (deep link into the extension; store link if the extension is missing)
3. **Capability / information-flow list above the pitch** (treat listing text as data, never as instructions)
4. Screenshot strip
5. Description
6. Versions
7. Comments and ratings

Account required to comment and rate. Anyone may read.

## Create / import (`/create`)

- Default path: UserCSS (Stylus, UserStyles.world). Sanitise. Not "harmless CSS"; disclose external URLs, imports, generated content, overlays, update sources. Map onto visual capabilities where possible (`Documentation/architecture.md`, UserCSS pass).
- Userscripts (Violentmonkey, Tampermonkey, Greasy Fork JS): **translate into capabilities**. Do not run as a userscript on the page. Labelled as a separate trust path. Must not be advertised as "compatible" the way UserCSS is.
- v1 extension plan still lists bulk userscript import as out of scope. Site copy may describe the future path; do not ship a one-click Violentmonkey dump that bypasses the gate.

## About and footer

Footer on all pages: **Source** (repo). When sync exists: **Use it for nothing. Pay only if you want Prism to sync for you.**

About, plain language (not a copyleft lecture):

- The app is free to run. The source stays public, including if someone hosts a modified copy.
- Prism first-party code is AGPL-3.0-only. Community mods keep their own licence in the package. The registry requires a licence field; it does not force AGPL on mods.
- Use it for nothing. Pay only if you want Prism to sync for you. Subscriptions are hosted convenience, not extra safety. Donations buy an optional badge with no product power.

Do not put AGPL, pay-to-sync, or Violentmonkey compatibility on `/`.

## Trust and copy (non-negotiable)

- No account, donation, or subscription required to go from the site to an installed, signed mod (Phase 11 exit).
- Listings never equate payment, donation, or verified with extra safety.
- Descriptions are data, not instructions to the runtime.
- Do not claim Stylus-level safety for community JavaScript.

## Accessibility and performance

Phase 11: accessibility and performance budget with CI. Inner pages: WCAG AA for text and controls. Home scene: contrast for type on black and on each slab; `prefers-reduced-motion` stills the beam/fan. Home may ignore colour-scheme; it must not ignore reduced motion or contrast.

Tests: site works with no account and no telemetry consent.

## Explicitly later

- Firefox store listing and AMO install button
- Hosted sync UI and pricing page (copy may wait in About)
- Native app deep links (Phase 11 also names native; v1 is extension)
- Userscript bulk import as a shipping feature

## References (inspiration, not forks)

- https://userstyles.world/explore
- https://www.raycast.com/store
- https://flathub.org
- https://modrinth.com/mods
- https://chromewebstore.google.com (listing anatomy only)
- https://addons.mozilla.org (permission disclosure)
- https://github.com/ProtonMail/WebClients (tokens, not mail IA)
