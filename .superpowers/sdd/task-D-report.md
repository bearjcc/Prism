# Phase D report

Status: Implemented and locally verified on `feat/extension-v1`.

## Commits

- `5ea5a3b` - Claim Phase D kitten tracer work.
- `03da14b` - Implement kitten ad replacement tracer.

## TDD evidence

RED:

- `npx vitest run apps/extension/src/extractors/ad-slot.test.ts`
  - Exit 1: `./ad-slot.js` did not exist.
- `npx vitest run apps/extension/src/dnr.test.ts`
  - Exit 1: `./dnr.js` did not exist.
- `npx vitest run apps/extension/src/phase-d.test.ts`
  - Exit 1: slot replacement image was `undefined`.
- `npx vitest run apps/extension/src/phase-d.test.ts`
  - Exit 1: the ad-slot extractor handler was `undefined`.
- `npx vitest run apps/extension/src/phase-d.test.ts`
  - Exit 1: `mods/kitten-ad-replace/src/index.js` did not exist.

GREEN:

- `npx vitest run apps/extension/src/extractors/ad-slot.test.ts`
  - Exit 0: 2 tests passed.
- `npx vitest run apps/extension/src/dnr.test.ts`
  - Exit 0: 2 tests passed.
- `npx vitest run apps/extension/src/phase-d.test.ts`
  - Exit 0: 5 tests passed.

The Phase D tests cover opaque ad-slot handles, stable third-party DNR rules,
fixture replacement, compiled mod JS without `fetch`, optional egress denied
before the broker, granted egress through the broker, and undo restoration.

## Final verification

- `npm run build`
  - Exit 0; TypeScript build and bundled-mod generation completed.
- `npm test`
  - Exit 0; 12 files and 59 tests passed.
- `npm run lint`
  - Exit 0; ESLint and `check-text` passed.
- IDE diagnostics on edited TypeScript files
  - No linter errors.

## Files

- `apps/extension/src/extractors/ad-slot.ts`
- `apps/extension/src/dnr.ts`
- `apps/extension/src/content-script.ts`
- `mods/kitten-ad-replace/`

## Manual verification

The Chromium unpacked-extension UI was not run in this environment. Verify the
fixture page replacement and popup undo in Chrome if host UI evidence is
required.

## Critical and Important review fixes

RED:

- `npx vitest run apps/extension/src/phase-d.test.ts apps/extension/src/dnr.test.ts apps/extension/src/shell.test.ts`
  - Exit 1: 5 failed, 10 passed. Missing DNR sync, manifest permission,
    package-relative asset resolution, egress broker, and disable handling.
- `npx vitest run apps/extension/src/phase-d.test.ts -t "waits for document_start slots"`
  - Exit 1: the mod entry loaded before a late ad slot appeared.

GREEN:

- `npx vitest run apps/extension/src/phase-d.test.ts apps/extension/src/dnr.test.ts apps/extension/src/extractors/ad-slot.test.ts apps/extension/src/shell.test.ts`
  - Exit 0: 4 files and 17 tests passed.
- `npm run build`
  - Exit 0: TypeScript build and bundled-mod generation completed.
- `npm test`
  - Exit 0: 12 files and 63 tests passed.
- `npm run lint`
  - Exit 0: ESLint and `check-text` passed.
- IDE diagnostics on edited TypeScript files
  - No linter errors.
