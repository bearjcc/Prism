# Implementation plan

## Status

Proposed. Derived from `Documentation/architecture.md` and `Documentation/specs/2026-08-27-repo-layout.md`.

This plan sequences work only. It does not add product scope and does not re-decide anything under "Locked decisions" in the architecture. Where the architecture lists an open question, this plan schedules an ADR instead of assuming an answer.

## How to use this file

Task state is a markdown checkbox:

- `[ ]` not started
- `[~]` in progress (put your name and the date next to it)
- `[x]` done and merged

Rules for coders:

- Claim a task by editing it to `[~] Task -- jcaswell 2026-08-28` in a small commit before you start.
- A task is `[x]` only when its code, tests and documentation are merged to the default branch.
- A phase is closed only when every task in it is `[x]` and every exit criterion is demonstrated by a command another person can run.
- Do not start a phase whose entry criteria are unmet. Raise the dependency instead.
- If a task turns out to be wrong, delete or rewrite it in the same commit that changes course. Do not leave stale checkboxes.

## Phase map

| Phase | Name                                        | Delivery boundary       |
| ----- | ------------------------------------------- | ----------------------- |
| 0     | Foundations and decisions                   | Pre-product             |
| 1     | Mod and policy schema                       | Initial product         |
| 2     | Extension runtime and visual capabilities   | Initial product         |
| 3     | Behaviour policies                          | Initial product         |
| 4     | Native host and IPC                         | Initial product         |
| 5     | Native UI, tray and Windows installer       | Initial product         |
| 6     | Activity, explanation and exceptions        | Initial product         |
| 7     | Egress broker                               | Initial product         |
| 8     | Bundled mods                                | Initial product         |
| 9     | Legacy import                               | Compatibility expansion |
| 10    | Registry, signing and publication           | Initial product         |
| 11    | Website and marketplace                     | Initial product         |
| 12    | Export, self-hosting and managed sync       | Compatibility expansion |
| 13    | Gateway: DNS, egress and cryptomining lists | Network expansion       |
| 14    | Gateway: private services and roaming       | Network expansion       |
| 15    | Firefox target and Android profile          | Platform expansion      |
| 16    | Hardening and first public release          | Release                 |

Phases 1 to 8 plus 10 and 11 constitute the initial product described in the architecture. Later phases must not be pulled forward to the detriment of the capability model, which is the part of Prism that has no existing equivalent to copy.

## Cross-cutting rules

These apply to every phase and are review-blocking, not optional.

- Default deny. A new runtime path that gives a mod page, storage, network or export reach is incomplete until its capability is declared, enforced per mod, disclosed and audited.
- Data, not remote code. Nothing downloaded from a registry or control plane may introduce a new execution path. If a feature needs one, it needs an extension or host release.
- Every enforcement decision emits a local activity event naming the layer, rule source and effective policy. A feature with no explanation path is not finished.
- Every reversible change has an undo. Every irreversible change says so in the UI before it happens.
- No feature may require the hosted service at runtime. State the local fallback in the task or reject the task.
- Trust is not for sale. No capability, enforcement layer, local feature, publication right or install path may require a donation or subscription. Donations buy an optional supporter badge only. Subscriptions exist only where Prism incurs an ongoing cost (hosted replica, human verification labour, later managed DNS or relay). Surplus from subscription pricing funds the free tier. Copy must not imply that paying users are safer.
- `References/` is study material. Copying code requires a licence check recorded in `Documentation/` first (see `references.lock.json` and ADR 0001: Prism is AGPL-3.0-only).
- ASCII only in tracked files. NZ or GB spelling in prose.

---

## Phase 0 -- Foundations and decisions

Goal: remove the blockers that would otherwise force every later phase to guess.

Entry: none.

### Decisions (ADRs in `Documentation/adr/`)

