# Google Drive Archive Flow

## What happens
- Published/used media is archived from Supabase URLs to Google Drive.
- Folder structure is now:
  - `Supabase/<tenant_slug>/<bucket_or_table>/<brand_slug>/<status>/file`

## Endpoints
- Manual trigger:
  - `POST /api/storage/archive-to-drive`
  - Requires `Authorization: Bearer <CRON_SECRET>` in production.
- Scheduled trigger:
  - `GET /api/cron/storage-archive`
  - Uses Vercel cron + `CRON_SECRET`.

## OAuth requirements
- Google OAuth scope must include:
  - `https://www.googleapis.com/auth/drive.file`
- Token sources:
  1. `GOOGLE_DRIVE_REFRESH_TOKEN` env
  2. `brand_settings` for `_system` (`google_drive_refresh_token`)
  3. fallback `youtube_refresh_token`

## Quick test
1. Ensure `_system` has a valid Drive-enabled refresh token.
2. Trigger:
   - `curl -X POST "$APP_URL/api/storage/archive-to-drive" -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":5}'`
3. Verify `archive_status='archived'` and `archive_destination` populated.

