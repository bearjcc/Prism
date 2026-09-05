# Community store, accounts, and sync implementation plan

Each phase has independent acceptance tests. Mark a phase `[x]` only when
its tests, documentation, and failure behaviour exist (`CONTRIBUTING.md`).

**Goal:** Add an anonymous public community store, identity-backed publishing,
and an optional hosted replica without making the control plane a runtime
dependency.

**Architecture:** The Chromium extension remains the local state authority.
The public registry distributes immutable, signed package revisions. A
separate control API owns account sessions, publication workflows, billing
entitlements, and the optional padlock-level replica. The public web app is
the browse and install funnel, not the enforcement runtime.

**Tech stack:** TypeScript, Next.js, Node control API, Postgres for account and
registry metadata, object storage for immutable package blobs, Meilisearch for
public catalogue search, Google OpenID Connect, Stripe, Ed25519 signatures,
and the existing `packages/schema` and extension validation paths.

## Global constraints

- AGPL-3.0-only first-party source; community packages retain their own
  licence field.
- ADR 0002 remains authoritative for the native host, Native Messaging,
  gateway, TLS proxy, and unrestricted userscript runtime.
- ADR 0007 reopens hosted registry, accounts, and replica work without a
  native host.
- ADR 0008 defines immutable package identity, publisher signatures, registry
  attestations, and revocation.
- ADR 0009 defines Google identity, Stripe payment boundaries, data
  minimisation, and the padlock-level replica.
- Browse, search, package download, and installation do not require an
  account, subscription, donation, or verified label.
- Publication, comments, and ratings require an account but not a subscription.
- Subscription entitlement can enable hosted replication only. It cannot
  change capabilities, policy, safety, publication, or installation.
- The extension re-runs schema validation, `inspectPackage`, capability
  checks, and runtime checks. A registry result is never a trust token.
- The server must not collect activity events, page URLs, current origins, tab
  titles, extractor payloads, page contents, credentials, cookies, or payment
  instruments.
- Sync and publication are separate operations. Neither operation implies the
  other.
- Installed packages and local policy continue when the control plane is
  unavailable.
- ASCII tracked files and NZ/GB spelling are required.
- Run `npm run build`, `npm test`, `npm run lint`, `npm run scan`, and
  `npm run test:e2e` before claiming the implementation is complete.

## Scope boundaries

This plan does not implement `apps/native`, Native Messaging, a gateway,
general TLS interception, Firefox store publication, hosted DNS, privacy
relays, donation product power, or unrestricted userscripts. It names
`apps/control` as a future AGPL control API boundary; creating that service
requires the phases below and must not move enforcement into the server.

The existing `apps/web` fixture catalogue remains usable without the control
plane until the registry read API and install handshake are implemented.

---

## Phase 1 -- Signing and ingest contracts

**Entry:** ADR 0008 and the existing package hash and validation contracts.

- [ ] Define schema types for canonical package digest, publisher key,
  publisher signature, registry attestation, review label, and revocation
  record.
- [ ] Define the signed payload bytes and canonical field ordering. The
  publisher payload binds the package digest and publisher identifier. The
  registry payload binds the digest, publisher identifier, capability summary,
  and review labels.
- [ ] Define Ed25519 key lifecycle fields for creation, activation, retirement,
  and revocation. Historical releases must remain verifiable until their key
  or package is explicitly revoked.
- [ ] Define registry and client error codes for malformed signatures,
  unsupported algorithms, digest mismatch, expired metadata, and revoked
  keys or releases.
- [ ] Add valid and invalid golden fixtures, including changed package bytes,
  changed capability summary, wrong publisher key, wrong registry key,
  malformed base64, and revoked release.
- [ ] Keep local sideload fixtures valid without a registry signature and prove
  they still require local inspection and runtime validation.

**Exit:** Shared types and golden fixtures specify a deterministic signature
contract without any HTTP service or live key.

## Phase 2 -- Anonymous registry read API

**Entry:** Phase 1 signature and ingest contracts.

- [ ] Define the public read contract for package metadata by stable package
  identifier and immutable digest.