- [~] ADR: Prism's own licence, decided before any copyleft reference code is considered for reuse. -- jcaswell 2026-08-27. Recorded in `Documentation/adr/0001-project-licence.md`. Mark `[x]` when merged.
- [ ] ADR: host implementation language for `apps/native/host` (portable engine, must build for Windows, Linux, macOS and Android without Electron or a JVM).
- [ ] ADR: native UI toolkit for `apps/native/ui`, including how tray mode and window mode share one binary.
- [ ] ADR: extension build toolchain for `apps/extension`, including how `targets/chrome` and `targets/firefox` stay thin shims over one `src`.
- [ ] ADR: local state store used by the host (single writer, immutable revisions, crash safe).
- [ ] ADR: mod expression language for declarative transforms, and whether bounded WASM is in or out of the first runtime.
- [ ] ADR: signature scheme and key hierarchy for publisher, registry and host update signing.
- [ ] ADR: whether the first gateway integrates an existing DNS product or ships a native resolver.

### Repository and toolchain

- [ ] Choose and commit one task runner at the repo root that builds, tests and lints every app and package with one command per verb.
- [ ] Commit formatter and linter configuration for each language chosen, enforced in CI rather than by convention.
- [ ] Commit an editor and line-ending configuration that keeps tracked files ASCII with stable newlines on Windows checkouts.
- [ ] Add a licence file and per-package licence headers consistent with the licence ADR.
- [ ] Add `CONTRIBUTING.md` covering the checkbox protocol in this file, commit conventions and the References rule.

### Continuous integration

- [ ] CI job: build every app and package on Windows and Linux.
- [ ] CI job: unit tests with coverage reported but not gated in Phase 0.
- [ ] CI job: lint and format check.
- [ ] CI job: verify `references.lock.json` restores and SHAs match, failing closed.
- [ ] CI job: reject non-ASCII bytes and US spellings from an agreed word list in tracked text.
- [ ] CI job placeholder that will run the engine against `mods/*` once Phase 1 lands, failing loudly while empty rather than passing silently.

### Documentation

- [ ] Add `Documentation/adr/README.md` describing the ADR format and index.
- [ ] Add a traceability table mapping each architecture requirement to the phase that satisfies it, so gaps are visible.

Exit criteria:

- A fresh clone on Windows and on Linux runs one build command, one test command and one lint command successfully.
- Every ADR above is either accepted or explicitly deferred with the phase that will force it.
- CI fails when the References lockfile is tampered with.

---

## Phase 1 -- Mod and policy schema

Goal: `packages/schema` becomes the single definition of a mod package, a capability and a policy document, with a validator that both the host and the extension use.

Entry: Phase 0 ADRs for language, expression language and signatures.

### Package format

- [ ] Define the package manifest: identity, metadata, licence, version, content hash, publisher signature, supported runtime versions, site and route scopes.
- [ ] Define required and optional capability declarations as separate lists.
- [ ] Define declarative transforms and event rules using the chosen expression language.
- [ ] Define bundled resource declarations with size and type limits.
- [ ] Define the local settings schema format and its defaults.
- [ ] Define failure and fallback behaviour fields.
- [ ] Define test fixture format shipped inside a package.
- [ ] Define egress contract fields exactly as listed in the architecture, with no shortcuts.

### Capability registry

- [ ] Define the capability descriptor: inputs, runtime operations, retained data, scope, user disclosure text, audit events, revocation and undo behaviour.
- [ ] Register the visual capability family.
- [ ] Register the behaviour capability family.
- [ ] Register the semantic data capability family, including explicit enumeration limits.
- [ ] Register the storage capability family with per-mod namespacing.
- [ ] Register the network capability family, split into declarative rules and egress contracts.
- [ ] Implement capability versioning and a capability-diff function producing human-readable increase or decrease results.

### Policy documents

- [ ] Define a policy decision document: feature or mod, capability, origin, optional route, device or group, duration, source, whether it synchronises.
- [ ] Implement the precedence resolver following the architecture's seven-level order.
- [ ] Implement conflict detection that reports every rule affecting an origin rather than only the winning one.

