# Architecture traceability

Maps `Documentation/architecture.md` requirements to the spec or phase that satisfies or defers them. Status is for maintainers scanning gaps, not a second work queue.

Plans: v1 = `Documentation/specs/2026-08-28-extension-v1-plan.md` plus `Documentation/specs/2026-08-28-mod-package-and-runtime.md`. Later = `Documentation/specs/2026-08-29-later-plan.md`. Historical host backlog = `Documentation/specs/2026-08-27-implementation-plan.md`.

| Requirement | Status | Satisfied by / deferred to |
| ----------- | ------ | -------------------------- |
| Chromium extension is v1 product; extension is local state authority | Satisfied | ADR 0002; v1 Phases A-G |
| Default deny; per-mod capabilities; undeclared use denied at runtime | Satisfied | v1 Phase C; mod-package spec |
| Local mods are untrusted at every boundary; whitelist inspection and DOM-less native runtime | Satisfied | ADR 0005; Mod policy layers spec; Phase AA |
| Native mod expression language; bounded WASM in or out of first runtime | Satisfied | ADR 0004: no CEL/JSON-logic/jq; CSS + DNR + `prism.*` + extractors; WASM out until a later ADR |
| Data not remote code: mods call `prism.*` only; no `document`, page `fetch`, cookies, extractor HTML | Satisfied | v1 Phases C-G; mod-package spec; ADR 0004 |
| Semantic handles (ad-slot, video id, comment JSON) not unrestricted DOM | Satisfied | v1 tracers D-F; extractors in `apps/extension/src` |
| Field-level egress; optional connectors off by default; response sanitise | Satisfied (v1 subset) | v1 kitten optional egress; SponsorBlock skip JSON; remaining broker rules stay in architecture |
| Browser network layer (DNR / declarative block) | Satisfied (v1 subset) | v1 kitten `network.browser.block`; cryptomining lists later |
| Visual capabilities (hide, replace slot, sanitised CSS/content) | Satisfied (v1 tracers + UserCSS map) | v1 Phases D-E; later Phase L corpus; later Phase V `mapUserCss` |
| Site exceptions; undo; activity events | Satisfied (v1 subset) | v1 popup origin disable, undo, activity tests; later Phase W current-page panel (`page-activity.ts`); later Phase Y session allow-once (`session-exception.ts`); later Phase Z toolbar badge, this-site popup, Find Explore search, first-party hide/pause context menu; host-shared activity schema still later |
| Behaviour: allow paste (global + per-origin) | Satisfied | later Phase K |
| Behaviour: popup, title freeze, autoplay, scroll-lock, modals, consent, same-origin actions | Satisfied (extension subset) | later Phases M-N-P; historical Phase 3 catch-up |
| UserCSS import with sanitise (not "CSS is harmless") | Satisfied (compiler + corpus + map) | `packages/schema` `compileUserCss` / `mapUserCss`; later Phases L and V |
| Restricted / unrestricted userscript worlds | Restricted satisfied; unrestricted deferred | later Phase O (`USER_SCRIPT` only); unrestricted still historical Phase 9 review gate |
| Local first; no account required; hosted not a runtime dependency | Satisfied | ADR 0002; v1 unpacked extension; architecture locked decisions |
| Trust is not for sale; AGPL-3.0-only; no CLA | Satisfied | ADR 0001; architecture "Openness, donations and subscriptions" |
| Explainability and reversibility | Satisfied (v1 subset) | v1 activity + undo; full policy conflict UI later |
| Graceful degradation / offline cache of active packs | Satisfied (v1) | extension storage of bundled and imported packs; later Phase X validates compiled cache on read; hosted fallback N/A in v1 |
| Local authoring and hot reload | Satisfied (v1 path) | rebuild + reload unpacked; desktop watch deferred (ADR 0002) |
| `.prism` zip import in the extension | Satisfied | v1 popup import; same schema as bundled mods |
| Firefox unpack target (thin shim over `src`) | Satisfied | ADR 0003; later Phase J |
| `References/` study-only; copy needs Documentation licence check | Satisfied | ADR 0001; `CONTRIBUTING.md`; later Phase I lockfile verify in lint |
| Firefox-as-product / AMO listing | Deferred | ADR 0002; later plan explicit non-goal |
| Desktop service as preferred state authority; Native Messaging | Deferred | ADR 0002; historical Phases 4-5 |
| Desktop UI, tray, Windows installer | Deferred | ADR 0002; historical Phase 5 |
| Host local store ADR (single writer, crash-safe) | Deferred | ADR 0002; historical Phase 0 ADR checkbox |
| Sideload-from-folder / OS-level DNS | Deferred | ADR 0002 risks; historical Phase 4 |
| Gateway DNS, firewall, IoT/TV, private services | Deferred | ADR 0002; historical Phases 13-14 |
| General TLS interception / page MITM proxy | Rejected | architecture non-goals; ADR 0002 |
| Hosted control plane, encrypted sync, web management | Deferred | ADR 0002; historical Phase 12; `apps/web` is a parallel fixture site (`Documentation/specs/2026-08-28-marketplace-website-design.md`), not hosted sync |
| Community registry, signing, immutable releases, capability-diff on update | Deferred | ADR 0002; historical Phase 10; Phase 0 signature ADR remains open |
| Publication workflow and secret scanning | Deferred | historical Phases 10-11 |
| List-based cryptojacking (gateway DNS + extension DNR lists) | Deferred | architecture cryptojacking flow; historical Phase 13; v1 has DNR for advert hosts only |
| First-party `page.resource-abuse` | Deferred | architecture behavioural expansion |
| Android profile / mobile enforcement | Deferred | ADR 0002; historical Phase 15 remainder |
| Marketplace website as v1 product | Deferred | ADR 0002; web visual work is parallel, not the extension gate |
| ASCII tracked files; NZ/GB prose | Satisfied | `scripts/check-text.mjs`; CI lint |
