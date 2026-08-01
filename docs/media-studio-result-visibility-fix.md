# Media Studio result visibility fix

## Root cause

`media_assets` and `media_projects` have two foreign-key paths:

- `media_assets.project_id -> media_projects.id`
- `media_projects.cover_asset_id -> media_assets.id`

The production PostgREST schema cache continued to reject embedded selects between these tables as ambiguous. This caused both `/api/media/assets` and `/api/media/projects` to return HTTP 500, even though generated assets and projects were stored correctly.

## Fix

The collection endpoints now return their own table rows without cross-table embeds:

- `/api/media/assets` selects from `media_assets` only.
- `/api/media/projects` selects from `media_projects` only.

The existing UI only needs those fields for Library and Projects. `project_id` remains available on each asset for explicit follow-up requests when needed.

## Operational impact

- No database migration is required.
- Existing assets become visible after deployment.
- Existing projects become visible after deployment.
- Generated files remain unchanged in the `media-studio` Storage bucket.

## Future relationship reads

When a screen needs project details and assets together, use separate scoped queries or a dedicated SQL/RPC response rather than a PostgREST embed across the circular relationship.