### Validation and tooling

- [ ] Implement a validator returning structured, positioned errors suitable for both CLI and UI display.
- [ ] Implement a compiler from package source to a compiled package artefact consumed by the extension and host.
- [ ] Implement content addressing and hash verification of compiled artefacts.
- [ ] Add a golden-file test suite of valid packages.
- [ ] Add a rejection test suite: undeclared capability use, scope escape, oversized resources, unknown fields, downgrade attacks.
- [ ] Add property-based or fuzz tests for the parser and the precedence resolver.
- [ ] Publish the schema as versioned machine-readable output for editor completion.

Exit criteria:

- The validator rejects every case in the rejection suite and accepts every golden package.
- The precedence resolver has a test per precedence level and per tie-break.
- A capability diff between two revisions is printable and reviewed in tests.

---

## Phase 2 -- Extension runtime and visual capabilities

Goal: the reviewed execution primitives exist in the browser and apply a compiled package at `document_start` with no host and no network.

Entry: Phase 1 compiled package format.

### Extension skeleton

- [ ] Create the MV3 extension shell in `apps/extension/src` with a Chromium target shim.
- [ ] Request the narrowest permission set that the active feature set requires, and document why each is needed by enforcement layer.
- [ ] Implement the service worker lifecycle without assuming persistence.
- [ ] Implement a compiled package cache in extension storage with validation on read, not only on write.
- [ ] Implement package activation, deactivation and scope matching per tab and per frame.
- [ ] Apply matching packages at `document_start` where the browser permits, and record when it did not.

### Per-mod isolation

- [ ] Implement a per-mod runtime context that holds only that mod's granted capabilities.
- [ ] Implement the capability gate through which every primitive call passes.
- [ ] Add tests proving one mod cannot read another mod's storage, settings or handles.
- [ ] Add tests proving a mod cannot reach page JavaScript, `eval`, cookies, credentials or arbitrary DOM traversal.

### Visual capabilities

- [ ] Implement sanitised style property application.
- [ ] Implement hide and restore of matched elements.
- [ ] Implement reordering of known semantic elements.
- [ ] Implement semantic slot replacement with a trusted component.
- [ ] Implement sanitised static content insertion.
- [ ] Implement runtime-managed mutation observation with backpressure and a failure budget.
- [ ] Implement the `ad-slot` semantic primitive with a documented detection strategy and false-positive tests.

### Robustness

- [ ] Isolate mod failure so one failing mod cannot break page load or other mods.
- [ ] Record every applied operation so it can be reversed.
- [ ] Automatically pause a mod on an origin after repeated failures, visibly rather than silently.
- [ ] Add a fixture site suite covering static pages, single-page navigation and heavy mutation.

Exit criteria:

- A packaged visual mod loads from cache and applies with the host uninstalled and the network unavailable.
- Undo restores the page to its pre-mod state on the fixture suite.
- Isolation tests fail if a capability gate is bypassed.

---

## Phase 3 -- Behaviour policies

Goal: global preferences that the gateway can never enforce work in the browser, independently of any mod.

Entry: Phase 2 capability gate.

- [ ] Implement allow paste and standard input events.
- [ ] Implement suppression of unsolicited popup creation.
- [ ] Implement stable title, freezing or constraining title mutation.
- [ ] Implement autoplay constraint.
- [ ] Implement scroll-lock release.
- [ ] Implement modal and chatbot-popup suppression.
- [ ] Implement consent-interface rejection.
- [ ] Implement the predefined same-origin user action primitive with an explicit allowlist of actions.
- [ ] Define hard runtime safety invariants that no site exception can override, and test each one.
- [ ] Implement a global policy panel in the extension covering these policies with per-origin overrides.
- [ ] Add a browser-compatibility matrix test for each policy, recording where enforcement is partial.

