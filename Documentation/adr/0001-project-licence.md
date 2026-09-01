# ADR 0001: Project licence and marks

## Status

Accepted. 2026-08-27.

## Context

Prism is local-first, inspectable, and fully usable without payment. Architecture forbids selling a safer product. Money is for hosted convenience and optional human labour (replica, verification queue, later managed DNS or relay).

Two risks sit beside that model:

1. **Bait and switch.** A later owner, including a future self, paywalls the capability engine or ships a closed hosted control plane from this code.
2. **Impersonation.** A less-secure runtime that still reads Prism packages, uses the Prism name, and burns user trust.

OSI open-source licences cannot ban for-profit binaries. GPL and AGPL still allow selling and competing, so long as corresponding source is offered. A non-commercial / "source first" licence would contradict the architecture's "open source" claim and would not stop a bad actor.

Steam is a product-quality analogy, not a licence analogy. Bitwarden's closer: free core, pay for a genuine hosted need. Immich is closer still: AGPL so the project cannot quietly go proprietary, plus an optional paid key that unlocks nothing. Bitwarden still keeps a proprietary `/bitwarden_license` tree. This project does not want that escape hatch for the core product.

Inbound `References/`: Stylus, uBlock Origin, uBOL, AdGuard Browser Extension, AdGuard Home, and SponsorBlock are GPL-3.0; userstyles.world is AGPL-3.0; KeePassXC is GPL-2.0-or-later; Violentmonkey, Dark Reader, mitmproxy, Catppuccin userstyles, Wide GitHub, github-wide, and YouTube NonStop are MIT; EasyList is GPL-3.0 or CC BY-SA 3.0; Rethink is Apache-2.0. Study trees on disk are not derivatives. Copying into `apps/` or `packages/` is. `corpus/` copies require `Documentation/corpus-licence.md`. Native/DNS/proxy/marketplace clones are `enabled: false` in `references.lock.json` until that phase reopens.

## Decision

First-party Prism code (host, UI, extension, website, packages, scripts, first-party bundled mods) is licensed under the **GNU Affero General Public License version 3** (SPDX `AGPL-3.0-only`).

The **Prism** name, logos, and other marks are not licensed with the code. Forks may use the source. They may not claim to be Prism, the official installer, the official registry, or "reviewed by Prism". Trademark guidelines will live in `Documentation/` once drafted. Registration is a legal step for the copyright holder, not this ADR.

Do **not** take a copyright-assignment CLA. A DCO or "you have the right to contribute under AGPL-3.0-only" statement is enough. Without assignment, other people's contributions cannot be relicensed proprietary by a later owner. Until there are contributors, AGPL is a public promise by the current owner, not a lock on code they solely own.

Community packages keep their own licence in the package manifest. The registry requires a licence field; it does not force AGPL on community mods.

## Consequences

### What this prevents

- A closed-source fork of Prism's first-party code, including a hosted registry or marketplace that modifies this code and does not offer corresponding source to its users (the AGPL network clause).
- Honest commercial impersonation of the **name** once marks are registered and guidelines exist.

### What this does not prevent

- A differently named runtime that parses `.prism` files and skips the capability gate. Defence is the signed official extension/host, Native Messaging pinned to the official extension ID, registry signatures, and copy that never equates "a `.prism` file" with "safe unless opened in official Prism".
- A Vaultwarden-class competitor that reimplements or forks under AGPL and sells hosting. That is allowed. Compete by being the better official replica and the holder of the marks and keys.
- Someone selling support or binaries of the AGPL code. Paid official hosting remains a service, not a licence monopoly.

### Reuse of References

GPL-3.0 and AGPL-3.0 trees may be copied after a licence check recorded in `Documentation/`. The combined work is AGPL-3.0-only. MIT and Apache-2.0 inbound remain allowed; keep their notices; do not relabel those files as AGPL. GPL-2.0-only code cannot be combined. KeePassXC's GPL-2.0-or-later can be taken as GPL-3.

Licence permission is not a product decision to import wholesale. Stylus, AdGuard Home, userstyles.world, and KeePassXC remain poor cores for the capability engine. Prefer unmodified separate processes or adapter-shaped extracts over merging another product's policy brain.

### Operations

- The later Phase 0 task adds the `LICENSE` file and per-package headers.
- Store listings (browser extension, installer) must satisfy AGPL corresponding-source. That is operational, not a reason to pick MIT.
- Contributor and some-company friction is accepted. It is the cost of the bait-and-switch defence.

## Alternatives rejected

- **MIT or Apache-2.0.** Simplest reuse, weakest bait-and-switch story. A later owner can close new versions of code they own; others can ship closed forks.
- **GPL-3.0 without Affero.** Fine for the installer and extension; weak for the hosted control plane and marketplace, which are network services.
- **FUTO Source First / PolyForm Noncommercial / Commons Clause.** Source-available. Contradicts "open source". Does not stop a bad actor. Blocks distros and many contributors.
- **Open core (Bitwarden `/bitwarden_license`, Plausible CE vs cloud extras).** Paywalls code. Conflicts with "trust is not for sale" and "no capability behind pay".
- **AGPL plus CLA to a company.** Restores the relicensing lever Immich dropped on purpose.
