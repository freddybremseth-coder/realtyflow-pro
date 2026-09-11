# Nexus Send Preflight v1

## Purpose

Nexus Send Preflight is the final automated validation stage after a human has approved the Buyer Profile, shortlist, customer presentation and message draft. It does not send anything.

Pipeline:

`customer reply -> CRM -> Buyer Profile -> property matching -> shortlist -> human shortlist review -> presentation draft -> human final review -> send preflight -> explicit send approval -> provider send`

## READY requirements

Preflight fails closed unless all of the following are true:

- Buyer Profile is approved.
- Shortlist is approved.
- Presentation is approved.
- Message draft is approved and has not been sent or cancelled.
- The Buyer Profile has a linked CRM contact.
- Contact and draft belong to the same brand.
- Recipient email is valid.
- CRM suppression / do-not-contact check is clear.
- The brand has an active sender account.
- Approved subject and body text are present.
- At least one shortlist property remains `client_ready`.
- Presentation contains at least one property.
- Every presented property has a verified public URL.

## Safety boundary

A READY result is not send permission.

- `presentation_customer_send_allowed` stays `false`.
- No SMTP/provider function is called.
- No presentation is published.
- No recipient data is changed.
- The same preflight checks must be executed again immediately before any future provider send.
- A BLOCKED item remains eligible for automatic recheck so that a corrected sender configuration, CRM suppression state or other repaired dependency can recover without rebuilding the sales flow.

## Scheduling

The cron runs every five minutes, offset after the existing Nexus sales pipeline stages. It only scans open CRM work items explicitly marked `presentation_send_preflight_required=true`.

## Next phase

The next phase is an explicit Action Policy Registry. It must define which Nexus actions are `AUTO_SAFE`, `DRAFT_ONLY`, `HUMAN_REQUIRED` or `FORBIDDEN`. Provider send remains outside AUTO_SAFE until a separate send policy and durable idempotent send receipt are implemented and reviewed.
