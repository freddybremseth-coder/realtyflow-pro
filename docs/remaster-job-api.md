# Re-Master Job API

This PR adds protected server APIs over the durable Re-Master job core.

It does not add a worker, cron executor, FFmpeg execution, YouTube API calls, SSE changes, Re-Master UI, `songs.status` changes, or any production migration execution.

## Routes

```text
POST /api/neural-beat/jobs
GET  /api/neural-beat/jobs
GET  /api/neural-beat/jobs/:id
GET  /api/neural-beat/jobs/:id/events
POST /api/neural-beat/jobs/:id/retry
POST /api/neural-beat/jobs/:id/cancel
```

## Authentication

Every route requires one of:

- a valid RealtyFlow admin session cookie for an allowed admin
- `x-remaster-migration-secret` matching `REALTYFLOW_MIGRATION_SECRET`

The browser never receives the Supabase service-role key. Server routes create the server-side Supabase client and call the server-only repository.

`brand` is fixed server-side to `remasterfreddy`; client-supplied brand values are ignored.

## Response Safety

Job responses use explicit DTOs and do not return:

- `lease_token`
- `lease_owner`
- `lease_expires_at`
- raw `input_config`
- idempotency keys
- service credentials
- connection strings
- OAuth tokens

Events return:

- sequence
- event type
- level
- lifecycle status
- pipeline step
- safe message
- redacted details
- database correlation UUID
- created time

Every response includes an `x-correlation-id` header and `correlationId` body field. API correlation IDs are RealtyFlow-safe strings; repository event calls derive a stable UUID for the database `correlation_id uuid` column.

## Validation and Limits

`POST /api/neural-beat/jobs` validates:

- song ID
- input version
- audio reference
- metadata version
- slideshow image URLs, max 24
- logo URL
- thumbnail URL
- publishing settings
- max retries, 0 to 10

JSON bodies are limited to 32 KB. Write routes have a small in-memory per-identity rate limit as a minimum safety guard. This is not a durable distributed rate-limit system; add platform or database-backed rate limiting before exposing this to broader traffic.

## Retry and Cancel Rules

Manual retry only allows failed Re-Master jobs that:

- are under the retry limit
- are not in manual review
- do not have an ambiguous YouTube upload state

Cancel uses `requestCancel` from the repository. The response result is one of:

```text
cancelled
cancellation_requested
manual_review_required
already_terminal
```

The API never claims that YouTube-side effects were removed.

## Tests

`npm run test:remaster-jobs` covers the job core and the API layer. API tests use mocks and pure helpers only; they do not use a production database or production secrets.
