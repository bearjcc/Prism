# Kitten ad replacement

This tracer replaces extension-extracted advert slots with bundled kitten
images. It never receives page HTML, `document`, or page network access.

The optional browser block list contains example third-party hosts only.
First-party adverts, including YouTube adverts, remain a slot extraction
problem. The optional remote image contract is off until granted and can only
be reached through `prism.net.request`; bundled images remain the fallback.

Amy journey mapping:

1. Amy searches Prism's bundled mods for advert replacement.
2. The result explains the required slot replacement capability and optional
   network capabilities.
3. Amy reviews the package files and capability request.
4. Bob installs and enables the bundled mod in the Chromium extension.

No desktop service is required for these stages.
