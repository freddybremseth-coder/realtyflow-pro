# Nexus AI — Governed Actions v2

Status: locked implementation boundary for the first action-capable Nexus AI release.

## Product rule

Nexus AI remains the **single conversational assistant** in RealtyFlow. Governed actions extend the existing Nexus AI conversation; they do not create a second assistant, new persona, or parallel agent UI.

Normal chat remains read-only. A user message may cause Nexus AI to expose a deterministic action card, but no write happens until the authenticated user explicitly clicks that card.

## First v2 action

The only allowlisted action in this release is:

`prepare_customer_email`

Typical requests:

- "Lag en oppfølging til denne kunden"
- "Skriv mail til Harald"
- "Følg opp Harald med en e-post"

The result of the action is **not a sent email**. It is:

1. a persisted `agentic_drafts` email draft,
2. a durable `nexus-ai` agent run and safe action trace,
3. a pending `message_draft` item in the existing Approval Gateway,
4. a shortcut to Approval Center for human review.

Only the existing approval/executor layer may later execute `send_personal`. The governed action endpoint never calls the email sender or the approval executor directly.

## Flow

`user intent → read-only Nexus AI response → deterministic action proposal → explicit click → server revalidation → draft → pending approval → human review → existing executor`

The chat model does not receive arbitrary database mutation authority.

## Server-side verification

The action endpoint must re-check all material state even though the proposal came from the trusted chat route:

- authenticated RealtyFlow access context,
- action type is in the explicit allowlist,
- proposal ID matches the deterministic proposal recomputed on the server,
- contact ID resolves to a real CRM contact,
- the contact has an email address,
- `email_suppressed` is false,
- `do_not_contact` is false,
- an explicit named customer is resolved unambiguously.

If the message names a customer that cannot be resolved, Nexus AI fails closed instead of silently using the customer page that happens to be open.

## Idempotency

Every proposal has a stable SHA-256-derived proposal ID. The durable run uses that proposal ID as its idempotency identity. Re-clicks or retries must resolve to the existing draft/approval flow rather than create duplicate customer communication.

## Brand integrity

Customer drafts persist `brand_id`. The existing `send_personal` executor reads that brand from the draft and passes it to the brand email sender. This prevents a cross-brand Nexus AI request from silently falling back to the default sender identity.

## AI drafting boundary

The OpenAI-primary Nexus AI model may draft the email body from the user's instruction plus known CRM context. The drafting prompt must not invent:

- prices,
- current property availability,
- appointments or viewing confirmations,
- contractual commitments,
- reservations,
- legal or financial promises.

Missing facts should become natural questions in the draft, not model guesses.

## State semantics

The UI and audit trail must distinguish:

- `proposed` — chat exposed an action card; nothing written yet,
- `draft` — internal message draft exists,
- `waiting_approval` — Approval Center review is required,
- `approved` — human approval recorded,
- `executed` — existing executor actually ran,
- `published/measured` — downstream states where applicable.

Nexus AI must never describe `proposed`, `draft`, or `waiting_approval` as "sent".

## Acceptance criteria

1. Nexus AI is still the only global conversational assistant.
2. Advice questions never silently become write actions.
3. Creating a draft requires an explicit user click.
4. Only `prepare_customer_email` is allowlisted in the first v2 release.
5. Customer resolution is deterministic and ambiguous/unresolved explicit names fail closed.
6. Suppressed / do-not-contact / missing-email contacts cannot receive an action proposal or draft.
7. The action endpoint revalidates the proposal server-side.
8. The endpoint creates a draft plus pending approval and never calls the email executor directly.
9. Duplicate clicks are idempotent.
10. Brand identity survives from CRM → draft → existing executor.
11. CI covers governed-action rules and the existing single-assistant contract.
12. The previous Delfin Natura lead-intake regression suite remains in CI.

## Next expansions

Future action types may use the same pattern for CRM notes, follow-up scheduling, shortlist preparation, or other low-risk workflows. Each new action requires its own allowlist entry, deterministic input boundary, server-side revalidation, permissions, idempotency, audit trail, and approval policy where relevant.
