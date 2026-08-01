# Media Studio result visibility and Voice Studio release

## Relationship root cause

`media_assets` and `media_projects` have two foreign-key paths:

- `media_assets.project_id -> media_projects.id`
- `media_projects.cover_asset_id -> media_assets.id`

The production PostgREST schema cache continued to reject embedded selects between these tables as ambiguous. This caused both `/api/media/assets` and `/api/media/projects` to return HTTP 500, even though generated assets and projects were stored correctly.

## Relationship fix

The collection endpoints now return their own table rows without cross-table embeds:

- `/api/media/assets` selects from `media_assets` only.
- `/api/media/projects` selects from `media_projects` only.
- `/api/media/jobs` uses the persisted `result_assets_json` instead of an unnecessary asset embed.

`project_id` remains available on each asset for explicit follow-up requests.

## Client resilience

Media Studio loads each endpoint independently. A temporary failure in Projects, Templates or Overview no longer prevents valid Jobs and Library data from appearing.

Completed Jobs render their result assets directly, including:

- image preview
- video player
- audio player
- download
- image variant
- Content Hub export

## Voice Studio

Voice Studio uses the OpenAI text-to-speech provider when `OPENAI_API_KEY` is configured. Results are persisted through the same job and asset pipeline as image and video generation.

The additive migration:

```text
supabase/migrations/20260801194500_media_studio_voice_assets.sql
```

adds the supported audio MIME types to the existing Storage bucket and creates a system voice-over template.

## Deployment impact

- The relationship fix itself does not alter tables.
- The Voice Studio release requires the additive migration above.
- Existing images and projects become visible after deployment.
- Existing files remain unchanged in the `media-studio` Storage bucket.
- Vercel must have a server-side `OPENAI_API_KEY` before Voice Studio reports availability.

## Future relationship reads

When a screen needs project details and assets together, use separate tenant-scoped queries or a dedicated SQL/RPC response rather than a PostgREST embed across the circular relationship.
