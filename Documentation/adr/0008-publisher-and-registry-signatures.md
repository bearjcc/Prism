# ADR 0008: Publisher and registry signatures

## Status

Accepted. 2026-09-01.

## Context

Community packages are untrusted input. Local authoring, packing, import, and
runtime paths already repeat whitelist-first inspection. A public registry
adds provenance, immutable distribution, revocation, and review metadata, but
must not replace the client-side gate.

The registry needs a small signature model that works for offline execution
and does not turn a paid label into a safety claim.

## Decision

- A published package is addressed by the SHA-256 digest of its canonical
  archive. The blob identified by that digest is immutable.
- A publisher signs the package digest with Ed25519. The publisher account
  binds a stable publisher identifier to one or more current public keys.
- The registry signs an attestation over the package digest, publisher
  identifier, capability summary, and review labels. The attestation records
  provenance and pipeline status; it does not claim that the package is safe
  for every user or site.
- Publisher key rotation adds a new key, records its activation and retirement
  times, and keeps old verification keys available for historical releases.
  A compromise procedure publishes a revocation record for the affected key,
  publisher, or package digest and does not rewrite the package blob.
- Clients installing from the registry verify the archive digest, publisher
  signature, registry attestation, supported runtime version, package schema,
  and local `inspectPackage` result before activation.
- Local `.prism` imports remain available without a registry signature. They
  still verify the archive and run the same schema, inspector, capability, and
  runtime checks as registry packages.
- Revocation pauses matching public releases without replacing their content.
  Private local packages and their local state are unaffected.
- Updates reuse `capabilityDiff`. An increase in required, optional, or
  egress capability requires explicit renewed approval before activation.
- A paid human-verification label is metadata for a review queue. It is not
  required to install or run a release and does not weaken any client policy.
- The first registry uses Ed25519 signatures and content hashes. Sigstore and
  WebPKI are not selected for this registry.

## Consequences

An installed package can run without contacting the registry after the client
has verified and cached it. A compromised registry cannot silently substitute
different bytes under an existing digest.

The registry must retain immutable package metadata, signature history, and
revocation records. Key custody, access control, audit logs, and recovery
procedures are operational requirements and must not put live keys in the
public web application's source tree.

## Alternatives rejected

- **Trust the registry result without local validation.** A registry response
  is not a replacement for the extension's runtime boundary.
- **Mutable package URLs as identity.** A URL alone cannot prevent silent
  replacement.
- **Require a verified label to install.** Review status is not a capability
  or safety gate.
- **Sign only the publisher metadata.** The package bytes and capability
  summary must be bound to the signatures.
