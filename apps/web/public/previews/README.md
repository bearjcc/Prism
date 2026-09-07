<<<<<<< HEAD
# Explore preview images

Placeholder WebP assets for catalogue listings. Replace with live captures when available.

- `linkedin-home-first-degree.webp` - temporary placeholder until signed-in `/feed` capture.
=======
# Mod preview images

Explore cards and mod detail pages load screenshots from this directory at `/previews/{mod-id}.webp`.

## Current status: temporary placeholders

The `.webp` files here are **minimal placeholders** generated in CI/dev environments where live mod demos cannot be captured (YouTube, arbitrary ad pages). Each image is labelled "Temporary preview" in the asset itself.

A coordinator should replace them with real extension captures:

| File | Mod | Capture notes |
|------|-----|---------------|
| `kitten-ad-replace.webp` | Kitten ad replace | Fixture page with ad slots replaced by kittens |
| `youtube-home-videos.webp` | YouTube Home, videos only | youtube.com home with shorts/ads hidden |
| `youtube-reddit-comments.webp` | Reddit comments on YouTube | youtube.com/watch with Reddit thread panel |

Recommended size: 640×400 (16:10), WebP quality ~80.

Do not commit CSS-mock scenes as final previews. Paths are referenced from `apps/web/src/lib/catalogue.ts` as `previewSrc`.
>>>>>>> 0ba75c6 (Add temporary mod preview WebPs and capture README.)
