# Mod preview images

Explore cards and mod detail pages load screenshots from this directory at `/previews/{mod-id}.webp`.

## Current status: temporary placeholders

The `.webp` files here are **minimal placeholders** generated in CI/dev environments where live mod demos cannot be captured (YouTube, arbitrary ad pages).

## Source captures

Live extension captures live in `prism-design-audit/previews/{mod-id}.png` at the repo root (not committed by default until a capture pass lands).

Convert PNG sources to WebP for the site:

```bash
node scripts/convert-preview-pngs.mjs
```

Output is written to `apps/web/public/previews/*.webp` at 640x400 (16:10 cover crop), WebP quality 82.

| File | Mod | Capture notes |
|------|-----|---------------|
| `kitten-ad-replace.webp` | Kitten ad replace | Fixture page with ad slots replaced by kittens |
| `youtube-home-videos.webp` | YouTube Home, videos only | youtube.com home with shorts/ads hidden |
| `youtube-reddit-comments.webp` | Reddit comments on YouTube | youtube.com/watch with Reddit thread panel |
| `linkedin-home-first-degree.webp` | LinkedIn Home, first degree | Signed-in `/feed` capture when available |

Paths are referenced from `apps/web/src/lib/catalogue.ts` as `previewSrc`.
