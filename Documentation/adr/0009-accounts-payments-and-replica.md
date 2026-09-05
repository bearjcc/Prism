# ADR 0009: Accounts, payments, and the hosted replica

## Status

Accepted. 2026-09-01.

## Context

Prism is usable without an account. Publication, comments, and ratings need a
stable identity, while hosted synchronisation is an optional convenience
service with operating costs. The main server-side risks are account
takeover, unnecessary personal data, and payment handling. Secrecy of a list
of public package identifiers is a lower-priority risk.

The architecture describes end-to-end encrypted managed sync. For the first
hosted replica, the product threat model instead requires industry-standard
account and transport protection, data minimisation, and no server-side
browsing or activity history. This ADR records that narrower, padlock-level
replica model.

## Decision

### Identity and sessions

- The first hosted sign-in is Google OpenID Connect.
- Prism stores the provider subject, an internal account identifier, account
  creation time, and an optional email address for recovery and support.
- Prism does not store a password database.
- Sessions use secure, HttpOnly, SameSite cookies with normal expiry and
  revocation controls. OAuth state, nonce, redirect URI, and token validation
  are server-side security requirements.
- The account record does not contain browsing history, page URLs, current
  origins, tab titles, extractor payloads, or activity events.
- Publication, comments, and ratings require an account. Browse, search,
  package download, and installation do not.

### Payments

- Stripe owns payment instrument collection and processing.
- Prism stores Stripe customer and subscription identifiers, entitlement
  state, billing status, and the minimum provider webhook data needed to
  reconcile that state.
- Prism does not store PAN, CVC, bank details, or payment instrument
  details.
- Subscription entitlement can enable the hosted replica only. It cannot
  change capabilities, local policy, package safety, publication eligibility,
  or install eligibility.
- Donations and supporter badges remain separate and have no product power.

### Replica contents and boundaries

- The hosted replica uses authenticated HTTPS and encrypted-at-rest storage,
  with access control, audit logging, backups, key management, rate limits,
  abuse detection, and incident response appropriate for an internet account
  service.
- The server may read the explicitly opted-in replica document. It may
  contain installed package identifiers and hashes, capability grants,
  behaviour policies, and lasting exact-origin exceptions.
- The replica must not contain activity logs, browsing or page URLs, tab
  titles, extractor payloads, page contents, credentials, cookies, or payment
  instruments.
- Session exceptions, in-memory failure counters, and activity history are
  local-only by default.
- Replica use requires both an eligible subscription and an explicit
  per-browser opt-in. Turning it off keeps all local state and stops future
  replication; it does not delete local packages or policies.
- Replica writes and public publication use separate authenticated
  operations. A replica update cannot create a public release, and publishing
  cannot opt a device into sync.
- Conflicts are resolved per replica key using a server-issued ordering
  value. The protocol preserves immutable package revision identity and
  records enough history for cross-device rollback.
- Each device has a revocable authorisation. Revoking one device removes its
  access without changing other devices or local state. Account sessions and
  device credentials have independent revocation.
- Local-only operation remains complete when the hosted service is unavailable.

## Consequences

This replica is not end-to-end encrypted against the Prism operator. That is
an intentional trade-off for a simpler recovery and account model. The server
still must not collect browsing telemetry or payment data, and the client
must make the replica opt-in and visible.

Account security work is a first-class product requirement: minimise stored
identity data, protect sessions, verify OAuth and Stripe webhooks, limit
administrative access, monitor abuse without recording browsing history, and
document breach response.

Self-hosting and a stronger client-held-key model remain possible future
protocols. They are not silently implied by this replica.

## Alternatives rejected

- **Client-held end-to-end encryption for the first replica.** It would add
  recovery and key-management complexity for a lower-ranked privacy threat.
- **Prism-managed card storage.** Stripe can collect payment instruments
  without Prism receiving PAN or CVC.
- **Store browsing telemetry for product analytics.** It is unnecessary for
  sync and conflicts with local-first privacy.
- **Make payment a safety or capability tier.** Trust and enforcement are not
  products for sale.
