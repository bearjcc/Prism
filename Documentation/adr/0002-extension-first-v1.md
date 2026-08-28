# ADR 0002: Extension-first v1; native host and gateway deferred

## Status

Accepted. 2026-08-28.

Supersedes, for the v1 delivery horizon only, the architecture line that the desktop service is the preferred local state authority.

## Context

HTTPS page rewriting cannot be done by a transparent proxy without terminating TLS. General TLS interception is a non-goal. Community scripts therefore run in the browser, through reviewed primitives.

A native host still has jobs (folder watch, packing, signing, system DNS, IoT/TV via a gateway). Those jobs do not prove the capability model. Shipping host, gateway, marketplace and extension together delayed the only unique work: per-mod capabilities, allowlist UIs, and typed cross-site extractors.

Three tracer mods define v1:

1. Kitten ad replacement (blocklist / hide-and-replace).
2. YouTube Home shows videos only (allowlist UI).
3. Reddit comments on a YouTube watch page (cross-site, JSON out, not HTML out).

## Decision

- **v1 product is the Chromium extension** plus `packages/schema`, first-party mods under `mods/`, and tests. Users install one unpacked or packed extension. No native installer, no Native Messaging, no gateway, no `apps/web` marketplace.
- **Local state authority for v1 is the extension** (service worker + extension storage).
- **Desktop, Android, gateway, Firefox-as-product, hosted sync, and registry signing** are out of scope until a later ADR reopens them. Scaffold under `apps/native/` stays in the tree as deferred, not as a work queue.
- **Do not** run community JavaScript in a local or remote HTTPS proxy. **Do not** run a hidden second browser on the user's cookie profile as a MITM.
- Native mods may include TypeScript that compiles to JavaScript **only** as orchestration of `prism.*` primitives. New operations require an extension release. Extractors that parse third-party HTML live **in the extension**, not in the mod. Mods receive JSON fields declared in the capability.
- Required vs optional capabilities, runtime deny for undeclared use, and pack-time lints as diagnostics only, as already designed.

## Consequences

### Follow-through

- Implementation sequencing lives in `Documentation/specs/2026-08-28-extension-v1-plan.md`. The 2026-08-27 plan remains historical for deferred phases.
- Package format: `Documentation/specs/2026-08-28-mod-package-and-runtime.md`.
- Amy's kitten journey still applies; the desktop is not required to complete it in v1. Priya's household gateway journey is deferred.

### Risks

- Sideload-from-folder and OS-level DNS remain unsolved until a host exists. v1 loads first-party mods from the repo at extension build time and supports import of a `.prism` zip via the extension UI if built.
- MV3 service-worker lifetime can interrupt long extractors. Keep extractors short and cache results. Do not use that as a reason to revive a proxy.

## Alternatives rejected

- **Keep building host and extension in lockstep.** Repeats the fangless-desktop problem.
- **Local TLS MITM proxy as the runtime.** Contradicts architecture non-goals and user trust.
- **Community mods parse live Reddit/YouTube DOM or HTML.** Session theft. Extractors are first-party runtime.