Exit criteria:

- Each policy has a fixture page demonstrating the unwanted behaviour and its suppression.
- Each policy can be disabled for one exact origin without affecting others.
- The invariant tests prove an exception cannot cross a safety invariant.

---

## Phase 4 -- Native host and IPC

Goal: the local service becomes the authority on state, compilation and hot reload, with a narrow bridge to the extension.

Entry: Phase 1 schema, Phase 0 store and language ADRs.

### Host core

- [ ] Implement the local store as single writer over mods, immutable revisions, compiled packages, capability grants, policies, device identity and publication state.
- [ ] Implement revision immutability and content addressing.
- [ ] Implement validate, compile and activate as host operations reusing `packages/schema`.
- [ ] Implement private draft and bundled resource storage.
- [ ] Implement local capability grant storage and revocation.
- [ ] Implement device identity generation and key storage using OS key protection where available.
- [ ] Keep activity logs local by default, with bounded retention and explicit export.
- [ ] Implement a workspace watcher emitting revision events on change.
- [ ] Implement crash-safe startup and store migration with a tested rollback path.

### IPC

- [ ] Define `packages/ipc` message types for host to UI and host to extension, with no shell, filesystem or generic network primitive.
- [ ] Version the protocol and implement negotiation with refusal on mismatch.
- [ ] Implement Native Messaging transport restricted to the Prism extension ID.
- [ ] Implement host-side authorisation so a local process cannot impersonate the extension or the UI.
- [ ] Add an adversarial test suite sending malformed, oversized, out-of-order and replayed messages.
- [ ] Document the entire RPC surface and add a CI check that an undocumented method fails the build.

### Platform adapters

- [ ] Implement the Windows adapter: process lifetime, service or scheduled start, Native Messaging registration.
- [ ] Define the adapter interface so Android, Linux and Apple can be added without touching the host engine.

### Hot reload

- [ ] Wire the save-to-apply loop: draft saved, validated, compiled, revision event, extension fetch, validate, cache, apply.
- [ ] Require an explicit local-development mode for unsigned mods.
- [ ] Show a persistent unsigned local-build indicator in the browser.
- [ ] Report match results, runtime diagnostics and failures back to the host.

Exit criteria:

- Editing a mod file updates a matching open tab without a manual reload.
- The extension keeps working from cache with the host stopped.
- The adversarial IPC suite produces no crash, no privilege gain and no unbounded resource use.

---

## Phase 5 -- Native UI, tray and Windows installer

Goal: one installer delivers host and UI; closing a window does not stop enforcement.

Entry: Phase 4 host and IPC.

### UI

- [ ] Implement the installed and community mod list over host IPC.
- [ ] Implement mod workspace creation from templates including the semantic ad-slot template.
- [ ] Implement the mod editor view with schema-driven validation, examples and diagnostics.
- [ ] Implement a capability declaration view that shows exactly what a mod may do.
- [ ] Implement before and after page-change review.
- [ ] Implement global, site and device policy configuration.
- [ ] Implement the local activity inspector.
- [ ] Implement device, key and backup management screens, backed by Phase 12 where relevant.
- [ ] Support optional AI-assisted authoring that shares only files or sanitised samples the user selects, with the shared payload shown before it leaves the device.

### Tray and lifetime

- [ ] Ship tray mode as the UI binary in a different mode, not a second product.
- [ ] Prove host survival when all windows close, and add a test that fails if the host exits with them.

### Installer

- [ ] Build the Windows installer covering host, UI, tray registration and Native Messaging manifests.
- [ ] Implement signed updates for host and UI, with signature verification before applying.
- [ ] Implement uninstall that removes registration and leaves user data unless removal is explicitly requested.
- [ ] Seed the bundled mod set from Phase 8 at install time with per-mod default state.
- [ ] Add an install, upgrade, downgrade-refusal and uninstall test on a clean Windows image.

