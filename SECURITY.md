# Security

Report vulnerabilities privately. Do not open a public issue, pull request, or discussion for an exploitable defect.

## How to report

Use GitHub private vulnerability reporting on this repository:

https://github.com/bearjcc/Prism/security/advisories/new

Include the affected path or package, how to reproduce it, and what you believe an attacker gains. Do not attach live credentials, other people's data, or a weaponised exploit.

## Scope

In scope: the official extension, `packages/schema`, first-party mods under `mods/`, pack and scan scripts, and any later official host, registry, or replica that ships from this tree.

Out of scope as product defects: a third-party client that reads `.prism` files and skips the capability gate; a fork that uses a different name; social engineering of end users.

A passing test suite and `npm run scan` are not a review. Unreviewed edits and third-party mods stay untrusted.

## After a report

Maintainers will acknowledge, fix or reject, and agree timing before any public write-up. Do not publish a working exploit before a fix is available on the default branch, or after a reasonable embargo if we are already patching.

There is no paid bug bounty yet.

## Catalogue signing keys

The web marketplace signs `catalogue-index.json` with Ed25519. The extension pins only the **production public key** in source. The private seed must live in `PRISM_CATALOGUE_SIGNING_KEY` (GitHub Actions and Railway), never in git.

An early fixture key pair was once committed under `scripts/marketplace-fixture-signing.mjs`; that private key is compromised and the public key is blocked. Rotate using `node scripts/generate-catalogue-signing-keypair.mjs` and follow `apps/web/README.md`.

## Corresponding source

Store listings and hosted copies of modified first-party code must offer AGPL corresponding source. That is a licence duty, not extra safety.
