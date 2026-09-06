# Kitten ad replacement

This tracer replaces extension-extracted advert slots with bundled kitten
images. It never receives page HTML, `document`, or page network access.

Replacement images are sized to each slot's reserved footprint before the
advert content is cleared, so the page layout stays stable.

The optional browser block list contains example third-party hosts only.
First-party adverts, including YouTube adverts, remain a slot extraction
problem.

## Bundled images

Ten ASCII-friendly SVG illustrations ship under `assets/`. The mod cycles
through them in slot order without network access.

## Optional remote images (`network.egress`)

Remote images stay off until the optional `network.egress` grant is enabled.
When granted, the extension broker performs a single GET to the declared
contract:

| Field | Value |
| ----- | ----- |
| Contract id | `remote-kitten-images` |
| URL pattern | `https://cataas.com/cat*` |
| Method | `GET` |
| Credentials | omitted |
| Success field | `{ url: "<final image URL>" }` |

The broker follows redirects, verifies the response is an `image/*` content
type, and checks the final URL still matches the contract. On deny, broker
failure, or non-image responses, the mod falls back to bundled SVGs.

Host permission: enabling the grant prompts for `https://cataas.com/*`.

Amy journey mapping:

1. Amy searches Prism's bundled mods for advert replacement.
2. The result explains the required slot replacement capability and optional
   network capabilities.
3. Amy reviews the package files and capability request.
4. Bob installs and enables the bundled mod in the Chromium extension.

No desktop service is required for these stages.
