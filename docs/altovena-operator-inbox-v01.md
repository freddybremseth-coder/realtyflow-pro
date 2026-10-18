# Altovena operator inbox and individual read receipts — development

**18 October 2026 · stacked on RealtyFlow #1456 → #1454 → #1446 → #1400. Draft only.**

## Delivered in this change

1. A single **in-app notification center** below the existing Altovena lead board. It shows the **same active internal alerts** to owner and staff who independently pass `crm.read` for the Altovena brand.
2. Personal **read receipts** via `altovena_alert_reads`: one `(alert_id,operator_key)` row at first explicit “Marker som lest” click. The operator key is an HMAC-SHA256 of the signed-in verified owner email or the staff member's independently verified Supabase Auth user ID, under `ALTOVENA_ALERT_RECEIPT_HMAC_KEY`. The key is never sent to the browser, never derived from a user-supplied ID, and the table stores neither raw email nor customer message.
3. `altovena_operator_alert_inbox` and `altovena_ack_operator_alert` are **service-role-only** Postgres RPCs; the public API rechecks a valid real human session, current brand grant and Supabase Auth identity on every request, rejects owner preview/remaster proxy, and enforces same-origin, one-UUID-only POST.
4. Read receipts are **not shared task completion**. Freddy reading an alert does not mark Andrea’s alert as read and does not close or modify the customer task. The SQL deliberately joins only Altovena website lead tasks; erasure cascades through the alert FK into receipts.
5. In-app inbox is **disabled by default** under `ALTOVENA_ALERT_INBOX_ENABLED=true`; it requires a separate server-only HMAC key (at least 32 characters). The background scan is independently gated by `ALTOVENA_LEAD_ALERT_SCAN_ENABLED=true`, so enabling the inbox cannot start the scheduler or public intake. No email/push/WhatsApp is sent.

## Privacy, security and delivery boundaries

- A read receipt proves a **human clicked** an internal button, **not** that an email was dispatched, delivered or read. `externalDelivery:false` is explicit in every successful API payload.
- The endpoint reveals only alert UUID, kind, creation time, optional contact UUID and the current operator’s read time. Full customer data is guarded by the existing exact brand-scoped lead-contact API.
- Read receipts are active-alert UI metadata; they are removed automatically when the corresponding alert/task/contact is deleted.
- HMAC secret rotation intentionally changes pseudonymous operator keys and thus resets the user’s personal read history unless a controlled migration is performed. The secret must never use a `NEXT_PUBLIC_` variable or be committed.
- A malicious guess of an alert UUID must never permit cross-brand status changes or acknowledgements; both DB read and ack enforce Altovena task ownership. The API must never accept operator keys, recipient email, brand ID or task owner from the browser.
- Do not call this a *delivery-verified notification system*. True outbound operator notifications still need a separate reviewed provider sender, hard recipient allowlist backed by active grants, double-send prevention with receipts, rate controls, retries, dead-letter queue, opt-out/escalation policy, and audit.

## Test and release requirements

- `npm run test:altovena-intake` includes synthetic signed owner/member, revoked and unverified member, owner-preview, disabled mode, HMAC isolation, wrong origin, unknown body and cross-brand RPC response tests.
- The isolated PostgreSQL suite applies the real unmerged queue migration twice, checks RLS/ACL, independent read/unread state, idempotent repeated read acknowledgement, unchanged task status and per-contact erasure cascade.
- Release remains blocked on live, independently verified Freddy and Andrea sessions, brand workspace provisioning in **isolated staging**, current-head GitHub CI, preview/mobile UX validation, personvern/gdpr review, and explicit owner production approval.
- All migrations and scheduled tasks remain uninstalled/deactivated in production.

## Verified repository and deployment boundary (18 October)

- Current test-covered PR stack still sits on a base branch **five commits behind `main`**. Reconcile and rerun full combined CI before any merge.
- A read-only check of the production RealtyflowPRO Supabase database still found **zero Altovena brand rows** and **no alert/read-receipt tables or inbox RPC**.
- No Vercel preview deployment was found for this PR branch or head commit at the time of inspection. A green GitHub build is not a live desktop/mobile session test.
- Human acceptance test after a separate staging deployment: verify both owner and actual Andrea login independently see the same alert; mark read for one only; revoke Andrea brand grant and confirm immediate 403; confirm another brand cannot query the alerts; confirm safe disabled behavior and no network e-mail/push.
