# ADR 0003: Extension build toolchain

## Status

Accepted. 2026-08-29.

## Context

v1 is the Chromium extension (ADR 0002). `apps/extension` must stay one policy tree with thin browser unpack roots, not a second native app and not duplicated runtime logic per target.

The historical Phase 0 plan asked how `targets/chrome` and `targets/firefox` stay shims over one `src`. This ADR records the toolchain that already builds Chrome and the intended Firefox split (implementation is a later-plan shim, not a host).

## Decision

- **TypeScript project references.** Root `tsconfig.json` references `packages/schema` and `apps/extension` (`composite`, `tsc -b`). Shared contracts compile from schema; extension TypeScript type-checks against that graph. `apps/web` is a Next.js workspace build, not part of this reference graph.
- **esbuild pack.** `scripts/generate-bundled-mods.mjs` packs first-party `mods/` into the unpack root, then bundles `apps/extension/src` with esbuild: `service-worker.ts` and `popup.ts` as ESM, `content-script.ts` as IIFE, into `<unpack-root>/dist/`. Schema sources are aliased (`@prism/schema/...`). Default unpack root is `apps/extension/targets/chrome`. The script accepts an alternate output directory so a Firefox root can be generated the same way.
- **Shared source.** Policy, extractors, capability gate, and popup logic live only in `apps/extension/src`. Targets must not grow a second copy of that tree.
- **Chrome unpack root.** `apps/extension/targets/chrome` is the v1 load-unpacked directory: MV3 `manifest.json` (`background.service_worker`), `popup.html` / `popup.css`, `dist/`, `bundled-mods/`, `bundled-mods.json`.
- **Firefox unpack root.** `apps/extension/targets/firefox` is a thin shim over the same `src`: same packed mods and `dist/*`, a Firefox MV3 manifest (background `scripts` plus `type: module` where Chrome's `service_worker` would not load), and static popup files. Zero policy logic in the shim. No AMO id and no store listing. Firefox-as-product remains deferred.

Native Messaging, `apps/native`, and a TLS proxy are out of this toolchain.

## Consequences

### Follow-through

- Chrome build: `npm run build` (`tsc -b` then `generate-bundled-mods.mjs` defaulting to `targets/chrome`).
- Firefox generation follows this layout in `Documentation/specs/2026-08-29-later-plan.md` Phase J. This ADR does not require a host ADR.
- Load paths: `apps/extension/README.md`.

### Risks

- Divergent manifests can hide permission or background-entry differences. Keep both manifests declarative; keep enforcement in `src`.
- Bundling schema into the worker/content script means a schema change requires rebuilding the extension pack, which is intended.

## Alternatives rejected

- **Separate TypeScript apps per browser.** Duplicates the capability gate.
- **tsc emit as the unpack JS.** Project references type-check; esbuild produces the browser bundles (IIFE content script, ESM worker/popup).
- **Native host as the packer.** v1 packs at extension build time (ADR 0002).
