# Altovena durable lead alert queue — development proposal

**17 October 2026 | stacked on Altovena lead attention PR #1454 | NOT released**

## What changed

The existing in-app list polls while a human has RealtyFlow open. A durable internal alert queue allows a separately scheduled server job to calculate alerts even when no one is signed in.

- Only `public.work_items` with `brand_id='altovena'`, `source_type='website_lead'`, and qualifying open statuses are considered.
- Three named alert kinds: `NOT_STARTED_15M`, `NOT_STARTED_24H`, `IN_PROGRESS_48H`. The first two mean status `TO_DO` or `REVIEW` and use `created_at`. The last means `IN_PROGRESS` and uses `updated_at`.
- `public.altovena_lead_alerts` stores a task FK, kind, state and timestamps only; no PII, message body or recipient.
- Unique `(work_item_id,kind)` + database-level advisory locking make repeated and overlapping scans idempotent.
- Alerts resolve automatically when their predicate is no longer true, e.g. staff starts or completes the task.
- Deleting an Altovena contact deletes its source tasks and thus associated queued alerts through `ON DELETE CASCADE`.
- The service-role-only `altovena_reconcile_lead_alerts()` RPC performs queue bookkeeping, not sending.
- One-row `altovena_alert_scan_state` records latest successful scan time and counts, so a configured but stopped scheduler is not reported as operational.
- A read-only, `crm.read`-protected `/api/workspaces/altovena/lead-alert-status` endpoint returns a PII-free heartbeat with `disabled`, `no_scan`, `recent` or `stale` status. The existing CRM panel displays that status to Freddy/Andrea when authorized.

## Scheduling and access

A `*/15 * * * *` Vercel Cron entry targets `GET /api/cron/altovena-lead-alerts`, **but the route is inert unless** `ALTOVENA_LEAD_ALERT_SCAN_ENABLED=true` is deliberately configured. The cron must present the server's `CRON_SECRET` as a Bearer token. Query-string or custom header secret fallback is NOT accepted. Nexus runtime controls and emergency cron safe mode may still halt it.

Do not set the feature flag in RealtyFlowPRO production until the complete dependency chain is installed, reviewed, and authorized. No customer API keys, public form intake or production DB changes were part of this PR.

## Important limitation

**A durable pending alert is NOT a delivered notification.** No email/SMS/WhatsApp/push, human subscription, provider send, retry receipt, dead-letter workflow or out-of-app notification guarantee has been implemented. Operators must still inspect RealtyFlow until independently reviewed delivery is ready. A future dispatch worker must have opt-in recipient policy, brand-specific verified recipients, independent authorization, rate limits, idempotent provider receipts, deduplication, bounce handling, secrets, rollback and private audit.

No email is generated or sent by the queue. Existing contact consent and autoresponder controls remain unchanged.

## Tests and release gates

The isolated PostgreSQL 17 suite applies the original intake schema and the new additive migration twice inside a rolled-back transaction, checks EXECUTE/SELECT denial for public roles, queues 15m/24h/48h alerts, repeats scans, resolves after human action, rejects cross-brand alerts and validates right-to-erasure cascade. HTTP tests cover missing/invalid credentials, scanner-off, safe mode, private response shape and malformed RPC rejection.

Require newest-head CI, current main synchronization, isolated staging schema and permission checks, test lead created while both operators are logged out, verified two-session Freddy/Andrea view of same task, disabled flag rollback, review of scheduled frequency/cost and explicit owner approval. Do not merge or deploy from synthetic results alone.
