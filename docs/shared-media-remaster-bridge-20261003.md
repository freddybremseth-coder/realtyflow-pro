# Shared Media · Re-Master bridge

Date: 2026-10-03

## Goal

Media Studio is the canonical generic media library and job surface. Re-Master remains the specialist rendering engine for music/Reels.

This bridge connects the two without copying rendered files.

## Reference-only contract

When a Re-Master Reel reaches a usable rendered state:

1. the MP4 stays in the existing `remaster-reels` storage bucket;
2. a canonical `media_generation_jobs` projection is upserted with provider `remaster`;
3. a canonical `media_assets` row is upserted with the same source job UUID;
4. the Media Studio asset points to the existing bucket/path/public URL;
5. metadata records `bridgeMode=reference-only` and `copiedFile=false`.

This makes the Reel discoverable to Content and Marketing through the existing Media Studio contracts without creating a second file.

## Idempotency

The Re-Master job UUID is reused as the canonical Media Studio job/asset identity. Before an upsert, the bridge verifies that an existing row with that UUID belongs to the same provider/source job. A conflicting identity fails closed instead of overwriting unrelated media.

## Runtime paths

- New manual Re-Master Reel renders mirror automatically after the source Reel has been safely marked `ready`.
- `POST /api/media/specialist-sync/remaster` provides an admin-only, idempotent backfill for existing ready/published/needs-review Reels with video files.
- A Shared Media failure does not turn an otherwise successful source render into a failed Reel. The caller receives a bridge warning, while the source video remains available for retry/backfill.

## Boundaries

- Re-Master keeps music selection, visual selection, rendering and publishing-specific concepts.
- Media Studio owns the generic reusable job/asset representation.
- No customer data is copied.
- No storage bucket is migrated.
- No RLS is widened.
- Mirrored assets are not automatically human-approved; normal Content Hub/favorite approval signals still apply before Marketing treats them as approved content.
