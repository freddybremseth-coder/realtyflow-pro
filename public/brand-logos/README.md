# Brand Logos

Drop a transparent PNG here for each brand. The property-video renderer
auto-picks `<brandId>.png` and burns it into the bottom-right corner of
the rendered MP4.

Naming: lowercase brandId, `.png` extension. The brandIds in use:

- Zen Eco Homes uses purpose-built assets from zenecohomes.com: `zeneco-header-dark.svg` for light UI surfaces, `zeneco-header-light.svg` over dark hero imagery, `zeneco-mark.svg` for avatars/favicons, and `zeneco-watermark.svg` for reels/video/social/YouTube. The detailed full logo is reserved for large brand surfaces.
- `chatgenius.png` — Chat Genius
- `soleada.png` — Soleada
- `freddyb.png` — Freddybremseth.com
- `pinosoecolife.png` — Pinoso Eco Life

Recommended size: 400×400 PX or larger, transparent background. The
renderer resizes it to ~120 px wide on a 1280×720 frame and pads 16 px
from the right and bottom edge.

To override per-render, you can also pass `brandLogoUrl` in the
`/api/property-video` request body — that takes precedence over the
file in this folder.

If neither is provided, the video renders without a logo (no error).

## Zen Eco Homes identity lock

Do not recreate the former boxed ZE mark or the old “Presented by” sponsor card. Do not shrink the detailed full logo into a tiny UI or watermark. Reels, videos, social posts and YouTube assets must use the dedicated transparent Zen Eco Homes watermark. `zeneco-presented.svg` remains only as a compatibility copy of that watermark.
