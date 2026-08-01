# AI Media Studio production checklist

## Required deployment steps

1. Merge the Media Studio release PR into `main`.
2. Run Supabase migration `20260801194500_media_studio_voice_assets.sql`.
3. Confirm Vercel production has:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `REALTYFLOW_SESSION_SECRET`
   - `GEMINI_API_KEY` for Gemini image generation
   - `OPENAI_API_KEY` for Voice Studio
4. Redeploy production after environment changes.

## Result visibility verification

- `GET /api/media/assets?limit=60` returns HTTP 200 and existing asset rows.
- `GET /api/media/projects` returns HTTP 200 and existing project rows.
- `GET /api/media/jobs?limit=40` returns HTTP 200 and completed jobs include `result_assets_json`.
- Media Studio → Library renders existing images.
- Media Studio → Projects renders auto-created projects.
- Media Studio → Jobs renders image, video or audio results directly.

## Voice Studio verification

- Provider badge shows `OpenAI Voice: available` when the key is configured.
- Generate a short MP3 voice-over.
- The job finishes as `completed`.
- An `audio` row is created in `media_assets`.
- The audio player works in Jobs and Library.
- Download works.
- Content Hub export works.

## Avatar boundary

Avatar Studio must remain unavailable until a connected provider reports an avatar capability. Do not mark it available based only on features shown on a provider's website.
