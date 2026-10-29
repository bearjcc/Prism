# Word replacer

Replace words and phrases in visible page text using rules you edit in Prism settings.

The mod runs on all sites (`<all_urls>`). It uses the `page.text.replace` capability only: rules are loaded in the extension, matching runs in the content script, and replacement text is inserted as plain text nodes (never HTML).

## Defaults

Bundled demo pairs (editable or removable in settings):

- `scuba` to `SCUBA` (whole word, case insensitive, literal replacement)
- `God` to `Magical Sky Daddy` (disabled by default)

## Scope

- Visible text nodes in the page body
- Not form values, contenteditable regions, code blocks, or SVG text
- Not `title` or attribute text (alt, placeholder) in v1

## Undo

Popup **Undo last change** restores the previous DOM snapshot for the last reversible mod action, including word replacements.

Per-site disable uses the normal **Disable on this site** control.
