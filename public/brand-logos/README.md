# Brand Logos

Drop a transparent PNG here for each brand. The property-video renderer
auto-picks `<brandId>.png` and burns it into the bottom-right corner of
the rendered MP4.

Naming: lowercase brandId, `.png` extension. The brandIds in use:

- Zen Eco Homes does **not** use a local `zeneco.png` fallback. Its canonical approved logo is `https://www.zenecohomes.com/api/brand-assets/zeneco-logo` (transparent PNG) and `https://www.zenecohomes.com/assets/zeneco-logo.svg` (website SVG).
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

Do not recreate the former boxed ZE mark or the old “Presented by” sponsor card. Zen Eco Homes renderers must use the canonical approved villa / gold sun / deep-teal wave logo from zenecohomes.com. The local `zeneco-presented.svg` is only a transparent compatibility copy of that approved mark.
