# ADR 0006: Published tree, package format, and hosted isolation

## Status

Accepted. 2026-09-01.

## Context

ADR 0001 licences first-party code AGPL-3.0-only, refuses a copyright-assignment CLA, and refuses an open-core paywall of the capability engine. Architecture still describes optional hosted sync.

Mature AGPL and copyleft projects isolate money and abuse tooling without closing the product:

- Wiki.js publishes the whole product under AGPL and funds work with sponsors and hosting.
- Joplin publishes the apps under AGPL and uses a CLA so the company can relicense later. Prism rejects that CLA.
- Bitwarden keeps organisation modules in `/bitwarden_license` under a source-available licence. Prism rejects that split for the engine.
- Signal publishes clients and server under AGPL and keeps a small anti-spam component unpublished, with public interfaces, because publishing the detector trains attackers.

`.prism` packages are a zip of ordinary files plus `prism.yaml`. Other people will build clients, servers, and extensions around that format. Official safety lives in the official runtime and signatures, not in the file suffix.

Hosted sync, if it exists, is meant to recover replica cost and a modest surplus for project bills. It is not a growth business. Forming a for-profit company is not a current decision.

## Decision

### Public source tree

The git index is corresponding source: what is required to build, test, and scan the official products. Community health files at the repo root are `README.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`. Marks live in `Documentation/trademark.md`.

Do not track secrets, signing keys, store passwords, live environment files, customer data, coverage output, editor transcripts, or session canvases.

### Package format

The documented `.prism` layout and `packages/schema` contracts are for anyone to implement. Community packages keep their own licence field. Independent implementations must not use Prism marks as if they were official, and must not describe a `.prism` file as safe.

### What must stay in this AGPL tree

- The official extension, schema, first-party mods, pack/scan/gate, and any later official host or control plane derived from this code.
- Public interfaces of any unpublished ops component.
- Sample configuration, not live values.
- Corresponding source for modified first-party services users reach over the network.

### What must not be a closed product module

- The capability engine, policy gate, local enforcement, or any "safer if you pay" path (ADR 0001).
- In-process proprietary plugins that share the extension or host address space, unless they are themselves AGPL.
- A `/ee` or `/bitwarden_license` directory for first-party product code.

### What may stay off this tree

These are services or secrets, not a second Prism:

- Signing keys, CI secrets, store accounts, TLS material.
- Live replica configuration, customer databases, billing-provider keys.
- A hosted billing or replica process that the AGPL client talks to over a documented network API. Self-host and local use remain complete without it.
- Abuse and spam detectors whose publication would teach attackers, with the smallest possible private implementation and public interfaces (Signal-shaped, not a SKU).
- Human review labour, compliance paperwork, and runbooks that contain customer data.

### Hosted sync money

When a Prism-operated replica exists, a fee may cover server cost and a little extra toward project bills. It does not unlock capabilities, weaken policy, or replace AGPL corresponding source. Local and self-host stay first-class. There is no current plan to incorporate as a for-profit business; that would need a later ADR.

## Consequences

Contributors can implement other runtimes against the package format. Official trust remains inspectable AGPL code plus marks and keys the project holds.

Operators of a future official replica keep secrets and abuse internals off GitHub. They do not move enforcement into that private side.

Build flags that strip "enterprise" product code are unnecessary because that code is not in the tree.

## Alternatives rejected

- **Open core in the same repo.** Paywalls code. Conflicts with ADR 0001.
- **CLA so a later owner can close the tree.** Conflicts with ADR 0001.
- **Publishing live spam classifiers.** Trains abusers.
- **Treating `.prism` as a trusted type.** The suffix is a container. The official gate is the product.
