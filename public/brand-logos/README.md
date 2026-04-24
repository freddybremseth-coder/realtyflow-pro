# Brand Logos

Drop a transparent PNG here for each brand. The property-video renderer
auto-picks `<brandId>.png` and burns it into the bottom-right corner of
the rendered MP4.

Naming: lowercase brandId, `.png` extension. The brandIds in use:

- `zeneco.png` — Zen Eco Homes (and the `donaanna` brand uses this same logo today; create a separate `donaanna.png` if/when you have one)
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
