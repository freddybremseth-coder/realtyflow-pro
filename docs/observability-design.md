# Observability design for Re-Master and RealtyFlow

Issue: #19

Status: design and utility foundation only. This document does not roll out logging changes to existing API routes.

## Goals

- Trace one user action from Re-Master through proxy routes, RealtyFlow APIs, Neural Beat pipeline steps, Storage writes, and YouTube uploads.
- Return safe diagnostics that Freddy can paste into a bug report without leaking secrets.
- Classify errors so the future job queue can retry only safe steps.
- Keep backwards compatibility with current API responses while new structured fields are introduced gradually.

## Correlation ID

Header:

```text
x-correlation-id
```

Format:

```text
rf_<unix-ms-base36>_<96-bit-hex-random>
```

Example:

```text
rf_mi7v4zk0_0123456789abcdef01234567
```

Rules:

- Re-Master creates an ID when starting an admin operation if one does not already exist.
- Re-Master sends it to its own serverless proxy routes as `x-correlation-id`.
- Re-Master proxy forwards the same header to RealtyFlow.
- RealtyFlow validates the incoming value and generates a replacement if it is missing or invalid.
- Pipeline services include the same ID in logs, job records, status events, and safe error envelopes.
- Browser-visible UI may show the ID as a support reference.

## Error codes

Error codes are uppercase ASCII and scoped by subsystem:

| Prefix | Subsystem | Examples |
| --- | --- | --- |
| `AUTH_` | Supabase/Auth/session | `AUTH_SESSION_EXPIRED`, `AUTH_FORBIDDEN_USER` |
| `RF_PROXY_` | Re-Master proxy | `RF_PROXY_TIMEOUT`, `RF_PROXY_BAD_RESPONSE` |
| `NB_` | Neural Beat pipeline | `NB_RENDER_FAILED`, `NB_ASSET_DOWNLOAD_FAILED` |
| `YT_` | YouTube | `YT_CHANNEL_MISMATCH`, `YT_UPLOAD_TIMEOUT`, `YT_TOKEN_REVOKED` |
| `STORAGE_` | Supabase Storage | `STORAGE_UPLOAD_FAILED`, `STORAGE_SIGNED_URL_FAILED` |
| `DB_` | Database | `DB_CONTRACT_MISSING_OBJECT`, `DB_WRITE_FAILED` |
| `AI_` | AI providers | `AI_METADATA_FAILED`, `AI_THUMBNAIL_FAILED` |

Codes are stable public diagnostics. Messages may change, codes should not.

## Retryable classification

Use one of:

```text
retryable
not_retryable
unknown
```

Default to `unknown` when the system cannot prove a retry is safe.

Retryable examples:

- transient network timeout
- provider 429/5xx
- temporary Storage upload failure before a durable output was committed
- FFmpeg process crash before YouTube upload

Not retryable examples:

- wrong YouTube channel
- revoked token
- invalid MP3 or image file
- policy/authorization failure
- validation failure
- any step after YouTube upload if duplicate protection cannot prove idempotency

## Safe diagnostics format

Use this shape for user-visible and machine-readable errors:

```json
{
  "ok": false,
  "error": {
    "correlationId": "rf_mi7v4zk0_0123456789abcdef01234567",
    "code": "YT_UPLOAD_TIMEOUT",
    "message": "YouTube upload timed out.",
    "retryable": "retryable",
    "status": 504,
    "details": {
      "step": "youtube_upload",
      "recordId": "song-id-or-job-id"
    }
  }
}
```

Safe diagnostics may include:

- correlation ID
- route name
- step name
- public record ID/job ID
- brand ID
- sanitized provider error code
- retryable classification
- timestamp
- non-secret counters and durations

Safe diagnostics must not include:

- Supabase service-role key
- Postgres connection strings
- OAuth access or refresh tokens
- signed upload token
- YouTube raw token response
- cookies
- Authorization headers
- user passwords or sessions
- full prompt payloads if they may contain private data

## Log fields

Use structured JSON logs where possible:

```json
{
  "timestamp": "2026-06-07T12:00:00.000Z",
  "level": "info",
  "correlationId": "rf_mi7v4zk0_0123456789abcdef01234567",
  "service": "realtyflow",
  "route": "/api/neural-beat",
  "brand": "remasterfreddy",
  "recordId": "song-id",
  "jobId": "future-job-id",
  "step": "rendering",
  "event": "step_started",
  "durationMs": 0,
  "retryAttempt": 0
}
```

Minimum fields:

- `timestamp`
- `level`
- `correlationId`
- `service`
- `route` or `component`
- `event`

Pipeline fields:

- `brand`
- `songId` or `recordId`
- `jobId`
- `step`
- `retryAttempt`
- `durationMs`
- `status`
- `errorCode`

## Redaction rules

Redact by key name when a key contains:

- `authorization`
- `cookie`
- `password`
- `secret`
- `token`
- `api_key`
- `service_role`
- `refresh_token`
- `access_token`
- `client_secret`
- `private_key`

Redact by value pattern for:

- `Bearer ...`
- JWT-looking strings
- common API-key prefixes such as `sk_`, `pk_`, `rk_`, `sbp_`
- Postgres connection strings before the host part

Use `[REDACTED]` as the replacement marker.

## Propagation path

```text
Re-Master browser
  -> Re-Master serverless proxy
  -> RealtyFlow API route
  -> Neural Beat pipeline service
  -> Storage / YouTube / AI providers
  -> pipeline status events and logs
```

The browser should:

- create or preserve `x-correlation-id` for admin operations
- display the ID on terminal errors
- not log secrets to console

The Re-Master proxy should:

- validate the ID
- forward it to RealtyFlow
- wrap proxy failures in a safe error envelope

RealtyFlow should:

- validate or create the ID at route boundaries
- attach it to logs and pipeline status updates
- return it in safe errors

The future job queue should:

- store correlation ID on the job row
- include it on every step log
- preserve it across retry and resume

## Backward compatibility

Do not break current clients that expect plain `{ error: string }` responses.

During migration, APIs can return both:

```json
{
  "error": "Kunne ikke starte videopipelinen.",
  "diagnostic": {
    "correlationId": "rf_mi7v4zk0_0123456789abcdef01234567",
    "code": "NB_START_FAILED",
    "retryable": "unknown"
  }
}
```

New routes should prefer the full error envelope. Existing routes should be migrated gradually.

## First utility scope

This PR adds:

- `generateCorrelationId`
- `isCorrelationId`
- `getOrCreateCorrelationId`
- `sanitizeErrorMessage`
- `redactSecrets`
- `createErrorEnvelope`

It does not update every API route yet.

## Rollout plan

1. Merge utility and design.
2. Add correlation ID creation to Re-Master admin API client.
3. Forward correlation ID from Re-Master proxy routes to RealtyFlow.
4. Add RealtyFlow route-boundary helper.
5. Update Neural Beat pipeline logs and SSE events.
6. Store correlation ID in the future durable job queue.
7. Convert high-risk routes to safe error envelopes.

## Rollback

This PR has no data migration and no production side effects.

Rollback:

- remove the utility file
- remove the utility test
- remove `test:observability`
- remove this document

No database rollback is required.