Exit criteria:

- A clean Windows machine goes from installer to a working mod applied in the browser without manual configuration beyond installing the extension.
- An unsigned or tampered update is refused.

---

## Phase 6 -- Activity, explanation and exceptions

Goal: a user diagnoses breakage from outcomes and repairs it with the narrowest possible exception.

Entry: Phases 2, 3 and 4.

- [ ] Define one activity event schema shared by extension, host and later the gateway, naming layer, rule source, effective policy and outcome.
- [ ] Implement the current-page panel listing every visual, behavioural and network rule affecting the origin.
- [ ] Implement attribution from a visible symptom to the responsible rule, and state honestly when attribution is uncertain rather than guessing.
- [ ] Implement allow once for the current session.
- [ ] Implement exact-origin exceptions scoped by origin, feature, mod and duration.
- [ ] Implement disable this mod on this origin and disable this feature on this origin as distinct actions.
- [ ] Implement undo, with a clear notice when a reload is required and cannot be perfectly reversed.
- [ ] Surface conflicts: disabling a page mod must not imply that a network rule was disabled.
- [ ] Show the expanded information flow before a permanent grant is saved.
- [ ] Rate-limit and coalesce prompts so users are not trained to approve everything, and test the prompt budget.
- [ ] Add end-to-end tests reproducing the broken video-call scenario from the Priya journey.

Exit criteria:

- The video-call scenario is repaired by two narrow exceptions with unrelated protection intact.
- Every exception type has a test proving its scope does not leak to another origin, mod or feature.

---

## Phase 7 -- Egress broker

Goal: mods reach the network only through a mediated, disclosed, field-level contract.

Entry: Phase 1 egress contract schema, Phase 2 capability gate.

- [ ] Implement contract parsing and per-revision binding so a changed contract requires renewed approval.
- [ ] Implement request construction restricted to the declared origin, method, path template and fields.
- [ ] Enforce trigger conditions, maximum frequency, batching limits and response size limits.
- [ ] Reject private, loopback, link-local and multicast destinations.
- [ ] Implement DNS-rebinding defence by pinning the resolved address used for the connection.
- [ ] Reject redirects to undeclared origins.
- [ ] Omit credentials, cookies and referrer unless separately justified and granted.
- [ ] Treat all responses as untrusted: validate declared type, reject HTML, SVG and executable content where an image is expected.
- [ ] Decode, validate, strip metadata and re-encode remote images before page use.
- [ ] Implement contract-declared caching and the declared offline fallback with backoff.
- [ ] Request the exact browser host permission from a user gesture, and remove it when no enabled feature still needs it.
- [ ] Implement the disclosure UI separating intentional payload, unavoidable connection metadata, data not sent, and inference risk from request sequences.
- [ ] Emit a local inspection event per request showing the exact outbound payload.
- [ ] Add an SSRF and sanitisation test suite, including the dislike-count and home-page connector distinction from the architecture.

Exit criteria:

- A mod with an optional source works from bundled resources with the source disabled, and the source stays disabled until separately enabled.
- Every item in the broker requirements list has a failing-attack test.

---

## Phase 8 -- Bundled mods

Goal: first-party features ship as ordinary packages, proving the engine has no privileged path.

Entry: Phases 1, 2, 3 and 7.

- [ ] Author the ad-slot kitten replacement mod from the Amy journey, including bundled images and an optional disabled remote source.
- [ ] Author a YouTube focus mod removing promotions and Shorts through semantic capabilities.
- [ ] Author a consent-interface rejection mod.
- [ ] Author a cosmetic first-party promotion cleanup mod for at least two real sites.
- [ ] Author a reading or redesign mod exercising complete semantic slot replacement.
- [ ] Ship every bundled mod with test fixtures and a declared default on or off state.
- [ ] Enable the CI job that runs the engine against `mods/*` and gate it.
- [ ] Record every engine gap found while authoring as an issue against the phase that owns it, rather than special-casing the bundled mod.

