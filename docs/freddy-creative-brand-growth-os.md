# Freddy Bremseth creative portfolio — RealtyFlow/Nexus operating contract
Owner-approved on 2026-09-22. Canonical brand IDs and routing are **not** interchangeable.

## Brand, audience and channel map

| Brand | Role / primary content | Canonical channels | Autonomous rule |
| --- | --- | --- | --- |
| `freddyb` — Freddy Bremseth | Public personal umbrella: tell Freddy's own story as an artist, music creator, author and entrepreneur. Selected verified projects only. | Existing Freddy Bremseth Facebook **Page** (`1324025764122967`); website. Personal FB profile excluded. | Approval required; 2–3 curated personal posts per week; do **not** copy every child-brand post. |
| `freddyart` — Freddy Bremseth Art | Original art and Art Lounge: the artwork comes first; Re-Master is the credited soundtrack. | Dedicated art Instagram (exact IG business ID chosen by owner through Meta OAuth); art.freddybremseth.com. **No dedicated art Facebook Page** at present. | 1 approved low-resolution-preview Reel per Madrid calendar day, 15–35 s (27 s target), IG only. Stop if missing exact art Instagram OAuth or video/Meta proof. |
| `remasterfreddy` — Re-Master Freddy | Music: songs, videos, playlists; artwork is supportive, not the product. | Existing Re-Master Freddy Facebook Page and YouTube; music Instagram only if separately connected. | Preserve independently approved music publishing. Art Lounge may be promoted with *music-first* rewritten copy, not identical daily cross-posts. |
| `freddypublishing` — Freddy Publishing | Book titles, series, covers and sample chapters. | books.freddybremseth.com. Facebook binding is currently the SAME Page as `freddyb`, not a dedicated book Page. | No independent auto-posting on the shared Facebook Page; explicit editorial selection with first-person umbrella framing where appropriate. |
| `freddyai` | AI tools/product stories, not the owner biography or art. | Existing verified product destinations only. | Never mix product ads into Art or Re-Master feeds. |

## SAM / Nexus daily execution policy

1. Read `marketing_brand_growth_plans` and `brand_context` for the exact brand ID; use `social_channels + oauth_tokens` for destination. Never use legacy `social_accounts`, fallback to a look-alike page, the personal Facebook profile, or a shared token from another brand. A Page token used *only as the IG bridge* does **not** make that Page an Art Facebook destination.
2. Art gallery source = `art_gallery_works` where `published=true` with a validated public `art-previews/<work-id>/view.webp` preview. No private art originals, no unseen catalog entries, no invented prices, available originals, exhibitions or awards. `sync_freddy_art_growth_sources` keeps the isolated Art Growth OS source queue current; unpublishing blocks that source.
3. Daily Art Lounge Reel: select three visually distinct published art previews and original/authorized Re-Master audio; retain the whole painting (contain/pad) at 1080×1920 H.264/AAC; add actual art detail URLs and song credit. Do not use YouTube-exclusive rights without separate social rights. Deduplicate by Madrid date + IG destination. Persist MP4 and the exact caption before external publish.
4. Automatic Art delivery is allowed only when the exact `freddyart` Instagram channel is bound and its OAuth token and publish permissions verify. Use an idempotent attempt ledger; an ambiguous Meta response requires reconciliation/manual review rather than blindly attempting the same external post twice. A safe-mode/circuit-breaker kill switch always overrides auto.
5. Freddy umbrella Facebook: pick a small number of relevant ART/MUSIC/BOOKS milestones per week, make a **new** personal, first-person account of the real source and link the original; seek approval and respect 14-day creative-source cooldown. Do not post a full daily Art Reel to the umbrella automatically. Keep publishing/catalog promos on their own brand and verify destination if a book-specific Facebook Page is introduced.
6. Re-Master Facebook remains music-first, and should never inherit the art Instagram profile. Avoid same-caption crossposting, duplicate videos in adjacent days and deceptive «new release» claims on old catalog items. Reports should measure verified plays/engagement, saves, gallery clicks, art inquiries, book-page visits and subscribers separately per brand. Follower count alone is not a selection criterion.

## Connection / go-live checklist

- The owner must finish Meta login and select the actual Facebook Page *linked to the newly created Art Instagram account* at `/connections` under **Freddy Bremseth Art**. This authorizes IG publishing; the Page remains bound only to its original brand. Never create a fake `social_channels` row or populate `oauth_tokens` without the actual OAuth consent.
- Confirm the actual returned IG user ID and username with the owner (the earlier suggested handle was not verified); professional/business account, connected Facebook Page, app grant for `instagram_content_publish` and Page posting rights. DM/comment scopes are optional and **not** a blocker for Reels.
- Migrations and the render/publish cron may be deployed while `art_lounge_reel_settings.enabled=false`. Validate one real MP4 render (duration, orientation, audio, no painting crop), private-original denylist, and a real owned-account IG Reel publish/reconcile smoke test. Only then enable the dedicated Art flag. Owner has approved auto publishing at the agreed cadence; no need to ask for per-post approval after the channel-level activation and verified source checks pass.
- Current `freddypublishing` Facebook channel shares the professional umbrella Page. Keep book publishing on approval until owner intentionally chooses a dedicated Page or curated umbrella-only operation.
- If the user later creates an Art Facebook Page, explicitly connect it under `freddyart`, verify provider scopes, and introduce a *separate*, channel-native Art Facebook publishing rule. Do **not** silently re-enable identical daily Facebook/Instagram copies.

## Implementation references

`src/lib/marketing/brand-registry.ts` • `src/lib/brand-channel-brain.ts` • `src/lib/oauth/meta.ts` • `src/services/pipelines/art-lounge-reels.ts` • `src/app/api/cron/art-lounge-reel-*/route.ts` • `src/app/api/cron/art-growth-source-sync/route.ts`

The Art setup flag is a separate kill switch from existing Re-Master, real estate or Publishing plans. Never expand the existing Re-Master Facebook autopilot's scope by changing Art settings.
