# Re-Master job queue audit

Status: audit only. No job queue migration, worker, or runtime change was implemented in this branch.

Issue: #17

## Current entrypoints

| Entrypoint | Runtime shape | Notes |
| --- | --- | --- |
| `src/app/api/neural-beat/route.ts` `POST` | Starts `NeuralBeatPipeline.execute()` inside a streaming HTTP response. | Browser/SSE connection receives in-memory progress. `maxDuration = 300`. |
| `src/app/api/neural-beat/cron/route.ts` `GET` | Runs up to 3 songs sequentially inside one cron HTTP invocation. | Stops when the 300s function budget is close. No durable per-song job row. |
| `src/services/pipelines/neural-beat-pipeline.ts` | Single in-process executor. | Mutates `currentRun` and calls `onProgress`; no persisted step log. |

## Current pipeline steps

| Step | Input | Output | Database write | Storage write | External side effect | Main failure modes | Retry/idempotency notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Update Status to Processing | `songRecord.id` | song status set to `processing` | `songs.status` through `updateSongStatus` | none | none | schema/API update failure | Currently non-fatal. Safe to retry. |
| 2. Download Audio File | `songRecord.audioUrl` | accessible audio URL confirmed | none | temp audio file later in FFmpeg | HTTP HEAD to audio URL | expired Airtable URL, 404/403, network timeout | Safe to retry. Should detect Supabase URL vs expired legacy URL. |
| 3. Analyze Song with AI | title, artist, audio URL, metadata | genre, style, mood, energy, visual style, BPM | none | none | AI provider call | provider timeout/error, malformed response | Retryable if output not persisted; cache by song/audio hash would reduce cost. |
| 4. Generate YouTube SEO Metadata | song analysis | title, description, tags, thumbnail variants | none | none | AI provider call, trending tag lookup | provider timeout, malformed metadata | Retryable if metadata is not approved/persisted yet. Future metadata preview should persist candidate metadata before render. |
| 5. Generate & Fetch Images | song analysis, custom slideshow URLs | local image files, AI image buffers, fallback image URL | reads `genre_images` | temp files; later uploads generated AI images | AI image generation, fetch user/genre images | no images, failed downloads, provider timeout | Retryable before render. Custom URL downloads should be stored in job input for reproducibility. |
| 6. Render Video with FFmpeg | audio URL, local image paths, title, artist, optional logo | local MP4 path, video buffer, duration | none | temp render files | FFmpeg process | missing FFmpeg, timeout, memory/disk pressure, bad image/audio | Retryable if no upload happened. Needs worker/runtime with enough time, memory, and disk. |
| Thumbnail composition | AI image buffers, thumbnail variants, optional logo/custom thumbnail | thumbnail buffer and variant buffers | none | temp files | FFmpeg for thumbnail composition | FFmpeg error, bad custom thumbnail | Non-fatal today. Retryable before upload. |
| 7. Upload to YouTube | video buffer, metadata, schedule, thumbnail | YouTube video ID/URL, channel verification result | none directly | none | YouTube video insert, video lookup, thumbnail set, playlist insert | revoked token, wrong channel, upload timeout, partial success after video created | Highest idempotency risk. Must persist `youtube_video_id` as soon as known before any retry. |
| 8. Save Results to Database | YouTube URL/ID, analysis, metadata, thumbnail variants | `songs` updated; generated AI images saved to genre library | `songs`, `genre_images` | `neural-beat` bucket for thumbnails and generated AI images | Supabase Storage upload | DB write failure after YouTube upload, Storage upload failures | Must be resumable from known YouTube video ID; do not upload duplicate video if DB save failed. |
| 9. Generate & Upload YouTube Short | main video buffer, metadata, audio | optional Shorts URL/ID in `ai_metadata` | `songs.ai_metadata` | temp short video | FFmpeg short generation, YouTube upload | FFmpeg timeout, YouTube upload failure | Non-fatal today. Should be a separate child job after main video is safe. |