Exit criteria:

- No bundled mod requires a code path unavailable to a community mod.
- CI fails when a bundled mod stops matching its fixtures.

---

## Phase 9 -- Legacy import

Goal: users migrate without Prism claiming that arbitrary scripts are safe.

Entry: Phase 2 runtime, Phase 6 explanation.

### UserCSS

- [ ] Implement UserCSS parsing and a separate sanitisation pass.
- [ ] Disclose or reject external URLs, imports, generated content, overlays and automatic update sources by policy.
- [ ] Map sanitised UserCSS onto visual capabilities rather than raw style injection where possible.
- [ ] Add a corpus test over real UserCSS styles recording accepted, sanitised and rejected counts.

### Userscripts

- [ ] Implement restricted legacy execution in an isolated user-script world where the browser supports one.
- [ ] Constrain grants, destinations, remote dependencies and execution world, and show the constraints in the UI.
- [ ] Implement unrestricted legacy mode, disabled by default, behind an explicit warning stating it has Tampermonkey-like authority.
- [ ] Label trust level visibly wherever a legacy item appears, never alongside native safety claims.
- [ ] Require an independent security review before unrestricted execution ships enabled in any build.

### Migration

- [ ] Implement the migration assistant that imports compatible lists and settings as disabled drafts for review.
- [ ] Report unsupported items honestly and leave them in their original manager.
- [ ] Add tests proving an import is inert until explicitly activated.

Exit criteria:

- An import run activates nothing by itself.
- The UI never presents a restricted or unrestricted legacy item with a native safety statement.

---

## Phase 10 -- Registry, signing and publication

Goal: immutable, reviewed, signed public releases with revocation that disables rather than replaces.

Entry: Phase 0 signing ADR, Phase 1 capability diff.

- [ ] Implement content-addressed package storage.
- [ ] Implement publisher and registry signing, with key rotation and a documented compromise procedure.
- [ ] Implement manifest and schema validation on ingest.
- [ ] Implement secret and provenance scanning before acceptance.
- [ ] Implement capability-diff generation between versions.
- [ ] Implement static policy checks.
- [ ] Implement response fixture and compatibility tests in the pipeline.
- [ ] Implement visual regression tests where a package declares them.
- [ ] Implement moderation workflows for deceptive UI, affiliate insertion and abuse.
- [ ] Implement revocation metadata that pauses affected releases without mutating the published artefact.
- [ ] Implement the client publication flow: select one immutable revision, show exact files, assets and capabilities, require public metadata and a licence. No account or subscription required.
- [ ] Implement optional paid human verification as a registry label and queue. Unverified public releases remain installable and runnable under the same capability model.
- [ ] Implement client-side installation: verify hash, signatures and runtime compatibility, separate required from optional capabilities, keep optional network sources disabled. Do not require a verified label.
- [ ] Implement update handling where a capability increase requires renewed user approval.
- [ ] Prove a mod runs after install without contacting the registry.
- [ ] Add tests for registry-compromise behaviour: invalid signature refused, silent replacement impossible, private local mods unaffected.

Exit criteria:

- A published release installs, passes hash and signature checks, and runs offline with no account and no subscription.
- A capability increase cannot activate without explicit reapproval.
- Revoking a release pauses it on clients without changing its content hash.
- Tests prove an unverified release installs and runs the same as a verified one aside from the label.

---

## Phase 11 -- Website and marketplace

Goal: `apps/web` is the install funnel and public search, with no DNS or host privilege.

Entry: Phase 10 registry.

