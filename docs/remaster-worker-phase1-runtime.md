# Re-Master Worker Phase 1 Runtime Decision

Issue: [#33 Implement Re-Master worker phase 1](https://github.com/freddybremseth-coder/realtyflow-pro/issues/33)

Status: runtime assessment plus disabled-by-default skeleton only.

This PR does not claim jobs, start a worker loop, call FFmpeg, call YouTube, generate media, touch Storage, migrate the current Neural Beat pipeline, modify `songs.status`, or change production schema.

## Current Gate

The read-only Re-Master `Produksjonsjobber` UI must be reviewed and verified before any worker code is allowed to claim jobs. Until then, the skeleton returns `claim_disabled` even when `REMASTER_WORKER_ENABLED=true` and config is otherwise valid.

## Runtime Options

| Runtime | Fit | Notes |
| --- | --- | --- |
| Vercel Serverless / scheduled request | poor for later media work | Short-lived request model is not a good owner for FFmpeg, heartbeats, clean shutdown, or long retries. Useful later only as a control-plane trigger. |
| GitHub Actions runner | poor for production worker | Useful for tests, not for continuous queue ownership. Harder operational logs/secrets model for a durable media worker. |
| Existing VPS / Docker host | best current candidate | Supports long-lived process, controlled concurrency, restart policy, secrets, outbound HTTPS, logs, and later FFmpeg filesystem needs. |
| Managed container worker platform | good future candidate | Also suitable if Freddy chooses a managed runtime with restart policy, logs, secrets, and enough disk/CPU for FFmpeg. |

Recommendation: use a standalone Docker/container worker on the existing VPS or another durable container runtime for phase 1 smoke tests and later FFmpeg work. Keep Vercel as API/control plane, not as the media executor.

## Configuration

No values are committed. Defaults fail closed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `REMASTER_WORKER_ENABLED` | `false` | Must be true before a worker can attempt startup. In this PR, startup still does not claim. |
| `REMASTER_WORKER_ID` | `remaster-worker-disabled-local` | Stable non-personal worker identity. |
| `REMASTER_WORKER_POLL_INTERVAL_MS` | `10000` | Future polling interval. |
| `REMASTER_WORKER_LEASE_SECONDS` | `60` | Future lease duration. |
| `REMASTER_WORKER_HEARTBEAT_INTERVAL_MS` | `20000` | Must be shorter than lease duration. |
| `REMASTER_WORKER_MAX_CONCURRENCY` | `1` | Locked to 1 in this phase. |
| `REMASTER_WORKER_TEST_SONG_PREFIX` | `REMASTER-WORKER-TEST-` | Future synthetic job allowlist prefix. |
| `REALTYFLOW_API_URL` | unset | Required only when enabled. |
| `REALTYFLOW_MIGRATION_SECRET` | unset | Required only when enabled; never logged. |

## Skeleton Behavior

`runRemasterWorkerSkeleton()` returns:

- `disabled` when `REMASTER_WORKER_ENABLED` is absent/false.
- `invalid_config` when enabled but required config is missing or unsafe.
- `claim_disabled` when enabled and valid, because this PR intentionally does not claim jobs.

This guarantees:

- default behavior performs no queue mutation
- no production job can be claimed by this PR
- no lease token is generated or logged
- no worker secret is logged
- no synthetic test job can be touched yet

## Future Phase 1 Requirements

The next worker PR, after UI verification, should add:

- server-enforced synthetic test-job gate
- atomic claim of exactly one eligible test job
- heartbeat loop
- cancellation observation
- safe release to `waiting_retry`
- process interruption and lease-expiry recovery tests
- no FFmpeg, YouTube, Storage, or real pipeline steps

## Rollback

This PR is inert by default. Rollback is:

1. keep `REMASTER_WORKER_ENABLED=false`, or
2. remove the skeleton with a git revert.

No production database rollback exists because this PR performs no production database work.
