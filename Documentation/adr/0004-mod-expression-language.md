# ADR 0004: Native mod expression language and bounded WASM

## Status

Accepted. 2026-08-29.

Closes the architecture open question on whether native packages may contain bounded WASM in the first runtime.

## Context

The first runtime is the Chromium extension (ADR 0002). Native mods are packages: `prism.yaml`, CSS, assets, and optional TypeScript that compiles to JavaScript and may call only reviewed `prism.*` primitives. HTML extractors that parse third-party pages live in the extension. Mods must not receive `document`, `window`, page `fetch`, cookies, or extractor HTML.

The historical Phase 0 plan asked for an ADR on a mod expression language for declarative transforms, and whether bounded WASM is in or out of that runtime. The package spec already states that a `.prism` is not a programming language: authoring is ordinary files; declarative work is sanitised CSS, optional ABP/uBO-style browser filter lists compiled to declarativeNetRequest, and extension-owned extractors with `prism.*` orchestration.

A separate CEL, JSON-logic, jq, or similar DSL would be a second policy brain beside the capability gate. Bounded WASM in the extension would be a second execution world beside gated `prism.*` JavaScript, with isolation, import, and memory questions that v1 does not need to prove.

## Decision

- **No new expression language in the first runtime.** Do not invent CEL, JSON-logic, jq, or another declarative transform DSL for native mods. Declarative transforms already exist as sanitised CSS (`prism.styles.apply` / package `styles/`), DNR filter lists (`filters/browser/` plus `network.browser.block`), and extension-owned extractors plus `prism.*` orchestration (`prism.extract`, `prism.slots.replace`, `prism.ui.allowlist`, `prism.net.request`).
- **Historical Phase 1 wording.** "Define declarative transforms and event rules using the chosen expression language" means that stack, not a new language. Event rules that are not expressible as CSS, DNR, or a reviewed primitive wait for an extension release.
- **Bounded WASM is out of the first runtime.** Mods must not ship `.wasm` that the extension executes. Revisit only in a later ADR (likely with a host), including isolation, capability mapping, and whether WASM is allowed at all.
- **Native TypeScript stays orchestration.** Optional `src/index.ts` may call gated `prism.*` only. New operations require an extension release. Site adapters stay first-party extension code.

This ADR does not reopen Native Messaging, `apps/native`, a TLS proxy, or a hosted registry.

## Consequences

### Follow-through

- Package format remains `Documentation/specs/2026-08-28-mod-package-and-runtime.md`.
- Pack-time lints stay diagnostics. Enforcement stays the capability gate.
- A later host or WASM ADR must not treat this file as permission to execute `.wasm` in the extension.

### Risks

- Authors who want jq-style JSON transforms must wait for a new `prism.*` primitive or write userscripts under the restricted userscript world, which is a different trust label.
- Rejecting WASM keeps heavy parsers in the extension. Adapter drift is engine work, not a reason to load community WASM.

## Alternatives rejected

- **CEL / JSON-logic / jq as the native transform language.** Duplicates CSS, DNR, and `prism.*`. Harder to review than TypeScript that only calls named primitives.
- **Bounded WASM in the extension for v1.** Second runtime, unclear isolation, and no tracer that requires it. Out until a later ADR.
- **Giving mods HTML or DOM so they can express transforms in page JS.** Contradicts ADR 0002 and the package spec.
- **Deferring this ADR with ADR 0002.** Expression language and WASM isolation are first-runtime questions. The host is not required to answer them.
