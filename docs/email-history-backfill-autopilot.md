# Email history backfill autopilot

Historical Inbox/Sent import is executed by `/api/cron/email-history-backfill` only for rows explicitly enabled in `email_history_backfill_jobs`.

Safety invariants:

- scheduler authentication and cron safe-mode are required
- the worker never sends email
- history is stored read + archived
- RFC Message-ID plus provider source aliases preserve idempotency
- CRM history links are created only for one exact contact candidate
- live inbound CRM mutation is gated by the safe identity resolver; duplicate or cross-brand email identities remain unlinked for review
- a job disables itself only when every selected mailbox reports that the configured history window is exhausted
