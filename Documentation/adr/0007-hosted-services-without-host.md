# ADR 0007: Hosted registry and replica without a native host

## Status

Accepted. 2026-09-01.

## Context

ADR 0002 made the Chromium extension the v1 product and deferred the native
host, gateway, hosted registry, and synchronisation. The extension now has a
validated package format, a capability gate, immutable local package cache,
and an anonymous fixture catalogue in `apps/web`.

The hosted features do not require a native host. Public package distribution
and an optional replica can communicate directly with the extension and the
web application while the extension remains the local state authority.

## Decision

- Reopen hosted public registry, account, and optional replica work without
  reopening the native host or gateway.
- The extension remains the local state authority until a later ADR explicitly
  introduces a host. A hosted service is never required to activate installed
  mods or enforce local policies.
- Public browsing, search, package download, and installation remain usable
  without an account or subscription.
- Account identity is required for publication, comments, and ratings. The
  account requirement does not apply to browsing, search, or installation.
- The hosted replica is an optional service for explicitly opted-in devices.
  It receives selected local state, not browsing or activity telemetry.
- `apps/web` remains the public site and install funnel. A future control API
  may live in `apps/control`, but neither directory is implemented by this
  ADR.
- A Prism-operated replica is the first hosted deployment considered by this
  work queue. A self-hosted controller remains a compatibility goal and needs
  its own protocol and operations design before implementation.
- Registry distribution, publication, accounts, payments, and private
  replication are separate operations. Success or failure in one operation
  must not silently authorise another.

## Consequences

The extension can install and run a public package while anonymous, and can
continue running it when the control plane is unavailable. A later host can
be added as an authority for local state only through a new decision.

Hosted implementation must expose documented network contracts and keep
enforcement in the AGPL client. Registry results are inputs to the client
validation path, never a runtime trust token.

## Alternatives rejected

- **Build the native host first.** It expands the delivery boundary before the
  extension and registry contracts need it.
- **Require an account for installation.** It conflicts with the anonymous
  install funnel and makes public distribution depend on identity.
- **Make the hosted service the runtime.** It conflicts with local-first
  operation and would make outages disable installed policies.
