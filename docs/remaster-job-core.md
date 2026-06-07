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

Retry lifecycle is explicit:

- `running -> waiting_retry` when a leased worker schedules a retry.
- `waiting_retry -> queued` when the retry time is due. The claim function performs this activation before claiming.
- `queued -> running` when a worker claims a queued job.
- `failed -> queued` only through explicit manual retry.

`waiting_retry -> running` is intentionally invalid.

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

If two create requests race, the partial unique index remains the database guard. The repository catches PostgreSQL `23505`, reloads the existing active job by idempotency key, and returns it as `{ duplicate: true }` instead of surfacing a raw database error.

## Claim and lease

`public.claim_remaster_pipeline_job` atomically claims one job using `FOR UPDATE SKIP LOCKED`.

The claim function can claim:

- `queued`
- `waiting_retry` only after it is atomically activated back to `queued`
- expired `running` jobs when the YouTube upload state is safe

The claim function will not claim jobs where:

- `manual_review_required = true`
- `retry_classification = 'manual_review'`
- `retry_classification = 'not_retryable'`
- `youtube_upload_started_at` exists without `youtube_video_id`

Worker mutations require a current, non-expired lease. Job ID plus lease token is not sufficient; database functions also require `lease_expires_at > now()`.

- `public.heartbeat_remaster_pipeline_job(job_id, lease_token, lease_seconds)`
- `public.transition_remaster_pipeline_job(...)`
- `public.mark_remaster_youtube_upload_started(...)`
- `public.record_remaster_youtube_video(...)`
- `public.release_remaster_pipeline_job_lease(...)`

Stale workers receive stable domain codes such as `LEASE_EXPIRED` or `LEASE_TOKEN_INVALID`.

## Atomic transitions

`public.transition_remaster_pipeline_job` locks the current row, verifies `expectedStatus`, validates lifecycle and pipeline-step transitions, validates the lease when required, updates the job, and writes a durable event in the same transaction.

The server-only repository wraps this as:

```text
transitionJob(jobId, expectedStatus, nextStatus, updates, leaseToken?)
```

Repository helpers built on the transition model include:

- `listJobs`
- `transitionJob`
- `markFailed`
- `scheduleRetry`
- `manualRetry`
- `releaseLease`
- `requestCancel`
- `appendEvent`

Stable error codes include:

```text
INVALID_JOB_TRANSITION
INVALID_PIPELINE_STEP_TRANSITION
LEASE_EXPIRED
LEASE_TOKEN_INVALID
JOB_DUPLICATE_ACTIVE
RETRY_LIMIT_REACHED
YOUTUBE_UPLOAD_AMBIGUOUS
YOUTUBE_VIDEO_CONFLICT
CANCELLATION_REQUIRES_MANUAL_REVIEW
```

## Cancellation

Cancellation is atomic and based on the current database row:

- `queued` and `waiting_retry` become `cancelled`.
- `running` before upload stores `cancel_requested_at` and lets the worker stop at a safe checkpoint.
- after `youtube_upload_started_at` or `youtube_video_id`, cancellation marks `manual_review_required` and `retry_classification = 'manual_review'`.
- `completed` and `cancelled` are left unchanged.

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
- `markYoutubeUploadStarted` requires a valid lease and only succeeds when `youtube_upload_started_at` and `youtube_video_id` are both null.
- `recordYoutubeVideo` requires a valid lease, allows the same YouTube ID idempotently, and rejects a different ID with `YOUTUBE_VIDEO_CONFLICT`.

## Events

`remaster_pipeline_job_events` stores ordered durable events with an identity `event_sequence`.

The event table is intended as the source of truth for diagnostics and future SSE views. SSE can become a convenience layer over persisted events, not the owner of job state.

Events include optional `correlation_id uuid` so a future request can be traced from Re-Master through RealtyFlow and the worker.

## Tests

Unit tests cover:

- canonical idempotency keys
- changed input version after completion
- slideshow order preservation
- valid/invalid status transitions
- valid/invalid step transitions
- stable domain error codes
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
- stale worker mutation blocked after lease expiry
- old lease token blocked after recovery
- manual-review and not-retryable claim exclusion
- invalid transition rejection
- retry limit
- ambiguous YouTube upload not auto-claimed
- stored YouTube ID can resume safely
- cancel/request-cancel race before and after upload start
- double upload-start rejection
- same YouTube ID idempotency
- different YouTube ID conflict
- lease release token enforcement
- transition event consistency
- event correlation ID storage
- event ordering

## Rollback

Before production application, rollback is a git revert.

After applying to a database, rollback is:

```sql
drop function if exists public.request_remaster_pipeline_job_cancel(uuid, text, uuid);
drop function if exists public.release_remaster_pipeline_job_lease(uuid, uuid, uuid);
drop function if exists public.record_remaster_youtube_video(uuid, uuid, text, text, uuid);
drop function if exists public.mark_remaster_youtube_upload_started(uuid, uuid, uuid);
drop function if exists public.transition_remaster_pipeline_job(uuid, text, text, text, integer, text, timestamptz, text, text, uuid, boolean, text, text, jsonb, uuid);
drop function if exists public.append_remaster_pipeline_job_event(uuid, text, text, text, text, text, jsonb, uuid);
drop function if exists public.heartbeat_remaster_pipeline_job(uuid, uuid, integer);
drop function if exists public.claim_remaster_pipeline_job(text, uuid, integer);
drop function if exists public.remaster_pipeline_job_step_transition_is_valid(text, text);
drop function if exists public.remaster_pipeline_job_status_transition_is_valid(text, text);
drop trigger if exists trg_remaster_pipeline_jobs_updated_at on public.remaster_pipeline_jobs;
drop function if exists public.set_remaster_pipeline_job_updated_at();
drop table if exists public.remaster_pipeline_job_events;
drop table if exists public.remaster_pipeline_jobs;
```

Only run rollback after confirming no production jobs have been created. Do not drop tables containing real job history without explicit approval.

## Next PR

The next PR should add protected server API endpoints for create/status/events/retry/cancel backed by this repository. It should still not move FFmpeg or the current Neural Beat pipeline execution.
