# Nexus AI — Follow-up Actions v3

## Locked product boundary

Nexus AI remains the single conversational assistant in RealtyFlow. V3 does not introduce a new agent, launcher, page or execution surface.

V3 adds one governed internal CRM action:

- `schedule_customer_followup`

The existing V2 action remains unchanged:

- `prepare_customer_email` → draft → Approval Center → existing executor.

## Follow-up flow

1. The user explicitly asks Nexus AI to plan/schedule a customer follow-up and includes a date that can be interpreted deterministically.
2. The normal Nexus advice request remains read-only and returns a governed action card.
3. Nothing is written until the authenticated user explicitly clicks the card.
4. `/api/nexus/actions` reads the customer again and recomputes the proposal server-side.
5. The action is rejected if customer/action/date no longer match.
6. RealtyFlow validates the timeline update through the existing customer-update schema.
7. `next_followup` and one internal timeline interaction are persisted.
8. A `followup_scheduled` revenue event and a durable Nexus run outcome are recorded.
9. No email, WhatsApp, SMS or other customer communication is sent.

## Date boundary

Date parsing is intentionally narrow and deterministic. Supported forms include:

- `i morgen`
- `om N dager`
- `om N uker`
- `neste uke`
- `neste mandag/tirsdag/...`
- `YYYY-MM-DD`
- `DD.MM.YYYY` / `DD/MM/YYYY`
- Norwegian day + month name, with optional year

Ambiguous date wording produces no write action. Nexus may answer normally, but it must not guess a CRM due date.

The stored time is normalized to 09:00 UTC as a CRM due-time. It is not represented as a customer appointment time.

## Safety rules

- Explicit click is required before the CRM write.
- The client cannot supply arbitrary action types.
- Proposal ID, customer, action type and scheduled date are recomputed and reverified server-side.
- `do_not_contact` and suppressed contacts are blocked.
- `WON` and `LOST` contacts do not get new automatic follow-up dates.
- A follow-up can be scheduled even when the customer has no email address because no communication is sent.
- The action never changes pipeline status.
- The action never creates a send approval because it has no external side effect.
- Timeline metadata carries `nexus_action_id`, `nexus_run_id` and `no_customer_contact: true`.
- Retries are idempotent: the same action ID cannot append the same timeline event twice.
- Legacy follow-up column names are handled through the existing schema-fallback pattern.

## UI

The same Nexus AI chat renders both action classes:

- Email draft: **Krever godkjenning før sending**
- CRM follow-up: **Intern CRM-handling · sender ingenting**

After execution, the chat links back to the customer card.

## Acceptance criteria

V3 is ready when:

- the deterministic date tests pass, including month rollover,
- unresolved or ambiguous customer targets fail closed,
- the V2 email action still requires Approval Center,
- the V3 schedule action writes only CRM follow-up/timeline state,
- single-assistant and Cmd-K navigation contracts remain green,
- full Next.js build and repository validation are green.