- [ ] Serve immutable package blobs from object storage using the digest as
  the content identity. A changed blob must receive a new digest.
- [ ] Return publisher, version, licence, scopes, capability disclosures,
  supported runtime versions, review labels, revocation state, and signature
  metadata without requiring an account.
- [ ] Define public search fields and facets matching the marketplace design:
  popular/recent sort, supported site, publisher, signature state, and
  capability disclosure. Do not expose private account or replica fields.
- [ ] Add cache headers and a response size budget suitable for CDN caching.
- [ ] Add tests proving anonymous reads work, an unknown digest is rejected,
  revoked releases are marked unusable, and a digest cannot serve different
  bytes over time.

**Exit:** The public registry can be read anonymously and supplies enough
metadata for a listing and a client verification attempt. The fixture
catalogue remains the fallback while this phase is incomplete.

## Phase 3 -- Anonymous extension install handshake

**Entry:** Phase 2 immutable package reads and the existing `.prism` import
path.

- [ ] Define a user-initiated install message between the catalogue origin and
  the extension. Restrict `externally_connectable` to the controlled
  catalogue origin and use an explicit package URL plus expected digest.
- [ ] Make the extension fetch the selected package through the approved
  download path, verify digest and signatures, validate runtime compatibility,
  call `inspectPackage`, and store only after all checks pass.
- [ ] Reuse the existing compiled package cache validation on read and the
  existing activation gate. Do not create a registry-only activation path.
- [ ] Show exact package identity, publisher, licence, capabilities, optional
  sources, review labels, and any reapproval caused by a capability increase
  before activation.
- [ ] Do not send the current tab origin, installed-mod list, activity, or
  local policy to the catalogue. `find-mods` continues to open only the
  user-started `/explore?q=` URL.
- [ ] Keep manual local `.prism` import working without an account and
  without a registry signature.
- [ ] Add tests for anonymous install, invalid signature refusal, digest
  substitution refusal, revoked release refusal, offline execution after
  install, and no activation when the user cancels.

**Exit:** A user can go from an anonymous listing to a locally gated installed
package and run it without the registry remaining available.

## Phase 4 -- Accounts and community identity

**Entry:** Phase 2 public registry reads. This phase does not gate Phase 3
installation.

- [ ] Create the account contract around Google OpenID Connect. Validate
  state, nonce, issuer, audience, redirect URI, and token claims server-side.
- [ ] Store only an internal account identifier, Google subject, creation time,
  and optional email for recovery and support. Do not create a password
  database or browsing profile.
- [ ] Implement secure, HttpOnly, SameSite session cookies with expiry,
  logout, server-side revocation, and CSRF protection for state-changing
  browser requests.
- [ ] Require an account for comments, ratings, and publication. Keep
  browse, search, package download, and installation available logged out.
- [ ] Define publisher identity separate from display name. Bind publisher
  keys through the publication workflow rather than treating a Google
  account as a package signing key.
- [ ] Add rate limits, abuse controls, moderation states, and deletion or
  export handling without storing page history or activity telemetry.
- [ ] Add tests for valid and invalid OAuth state, session expiry and
  revocation, logged-out anonymous routes, authenticated comment/rating
  routes, and account deletion data minimisation.

**Exit:** The site has a minimal account boundary for community participation
and no account path is required for anonymous installation.

## Phase 5 -- Publication pipeline

**Entry:** Phases 1, 2, and 4; local `validate`, `inspectPackage`, and
`capabilityDiff` contracts.

- [ ] Accept a selected immutable revision only from an authenticated
  publisher account. Require public metadata, supported scopes, a licence,
  and explicit capability and information-flow disclosures.
- [ ] Run independent source and dependency secret scanning, provenance
  checks, manifest/schema validation, whitelist inspection, static policy
  checks, and declared fixture/compatibility tests.
- [ ] Generate the capability diff against the prior published revision and
  display increases before submission. A failed or incomplete check cannot
  publish a revision.
- [ ] Store the canonical archive by digest, create the publisher signature,
  then create the registry attestation. Keep signing keys outside the web
  application source tree and document access, rotation, backup, and
  compromise response.
