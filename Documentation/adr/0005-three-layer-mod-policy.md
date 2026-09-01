# ADR 0005: Three-layer mod policy

## Status

Accepted. 2026-09-01.

## Context

Static checks are useful diagnostics but cannot be the security boundary for
untrusted mod code. A local package may skip the authoring check, a build may
be replaced, and a package may be changed after it was packed. Local and
AI-authored packages therefore need independent checks at authoring/import,
pack/CI, and runtime.

## Decision

- A shared whitelist-first package inspector is called independently by the
  author/import path, the pack and CI path, and the runtime path.
- Pack-time policy findings are errors. CSS, browser filters, unsupported DNS
  and gateway files, and native mod JavaScript outside the approved AST are
  refused.
- Native mod JavaScript runs in a sandboxed, DOM-less execution context and
  communicates with the content script through reviewed `prism.*` messages.
- The content script remains the only owner of page DOM, browser APIs, cookies,
  extractor parsing, and network brokers. It sends semantic handles and
  validated JSON only.
- Capability denials are safe no-ops and activity events. Required capability
  failures still prevent activation, and browser host permissions still
  require an explicit user grant.
- Userscript packages remain explicitly labelled and constrained. They are
  not described as DOM-safe or equivalent to native mods.
- Community scanning, fixture execution, content verification, signatures,
  key rotation, and revocation are a later registry workflow. They do not
  replace local runtime enforcement.

## Consequences

The same package is checked more than once because each boundary must remain
safe if an earlier boundary is bypassed. The extension can protect users from
local mistakes without trusting an author, build tool, AI agent, registry, or
obfuscation. The whitelist must be extended deliberately when a reviewed
primitive or safe CSS feature is added.

ADR 0002 remains authoritative for the v1 scope: no native host, registry,
DNS engine, TLS proxy, or unrestricted userscript runtime.