## Current persistence

The pipeline currently persists only final or error state to `songs`:

- start: `songs.status = 'processing'`
- success: `songs.youtube_url`, `songs.status = 'published'`, analysis fields, `ai_metadata`
- failure: `songs.status = 'error'`, `songs.error_message`, error metadata

The per-step state exists only in memory on `PipelineRun` and is streamed through SSE.

## Production schema audit

Read-only production checks against Supabase project `ereapsfcsqtdmzosgnnn` showed:

| Table | Production rows | Source/status |
| --- | ---: | --- |
| `public.songs` | 181 | Exists and is actively used by current pipeline. |
| `public.pipeline_runs` | 0 | Exists in production and `src/lib/supabase/schema.sql`, but not in `supabase/migrations`; no code writes it. |
| `public.youtube_videos` | 0 | Exists in production and schema file, but not used for Re-Master pipeline state. |
| `public.automation_runs` | not counted here | Exists and is used for general automation rules, not Neural Beat jobs. |
| `public.automation_logs` | not counted here | General logs; too generic for durable video step state. |
| `public.tasks` / `public.calendar_events` | not counted here | User/task/calendar concepts, not suitable as durable render jobs. |

`public.pipeline_runs` production columns:

```text
id uuid
song_id text
song_name text
status text default 'pending'
steps jsonb
error text
created_at timestamptz
completed_at timestamptz
```

`src/lib/supabase/schema.sql` defines a different legacy shape for `pipeline_runs`:

```text
type, status, steps_completed, current_step, error, song_name, youtube_url,
started_at, completed_at
```

This confirms migration/schema drift. Do not build a job queue on the old schema file alone.

## Gaps in existing tables

`pipeline_runs` is the closest existing production table, but it is not enough for a robust Re-Master queue as-is:

- no `brand`
- no durable status model for queued/rendering/uploading/scheduling/cancelled
- no `progress`
- no `retry_count` or `max_retries`
- no `heartbeat_at` / lease ownership
- no input configuration
- no selected slideshow image/logo/thumbnail fields
- no publishing settings
- no output video URL
- no YouTube video ID
- no idempotency key
- no step log table
- no cancel/retry semantics

The next implementation should either add an idempotent additive repair around `pipeline_runs` or create a purpose-specific Re-Master job table if review decides the existing table is too drifted.

## Runtime risks

Current code is vulnerable because one HTTP invocation owns the job:

- closing the browser can break the SSE stream and remove the only live progress channel
- a Vercel timeout kills the executor
- an FFmpeg crash loses step state unless the final catch can write to `songs`
- a YouTube upload may succeed while the later database write fails
- retrying the same request can upload a duplicate video
- cron can process multiple songs in one request but has no durable per-song checkpoint

Current Vercel docs list Fluid Compute defaults of 300s and Pro/Enterprise maximums up to 800s for Node.js/Python functions; without Fluid Compute, limits differ by plan. The current code sets `maxDuration = 300`, which is still a request timeout, not durable orchestration. See: https://vercel.com/docs/functions/limitations and https://vercel.com/docs/functions/configuring-functions/duration

FFmpeg-specific risks:

- video render uses `/tmp` and reads the completed MP4 into memory
- renderer comments estimate roughly 200-400 MB during segment processing, plus audio/video buffers and AI image buffers
- output size grows with MP3 duration and image count
- shorts generation is another FFmpeg pass after main upload
- Vercel memory is finite and temp disk is ephemeral per invocation

## Audit conclusion

The current pipeline can work for short/manual production runs, and the user confirmed the E2E flow succeeds today. It is not durable enough for autonomous or long-running production use.

The next phase should design a job model first, then implement in small PRs:

1. schema/job model
2. server API for create/status/logs
3. worker/executor
4. Re-Master status UI
5. retry/cancel
6. migration from request-owned SSE to durable jobs
