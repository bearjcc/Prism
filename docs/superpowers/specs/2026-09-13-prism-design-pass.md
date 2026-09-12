# Prism design pass: intentionality, undertone, interface

**Status:** implemented  
**Date:** 2026-09-13  
**Scope:** Extension popup/options, marketing home, Explore catalogue, mod detail

## Archaeology findings

### Extension popup and options

- Popup carries site controls, mods, and page activity without a brief capability summary; full disclosure lives only in options. Enabling a mod can trigger Chromium permission prompts with no preceding context in brief mode.
- Spacing uses ad hoc values (6-16px) with no shared scale; options body padding diverges from popup without semantic reason.
- "Allow once this session" reads as granting permission; checked state means skip/deny for the session.
- Page activity uses developer log format (`visual: modId -- rule`) and renders an empty list with no placeholder.
- Undo sits in the header beside the title with no scope hint.
- Import success/failure copy is minimal but truthful.

### Marketing home

- Prism scene uses heavy bloom (`stdDeviation` 42), screen blend mode, and a top-left radial wash that competes with top-right CTAs.
- Home steps duplicate Explore (`Enable a mod` and `Explore` both link to `/explore`); spec calls for Install, Enable, Create.
- Three narrative sections share identical padding rhythm (template-stacked).
- Desktop stage at 85dvh leaves large empty field above the spectrum strip.

### Explore and mod detail

- Site nav lists both Explore and Enable mods (same destination).
- Card hover lifts with `translateY(-2px)` (decorative motion, not continuity).
- Mod detail puts marketing copy before install panel and capabilities; screenshot sits below scopes.
- Honest zero stats are correct but repeat on every card without visual de-emphasis.

## Intended changes

### Intentionality

- Popup brief mode: one-line required-capability summary per mod; full toggles and disclosures stay in options.
- Mod detail: install and capabilities before pitch; screenshot after identity.
- Home steps: Install, Enable a mod, Create (remove duplicate Explore).
- Nav: drop redundant Enable mods link.

### Undertone / artistry

- Tone down prism scene bloom and stage wash; spectrum strip remains the Prism-specific moment.
- Quieter card hover (hairline only, no lift).
- Activity rows in plain language; uncertainty note retained when attribution is unknown.
- Rename session skip to "Skip this session" with matching disclosure copy.

### Design / spacing

- Extension: shared spacing tokens in popup.css; aligned section rhythm.
- Home narratives: varied vertical rhythm (lead section roomier, closing section tighter).
- Stats on cards: smaller, muted, honest.

### Interface / interruptions

- Page activity empty state when nothing is active.
- Undo relabelled with title attribute for scope.
- Import feedback distinguishes success, policy refusal, and parse errors.
- No new modals; progressive disclosure unchanged.

## Out of scope

- Popup re-cram (per 2026-09-07 spec).
- Fake installs, ratings, or urgency.
- Create page redesign.
