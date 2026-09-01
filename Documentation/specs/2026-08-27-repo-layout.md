# Repo layout

## Status

Agreed, then narrowed by ADR 0002 (2026-08-28). Scaffold remains; **v1 implements `apps/extension`, `packages/schema`, and `mods/` only.**

## Delivery (what users install in v1)

One product: **Chromium extension**. Load unpacked from `apps/extension` after build.

Deferred (do not implement until an ADR reopens):

1. Website marketplace
2. Native Prism installer, host, tray UI, gateway
3. Firefox as a shipped target (folder may exist)

Hosted sync/registry is not a folder until needed.

## Code layout vs installers

Internal packages may later split host and UI. v1 has no native installer.

## Native (deferred)

`apps/native/**` is scaffold only. Do not treat it as a task list.

## Bundled mods

`mods/` are first-party packages in the same format as future community mods. If a product feature cannot be expressed as a mod, that is an engine gap.

v1 seeds mods by **building them into the extension**. There is no host seeder. Users can disable them in the extension UI. CI runs the engine against `mods/*`.

`corpus/` is a private fixture tree (UserCSS copies, EasyList slices, userscript transcodes). It is not bundled. See `corpus/README.md` and `Documentation/corpus-licence.md`.

Do not import `References/` as a runtime dependency. Copy into `apps/` or `packages/` only after a licence check recorded in Documentation.

## Website and extension

- `apps/web` is deferred.
- `apps/extension/src` is shared. `targets/chrome` is v1. `targets/firefox` stays a stub.

## Shared packages

- `packages/schema` -- mod format, capabilities, pack, validator. **v1.**
- `packages/ipc` -- deferred until a host exists.

## References restore

`references.lock.json` is tracked. Each entry: `id`, `url`, `ref`, `sha`, `dest` (relative to `References/`). Optional `enabled` (default true). Restore is fetch + verify SHA (fail closed). Default restore skips `enabled: false` (archived native/DNS/proxy/marketplace). Pass `-IncludeArchived` / `--include-archived` to clone those too. `References/` is gitignored.

## Tree

```
prism/
  Documentation/
  references.lock.json
  scripts/restore-references.ps1
  scripts/restore-references.sh
  References/                    # gitignored
  mods/                          # v1 tracers live here
  corpus/                        # private engine fixtures; not shipped
  apps/web/                      # deferred
  apps/extension/src/            # v1
  apps/extension/targets/chrome/ # v1
  apps/extension/targets/firefox/
  apps/native/                   # deferred scaffold
  packages/schema/               # v1
  packages/ipc/                  # deferred
```
