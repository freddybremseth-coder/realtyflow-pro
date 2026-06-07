# Re-Master pipeline job core

Status: first implementation slice for issue #27. This branch adds the durable job core only. It does not add a worker, cron executor, YouTube API calls, FFmpeg changes, Re-Master UI, SSE changes, or `songs.status` changes.

## Schema

New purpose-specific tables:

- `public.remaster_pipeline_jobs`
- `public.remaster_pipeline_job_events`

The legacy `public.pipeline_runs` table is not changed or reused.

Both new tables have RLS enabled and no open public policies. Writes are intended for protected server-side RealtyFlow APIs using server credentials.

## Lifecycle status

Lifecycle status is stored in `remaster_pipeline_jobs.status`:

```text
queued
running
waiting_retry
completed
failed
cancelled
```

Pipeline step is a separate field, `remaster_pipeline_jobs.pipeline_step`:

```text
pending
download_audio
analyze_song
generate_metadata
prepare_images
render_video
compose_thumbnail
upload_youtube
set_thumbnail
add_playlist
persist_results
completed
```

Pipeline steps are not lifecycle statuses.

## Idempotency

`buildRemasterPipelineIdempotencyKey` creates a deterministic SHA-256 key from whitelisted effective input:

- brand
- song ID
- stable audio reference/hash
- metadata version
- canonical JSON object ordering
- ordered slideshow image list
- logo URL
- thumbnail URL
- publishing settings
- input version

Secrets and transient runtime fields are excluded.

The database has a partial unique index on active jobs:

```sql
where status in ('queued', 'running', 'waiting_retry')
```

Completed jobs are not blocked by the database index, but repository creation requires a changed input version or explicit `forceNew` semantics.

## Claim and lease

`public.claim_remaster_pipeline_job` atomically claims one job using `FOR UPDATE SKIP LOCKED`.

The claim function can claim:

- `queued`
- `waiting_retry` where retry time and retry count allow it
- expired `running` jobs when the YouTube upload state is safe

Worker mutations use a lease token:

- `public.heartbeat_remaster_pipeline_job(job_id, lease_token, lease_seconds)`
- repository mutations that update upload checkpoints also filter by `job_id`, `lease_token`, and `status = 'running'`

## YouTube side-effect checkpoints

The model stores:

- `youtube_upload_started_at`
- `youtube_video_id`
- `youtube_url`

Rules:

- Before a future worker calls YouTube upload, it must persist `youtube_upload_started_at`.
- After YouTube returns a video ID, it must persist `youtube_video_id` immediately.
- If `youtube_video_id` exists, future retry logic must not call `videos.insert` again.
- If upload started but no ID was saved, automatic claim/retry is blocked and the job requires manual review.

## Events

`remaster_pipeline_job_events` stores ordered durable events with an identity `event_sequence`.

The event table is intended as the source of truth for diagnostics and future SSE views. SSE can become a convenience layer over persisted events, not the owner of job state.

## Tests

Unit tests cover:

- canonical idempotency keys
- changed input version after completion
- slideshow order preservation
- valid/invalid status transitions
- valid/invalid step transitions
- retry classification
- YouTube upload decision blocking
- cancellation before and after upload side effects

Isolated PostgreSQL migration tests cover:

- migration on empty database
- idempotent migration rerun
- constraints
- active duplicate protection
- completed duplicate key allowed at DB layer for explicit rerun semantics
- two concurrent claimers
- lease token required for heartbeat
- lease expiry recovery
- retry limit
- ambiguous YouTube upload not auto-claimed
- stored YouTube ID can resume safely
- event ordering

## Rollback

Before production application, rollback is a git revert.

After applying to a database, rollback is:

```sql
drop function if exists public.append_remaster_pipeline_job_event(uuid, text, text, text, text, text, jsonb);
drop function if exists public.heartbeat_remaster_pipeline_job(uuid, uuid, integer);
drop function if exists public.claim_remaster_pipeline_job(text, uuid, integer);
drop trigger if exists trg_remaster_pipeline_jobs_updated_at on public.remaster_pipeline_jobs;
drop function if exists public.set_remaster_pipeline_job_updated_at();
drop table if exists public.remaster_pipeline_job_events;
drop table if exists public.remaster_pipeline_jobs;
```

Only run rollback after confirming no production jobs have been created. Do not drop tables containing real job history without explicit approval.

## Next PR

The next PR should add protected server API endpoints for create/status/events/retry/cancel backed by this repository. It should still not move FFmpeg or the current Neural Beat pipeline execution.
