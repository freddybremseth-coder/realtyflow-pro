# Altovena SMTP staging boundary — 18 October 2026

**Draft, dependent on #1458 → #1457 → #1456 → #1454 → #1446 → #1400. No production launch.**

## What is implemented

An isolated PostgreSQL **single-attempt SMTP ledger** adds service-role-only `altovena_claim_operator_smtp(text)`, `altovena_finalize_operator_smtp(uuid,text,text,text)` and `altovena_operator_smtp_status(text)`.

- **PREPARED** candidate (existing preflight) is atomically consumed by a unique `ATTEMPTING` row BEFORE any outbound network I/O. Every candidate is claimed no more than once for its lifetime. An orphan `ATTEMPTING` row after a crash is **not automatically retried or reclaimed**.
- Only Altovena `website_lead` pending alerts `NOT_STARTED_24H` and `IN_PROGRESS_48H` can be claimed. Re-check source, brand, task status and age in the actual claim SQL. All service-role RPCs and table operations explicitly deny `anon` and `authenticated`.
- One SMTP invocation per recipient per request (at most two messages). Recipients come ONLY from server-side `ALTOVENA_ALERT_RECIPIENT_EMAILS` and are reverified against current Altovena brand grants and Supabase Auth (including a second check **after claiming, immediately before network sending**). No customer names, messages, emails or phone numbers appear in notification content.
- An SMTP client result with a valid `messageId` becomes **SMTP_ACCEPTED**; this proves only server acceptance, **not inbox delivery**. Any exception, timeout, client error, missing message ID, grant revocation or unconfirmed result becomes **OUTCOME_UNKNOWN**. Completed outcomes are immutable. No blind retries, no auto escalation to a new attempt after a timeout.
- The read-only human-only status endpoint and operator UI distinguish **ATTEMPTING**, **SMTP_ACCEPTED**, **OUTCOME_UNKNOWN**, with `deliveryConfirmed:false`. Existing personal in-app read receipts remain separate.

## Environment and runtime limits

Actual SMTP is accessible only through the **manual preview route** `/api/cron/altovena-smtp-staging` guarded by:
- exact `Authorization: Bearer CRON_SECRET` (not URL or alternate header)
- `VERCEL_ENV=preview` (HARD production block)
- `ALTOVENA_EMAIL_STAGING_SEND_ENABLED=true`, `ALTOVENA_DELIVERY_PREFLIGHT_ENABLED=true`, `ALTOVENA_LEAD_ALERT_SCAN_ENABLED=true`
- explicit enabled Nexus control `cron:/api/cron/altovena-smtp-staging` (fail closed if absent)
- a configured HTTPS-only `ALTOVENA_OPERATOR_PORTAL_URL` without credentials or query strings
- exact owner + verified staff recipients, with `ALTOVENA_ALERT_RECEIPT_HMAC_KEY` stored as a server-only secret
- active Altovena brand SMTP configuration; the existing `sendBrandEmail` applies CRM suppression and records a generic outbound email.

**There is deliberately NO Vercel Cron schedule for the SMTP staging sender**, and the route cannot send from a production deployment even if the flags are accidentally enabled. This PR changes no Vercel settings, production environment variables or customer data.

## Important limitations

SMTP message ID and provider acceptance are **not delivery receipts**. No webhook, bounce handling, provider idempotency guarantee or positive final-delivery confirmation exists. `OUTCOME_UNKNOWN` and stale `ATTEMPTING` require **manual investigation**; do not automatically retry them. An unexpected database failure after SMTP acceptance may leave `ATTEMPTING`, which is similarly ambiguous. A later, separately approved production dispatch should use a provider capable of end-to-end event correlation, suppressions, handling hard bounces and privacy-safe audit.

The existing generic mail sending function may create a CRM email log. It should only be used after brand mail configuration and compliance review in **isolated staging** with controlled recipients. No real recipient testing has been completed.

## Release blockers

- Test all new RPCs (ACL, idempotency, foreign-brand exclusion, immutable finalization, FK erasure) in local PostgreSQL 17; test real-user privilege checks, bearer/production hard block, revoked identities before and after claim, ambiguous SMTP results in isolated unit tests.
- Bring original #1400 branch current with `main` and rerun combined integration. All stacked PRs remain draft.
- Confirm two real human staging identities, actual non-marketing operator opt-in, SMTP config, safe recipient allowlist, an explicit reviewed Nexus control and change owner approval.
- Rehearse preview with a **fake SMTP server or approved controlled test mailboxes**; never test with real customers. Validate mobile and desktop status messages.
- No production dispatch until a separate release proposal explicitly removes preview-only restrictions, documents provider event verification and is approved.

**Current status: prepared in code only. Not externally verified. Not deployed.**