- [ ] Provide moderation states for deceptive UI, affiliate insertion, abuse,
  malware indicators, licence problems, and appeals. A moderation decision
  must not mutate an accepted package blob.
- [ ] Add optional paid human verification as a label and queue. Do not make
  that label required for installation or execution.
- [ ] Add tests for missing licence, scan failure, fixture failure, scope
  escape, capability increase, signature mismatch, duplicate digest,
  moderation refusal, and unverified installation.

**Exit:** An authenticated publisher can submit a revision that becomes an
immutable, signed public release. The release can be installed or run without
payment or a verified label.

## Phase 6 -- Optional account-backed replica

**Entry:** Phase 4 account sessions and Phase 5 immutable package identity.

- [ ] Define the replica document as selected local state: installed package
  identifiers and hashes, capability grants, behaviour policies, and lasting
  exact-origin exceptions. Exclude activity, browsing/page URLs, tab titles,
  extractor payloads, page contents, credentials, cookies, session
  exceptions, in-memory failure counters, and payment instruments.
- [ ] Implement Stripe Checkout or equivalent hosted collection so Prism
  receives customer and subscription identifiers plus entitlement state, not
  PAN, CVC, or bank details. Verify webhook signatures and make entitlement
  updates idempotent.
- [ ] Require both active sync entitlement and an explicit per-browser
  "sync this browser" opt-in. Make the current sync state visible and
  reversible.
- [ ] Authorise devices independently. Issue a revocable device credential,
  list active devices, revoke one device, and ensure revocation cannot alter
  other devices or local state.
- [ ] Use authenticated HTTPS, encrypted-at-rest storage, access control,
  audit logs, backups, rate limits, abuse controls, and an incident response
  runbook. The first replica is padlock-level, not operator-blind
  end-to-end encryption.
- [ ] Reconcile replica keys independently. Use a server-issued ordering value
  for last-write-wins conflicts, preserve immutable package revision identity,
  and retain policy history sufficient for cross-device rollback.
- [ ] Make disable, subscription expiry, account logout, device revocation,
  and control-plane outage preserve local packages and policies. Stop
  replication without clearing local state.
- [ ] Add tests for opt-in gating, Stripe webhook replay, no payment data
  retention, forbidden telemetry fields, device revocation, conflicting
  updates, rollback, disable-without-loss, and offline local operation.

**Exit:** A subscriber can opt a browser into replica sync, revoke a device,
and return to local-only operation without losing local state.

## Phase 7 -- Cross-boundary regression and threat tests

**Entry:** Phases 1-6 have independently passing tests.

- [ ] Prove anonymous browse, search, download, and install with no telemetry
  consent and no account.
- [ ] Prove an installed package runs while registry, account, billing, and
  replica endpoints are unavailable.
- [ ] Prove invalid signatures, changed bytes, revoked releases, unsupported
  runtimes, and failed local inspection never activate a package.
- [ ] Prove a subscription, donation/badge state, or verified label cannot
  change capabilities, policy decisions, install eligibility, or publication
  safety checks.
- [ ] Prove a replica write cannot create a public release and publication
  cannot opt a browser into sync.
- [ ] Prove no server request contains current origin, page URL, tab title,
  extractor payload, activity event, page content, cookie, credential, or
  payment instrument.
- [ ] Prove a revoked device loses replica access while another device and
  local extension state continue operating.
- [ ] Run the full repository gates from the global constraints and record
  failures as implementation defects rather than waiving them.

**Exit:** Store, account, and replica boundaries are independently tested,
offline behaviour is preserved, and the threat model for replica metadata is
documented and reviewable.

## Deferred follow-up

- Self-hosted controller and user-controlled signing policy.
- Host reconciliation and Native Messaging.
- Client-held key encryption and stronger operator-blind recovery.
- Firefox store publication and AMO identity.
- Compatibility telemetry, only with explicit opt-in and sanitised fields.
- Registry governance, moderation appeals operations, and key compromise
  exercises beyond the first service runbook.
