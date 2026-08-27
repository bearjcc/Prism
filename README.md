# Prism

One policy system, enforced at the narrowest capable layer.

## Layout

- `Documentation/`  -  architecture, ADRs, specs
- `mods/`  -  bundled first-party packages (engine is not special-cased around these)
- `apps/web`  -  site and marketplace
- `apps/extension`  -  Chromium first; Firefox is a build target
- `apps/native`  -  one installer: host + UI + tray
- `packages/schema`, `packages/ipc`  -  shared contracts
- `References/`  -  gitignored clones; `references.lock.json` + `scripts/restore-references.*`

See `Documentation/specs/2026-08-27-repo-layout.md`.
