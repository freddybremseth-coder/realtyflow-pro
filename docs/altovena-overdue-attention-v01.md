# Altovena operator attention — full-backlog 24-hour guard (draft)

**17 October 2026. Stacked on Altovena cross-repository E2E PR #1446. Not deployed to production.**

## Problem closed in this slice

The operator board displays at most 40 newest open Altovena website-lead work items. Previously the 24-hour "not yet started" indicator was calculated from those 40 only, so an older unanswered lead could disappear from the warning simply because new leads arrived.

The read-only `GET /api/workspaces/altovena/lead-tasks` now makes two additional **server-side exact count** queries after rechecking signed session, brand membership and `crm.read`:
- `totalOpen`: every Altovena website-lead work item in `TO_DO`, `REVIEW` or `IN_PROGRESS`.
- `overdueNotStarted`: every Altovena website-lead item still in `TO_DO` or `REVIEW` created at least 24 hours ago.

All queries constrain `brand_id = 'altovena'` and `source_type = 'website_lead'` on the server. Counts contain no customer identifiers or messages. Errors or missing count values respond HTTP 503 and the board displays an error, rather than incorrectly reporting zero overdue items.

The UI continues to display at most eight tasks in its panel out of the 40 latest loaded; it now shows the *full* backlog size and the full unstarted 24-hour count, including older work items excluded from display. It polls once per minute while the tab is active. No customer data is modified by these reads.

## Boundaries and non-claims

- A server-side count is **not an external notification** or independent delivery SLA. If neither owner nor operator opens the app, this update does not notify anyone.
- Starting a task sets `IN_PROGRESS`, which removes it from the "not started" indicator; unresolved in-progress tasks need a separately designed next-action/escalation policy.
- Snapshot counts and task listing are separate reads, so simultaneous human updates may create brief differences between totals and displayed list.
- This is not evidence that Freddy and Andrea have real active Altovena Supabase Auth grants or have completed a two-login staging test.
- No email, SMS, push, webhook or background jobs are enabled here. Public contact form and SQL production migration remain OFF.

## Validation and release gates

The `test:altovena-intake` suite checks that owner and verified member receive the same counts under synthetic grants, counts can exceed the board size, other-brand rows are not exposed, and errors fail closed. CI is also required to run the existing offline browser-handler → RealtyFlow-handler → PostgreSQL test.

Before any release: current-head CI, permissioned real staging session for two operators, revoked-grant regression, browser visibility and count test with >40 synthetic tasks, authorization review, separate delivery mechanism test, privacy/retention signoff, and owner approval.