- [ ] Implement marketplace search over public registry content with publisher, signature, capability and supported-site facets.
- [ ] Show capability summaries and information-flow disclosures in listings, treating descriptions as data and never as instructions.
- [ ] Implement install deep links into the native app and the extension.
- [ ] Implement the install guide and platform detection.
- [ ] Ensure only the search query reaches the registry: no history, installed mods or local policy.
- [ ] Add an accessibility and performance budget with CI enforcement.
- [ ] Add tests proving the site works with no account and no telemetry consent.
- [ ] Implement optional donations with an optional supporter badge. The badge has no product power.
- [ ] Add tests proving donation and subscription status cannot change capabilities, policy or install eligibility.
- [ ] Audit marketplace copy so listings never equate payment, donation or a verified label with extra safety.

Exit criteria:

- A new user goes from the site to an installed, signed mod without an account, donation or subscription.
- The site has no code path requiring host or DNS privilege.

---

## Phase 12 -- Export, self-hosting and managed sync

Goal: cross-device use without making the hosted service a runtime dependency.

Entry: Phase 4 device identity, Phase 10 immutable revisions.

- [ ] Implement encrypted local backup export and import covering mods, revisions, grants and policies.
- [ ] Implement manual package export and import for extension-only devices.
- [ ] Design and record the private-sync protocol: key management, key recovery, conflict resolution, metadata minimisation.
- [ ] Implement a self-hosted controller with user-controlled storage and signing policy.
- [ ] Implement managed encrypted sync as an optional replica, opt-in per collection or mod, behind a convenience subscription. Local and self-host remain fully usable without it.
- [ ] Keep private sync and public publication as separate actions, with tests proving one cannot trigger the other.
- [ ] Exclude activity and browsing logs from sync by default.
- [ ] Implement per-device authorisation, revocation and key rotation, including remote revocation of a lost device.
- [ ] Implement direct extension-to-hosted sync for devices that cannot run the host, using the same convenience subscription as other Prism-hosted replicas.
- [ ] Implement reconciliation when such a device later meets a host, preserving immutable revision identity.
- [ ] Implement policy history and cross-device rollback.
- [ ] Prove return to local-only operation without losing installed policies.
- [ ] Add an outage test: control plane unavailable, installed mods and local policy continue, publishing and sync pause.

Exit criteria:

- Sync can be enabled, used, and disabled with no loss of local state.
- A revoked device loses access without affecting other devices.
- The threat model for sync metadata is written down and reviewed.
- A non-subscriber can do everything a subscriber can except use Prism's hosted replica and paid verification queue.

---

## Phase 13 -- Gateway: DNS, egress and cryptomining lists

Goal: protect devices that cannot run an extension, without overclaiming.

Entry: Phase 0 gateway ADR, Phase 6 activity schema.

- [ ] Implement or integrate DNS filtering per the gateway ADR.
- [ ] Implement list ingestion for advertising, tracking, gambling, crypto, malware and category filters, with licence checks recorded in `Documentation/`.
- [ ] Implement device inventory and device groups for adults, children, IoT and shared devices.
- [ ] Implement per-device DNS and egress policy by domain, IP, port and device.
- [ ] Implement known IoT phone-home blocking and local-only IoT policy.
- [ ] Implement compiled network rule distribution from host policy to the gateway.
- [ ] Implement browser-layer declarative request blocking, redirection and tracking-parameter removal.
- [ ] Implement list-based cryptomining protection at both the DNS and browser network layers, blocking listed scripts, workers and WebSocket destinations before execution.
- [ ] Emit activity events naming the blocked destination, source list and enforcing layer.
- [ ] Implement exact-origin exceptions that do not weaken unrelated origins.
- [ ] Prove cached extension rules survive gateway failure.
- [ ] State the first-party blind spot in the UI and never imply TLS content was inspected.
- [ ] Add the six acceptance tests listed under cryptojacking in the architecture.

Exit criteria:

- All six architecture acceptance criteria pass as automated tests.
- No default configuration enables TLS interception.

---

## Phase 14 -- Gateway: private services and roaming

Goal: private naming and policy that follow device identity rather than location.

Entry: Phase 13 gateway, Phase 12 device identity and revocation.

