# Altovena – operator email delivery preflight (no sending)

**18 October 2026 · stacked draft on PR #1457 → #1456 → #1454 → #1446 → #1400**

## This increment

- Introduces a **preparation-only** delivery candidate ledger `public.altovena_delivery_candidates`. Each unique `(alert_id,operator_key,email)` combination has a `PREPARED` or `CANCELLED` state; there is deliberately **no SENT/DELIVERED state** and no network integration. Operator key is a server HMAC, not raw email.
- Only active Altovena website-lead alerts of types **NOT_STARTED_24H** and **IN_PROGRESS_48H** qualify for future email. 15-minute alerts remain in-app only; no customer message, contact address or personal details are copied into this ledger.
- `altovena_prepare_operator_delivery(text,integer)` is a service-role-only, advisory-lock-protected RPC. It is bounded, idempotent, brand-scoped, cancels ineligible candidates when an item is completed, and never resurrects a cancelled candidate. FK cascade removes candidates on authorized task/contact erasure.
- Separate `altovena_operator_delivery_preflight(text)` reports only aggregate preparation counts. No public or authenticated PostgREST role has table or RPC access.
- The cron route `GET /api/cron/altovena-delivery-preflight` may create candidates but has **NO EMAIL SENDER IMPORT** and makes no SMTP/provider call. It accepts ONLY `Authorization: Bearer CRON_SECRET`, not query or arbitrary secret headers. It never accepts a caller-supplied recipient/brand/alert ID.
- The process remains inactive until BOTH `ALTOVENA_DELIVERY_PREFLIGHT_ENABLED=true` AND `ALTOVENA_LEAD_ALERT_SCAN_ENABLED=true` are explicitly set, **AND** Nexus has an explicit enabled `cron:/api/cron/altovena-delivery-preflight` control. Missing Nexus control fails closed. Vercel's 15-minute schedule is just a trigger, not permission to execute.
- Recipients are configured solely as **two explicit internal operator emails** in server-only `ALTOVENA_ALERT_RECIPIENT_EMAILS` (comma separated); a matching active owner admin email plus a separate active Altovena `crm.read` employee grant with independently verified Supabase Auth identity is required. All-or-nothing validation: **any invalid/missing or revoked grant prevents all preparation**. Never print recipient addresses, HMAC secret or per-user keys to logs. `ALTOVENA_ALERT_RECEIPT_HMAC_KEY` must be a secret available on the server only.
- Candidate state never claims delivered, accepted, opened, or sent. A provider receipt is not equivalent to a user reading the in-app notification. Personal in-app read receipts remain independent from this queue.

## Explicitly NOT done

**No actual out-of-app notification delivery exists yet.** This PR does not send any operator email, SMS, WhatsApp or push. It does not activate the public form, add user grants, provision production schema or alter customer data. No provider message ID, SMTP sending acknowledgement, retry execution or bounce handling is implemented.

For a later **real dispatch** increment, validate opt-in operational recipient policy, just-in-time grant verification, sender/from identity, rate limits, suppression exceptions if legally required, provider idempotency, crash-after-send ambiguity handling (quarantine/never blind retry), delivery receipt vs provider acceptance status, redacted audit and tested rollback. Any uncertain send outcome must remain UNKNOWN, not be automatically retried. Never use a generic customer bulk sender for an internal operational alert without independent review.

## Release gates

1. This PR's contract tests and isolated PostgreSQL transaction tests must pass at the exact latest head SHA.
2. Sync foundational #1400 branch with latest main and rerun stacked integration; no merge directly into production.
3. Execute in disposable staging only with two real authenticated operator accounts and app-grant revocation test. Verify no SMTP calls and zero email messages during preparation.
4. Review privacy minimization, digest/rate policy and Vercel runtime control deployment, then require explicit owner authorization separately for future real dispatch.
5. **Do not enable production flags from this document.**
