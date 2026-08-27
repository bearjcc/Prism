# Repo layout

## Status

Agreed. Scaffold is in the tree.

## Delivery (what users install)

Three products:

1. **Website**  -  install funnel and marketplace. No DNS or host privileges.
2. **Native Prism**  -  one installer. Host process (service + DNS/proxy) plus UI. Tray is the UI binary in tray mode. Closing windows does not stop the host. Sideload and marketplace install both go through the host.
3. **Browser extension**  -  Chromium first; Firefox is a second build target of the same tree.

Hosted sync/registry can later sit behind `apps/web` or a new `apps/control`. Not a folder until needed.

## Code layout vs installers

Internal packages may split host and UI. Users never install two native products. Windows first, then Android; Linux then Apple later.

## Native: one core, two profiles, per-OS adapters

Policy, mods, sideload, marketplace install, capabilities, signatures, and IPC types are shared.

`apps/native/host` is the portable engine. `apps/native/platforms/*` holds OS APIs only (process lifetime, tun/VPN, Native Messaging registration).

Profiles are feature sets, not forks:

- **Desktop** (Windows, then Linux, then Mac): always-on host, tray UI, Native Messaging, full DNS/proxy.
- **Mobile** (Android first, iPhone later): same engine; datapath is the OS VPN/DNS API; extension remains the page enforcer; desktop-only RPC is compiled out.

iPhone is a constrained adapter, not a second policy engine.

## Bundled mods

`mods/` are first-party packages in the same format as community/sideload mods (Factorio `base` / Obsidian core plugins). If a product feature cannot be expressed as a mod, that is an engine gap.

The installer/host seeds this set. Per-mod default on/off is allowed. Users can disable, inspect, and copy them. CI should run the engine against `mods/*`.

Do not import `References/` as a runtime dependency. Copy into `apps/` or `packages/` only after a licence check recorded in Documentation.

## Website and extension

- `apps/web` lists first-party and community packages; install deep-links to native app or extension.
- `apps/extension/src` is shared. `targets/chrome` and `targets/firefox` are thin manifest/API shims.

## Shared packages

- `packages/schema`  -  mod format, capabilities, policy documents.
- `packages/ipc`  -  host <-> UI <-> extension. No shell, filesystem, or generic network primitives.

## References restore

`references.lock.json` is tracked. Each entry: `id`, `url`, `ref`, `sha`, `dest` (relative to `References/`). Restore is fetch + verify SHA (fail closed). `References/` is gitignored.

## Tree

```
prism/
  Documentation/
  references.lock.json
  scripts/restore-references.ps1
  scripts/restore-references.sh
  References/                    # gitignored
  mods/
  apps/web/
  apps/extension/src/
  apps/extension/targets/chrome/
  apps/extension/targets/firefox/
  apps/native/host/
  apps/native/ui/
  apps/native/platforms/{windows,android,linux,apple}/
  apps/native/installer/
  packages/schema/
  packages/ipc/
```