- [ ] Implement the private service catalogue with stable private names.
- [ ] Implement private DNS records for catalogue entries.
- [ ] Implement an authenticated reverse proxy limited to declared private services, with HTTPS terminated at the gateway.
- [ ] Implement per-service and per-group access policy evaluated before traffic reaches the backend.
- [ ] Allow a backend to move without changing the user-facing address.
- [ ] Make publishing a private service a separate explicit action.
- [ ] Implement roaming device authorisation and encrypted remote access.
- [ ] Implement optional relay and optional exit-node routing, kept separate from private-service access.
- [ ] Implement remote revocation from the native UI and the web control panel.
- [ ] Document non-HTTP protocol limits and custom-domain certificate complexity in the UI rather than only in specs.
- [ ] Add tests proving a private service is unreachable from the public internet by default.

Exit criteria:

- A roaming device resolves and reaches a private service under policy, and loses access on revocation.
- Exit-node use can be off while private-service access is on.

---

## Phase 15 -- Firefox target and Android profile

Goal: second browser and second platform as targets of the same trees, not forks.

Entry: Phases 2 to 7 stable, Phase 4 adapter interface.

- [ ] Implement the Firefox manifest and API shim in `apps/extension/targets/firefox`, with zero policy logic in the shim.
- [ ] Record a per-policy capability matrix where Firefox differs, and surface degraded enforcement in the UI.
- [ ] Add CI builds and end-to-end tests for both browser targets.
- [ ] Implement the Android platform adapter using the OS VPN and DNS APIs as the datapath.
- [ ] Compile out desktop-only RPC in the mobile profile and test that the surface is absent, not merely hidden.
- [ ] Implement the mobile UI subset over the same host engine.
- [ ] Document the mobile enforcement boundary, including single-active-VPN-profile constraints.
- [ ] Add a CI check that a policy decision implemented in only one target fails the build.

Exit criteria:

- One `src` tree builds both browsers with shims containing no enforcement logic.
- Android runs the same engine with the datapath supplied by the platform adapter.

---

## Phase 16 -- Hardening and first public release

Goal: ship with the security claims the architecture makes, and no others.

Entry: all initial-product phases closed.

- [ ] Write the full threat model document mapping assets, actors and controls to implemented tests.
- [ ] Commission an independent security review of the extension capability boundary, the host IPC surface, the egress broker and gateway privileges.
- [ ] Resolve every finding, or record an accepted risk with the user-facing disclosure that accompanies it.
- [ ] Implement reproducible builds where practical and document where they are not.
- [ ] Implement emergency revocation drills end to end, from registry to client.
- [ ] Add fault-injection tests for each failure mode in the architecture's reliability section.
- [ ] Add performance budgets for page load impact, mutation handling and DNS resolution, enforced in CI.
- [ ] Complete accessibility review of the extension panel, native UI and website.
- [ ] Audit every user-facing claim against the architecture non-goals, removing any statement that Prism cannot support, and any statement that payment or a verified label is extra safety.
- [ ] Write install, migration, troubleshooting and privacy documentation.
- [ ] Design opt-in, sanitised compatibility telemetry, defaulting to off.
- [ ] Define the release, versioning and support policy across host, extension, schema and registry.
- [ ] Run a staged release with rollback tested before general availability.

Exit criteria:

- Independent review findings are closed or explicitly accepted and disclosed.
- Every marketing and in-product claim maps to a passing test or is removed.

---

## Deliberately not in this plan

These remain out of scope until the architecture changes:

- General TLS interception, including any default-on diagnostic mode.
- A remote reverse proxy presenting the general web under a Prism origin.
- First-party `page.resource-abuse` detection, which needs its own signal design and false-positive evaluation before it earns a phase.
- Reimplementation of mature blocking, DNS or mesh engines without a demonstrated need recorded in an ADR.
- Any hosted execution of mods.
