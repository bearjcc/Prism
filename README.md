# Prism

One policy system, enforced at the narrowest capable layer.

First-party code is AGPL-3.0-only. `.prism` packages are an open zip format; other runtimes may implement them. The official gate is this extension, not the file suffix. Marks: `Documentation/trademark.md`. Contribute: `CONTRIBUTING.md`. Vulnerabilities: `SECURITY.md`.

## Layout

- `Documentation/` -- ADRs, specs, architecture, licence notes.
- `mods/` -- bundled first-party packages (engine is not special-cased around these)
- `corpus/` -- private UserCSS/userscript fixtures; not packed into the extension
- `apps/web` -- site and marketplace
- `apps/extension` -- Chromium first; Firefox is a build target
- `apps/native` -- one installer: host + UI + tray
- `packages/schema`, `packages/ipc` -- shared contracts
- `References/` -- gitignored clones; `references.lock.json` + `scripts/restore-references.*` (default: browser extensions only; `-IncludeArchived` for native/DNS/proxy trees). `npm run lint` runs `scripts/verify-references-lock.mjs` (schema, unique id/dest, SHA format; no clone). Restore still fails closed if HEAD does not match the lock SHA.

See `Documentation/specs/2026-08-27-repo-layout.md`.

Do not trust unreviewed edits or third-party mods. Scan, test, and verify (`npm run verify`).
