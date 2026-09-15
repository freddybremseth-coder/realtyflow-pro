# Nexus AI — Internal Actions v4

Status: locked implementation boundary for safe internal actions and fast CRM contact maintenance.

## Product rule

Nexus AI remains the **single conversational assistant** in RealtyFlow Pro / Nexus OS.

The normal advice request is read-only. It may analyze, prioritize, explain, navigate and expose governed action cards. No write happens until an authenticated user explicitly clicks a governed action card.

V4 does not add a second assistant, hidden autonomous sender, pipeline mutation path or arbitrary database tool.

## Allowlisted actions

V4 has six explicit governed action types:

1. `prepare_customer_email`
   - Creates a persisted email draft.
   - Creates a pending Approval Center item.
   - Requires human approval before the existing executor can send anything.
   - Never sends directly.

2. `schedule_customer_followup`
   - Stores a deterministic CRM follow-up date.
   - Adds an internal CRM timeline interaction.
   - Sends no customer communication.

3. `add_customer_note`
   - Stores the user's explicit instruction as an internal CRM note.
   - May document a suppressed / do-not-contact contact because it is documentation only.
   - Sends no customer communication.

4. `create_customer_task`
   - Creates an internal `work_items` task linked to the CRM contact.
   - Uses a deterministic Nexus action source ID.
   - May carry a deterministic due date.
   - Is blocked for suppressed / do-not-contact and terminal WON/LOST contacts.

5. `update_customer_email`
   - Updates only the CRM contact's `email` field.
   - Requires an explicit change verb, the email field and exactly one valid new email value.
   - Fails closed when that email already belongs to another CRM contact.
   - Sends no message and changes no contactability/pipeline state.

6. `update_customer_phone`
   - Updates only the CRM contact's `phone` field.
   - Requires an explicit change verb, the phone field and exactly one valid new phone value.
   - Normalizes the phone before comparison/write.
   - Fails closed when that phone already belongs to another CRM contact.
   - Sends no message and changes no contactability/pipeline state.

## Intent and explicit-click boundary

Advice questions remain read-only. Examples such as `Hvordan endrer jeg e-post?` do not become write proposals.

A contact-field action requires all of:

- an explicit change verb such as `endre`, `oppdater`, `bytt`, `legg til`, `registrer` or `korriger`,
- an explicit field name (`e-post`/`email` or `telefon`/`mobil`),
- exactly one valid new value,
- an unambiguous CRM customer.

Unknown explicitly named customers, multiple possible email values, invalid phone numbers or identity conflicts fail closed.

## Server-side revalidation

`/api/nexus/actions` owns email drafts, follow-up, internal notes and internal tasks.

`/api/nexus/contact-field-action` owns only email/phone CRM maintenance. This separation is deliberate: the contact-field endpoint cannot accept a broad contact PATCH object.

Both action surfaces re-read CRM state and recompute the deterministic proposal from the original user instruction before writing.

The contact-field endpoint additionally verifies:

- action type is exactly `update_customer_email` or `update_customer_phone`,
- field matches the action type,
- normalized value still matches the recomputed proposal,
- the value is not already used by a different CRM contact,
- the update statement writes only `[field]`, internal interaction/audit state and `updated_at`.

## Contact-policy differences

`prepare_customer_email`, `schedule_customer_followup` and `create_customer_task` require an active contactable customer.

`add_customer_note` is documentation only and may therefore be used for DNC/suppressed contacts.

Email/phone corrections are also data maintenance, not outreach. They may therefore be performed for DNC/suppressed or WON/LOST contacts, but they never:

- clear `do_not_contact`,
- clear `email_suppressed`,
- send a customer message,
- schedule active outreach,
- move pipeline state.

## No commercial or Buyer Profile mutation

V4 never changes:

- `pipeline_status`,
- Buyer Profile criteria or approval state,
- shortlist/customer presentation approval,
- commission fields,
- transaction/pipeline value,
- revenue truth,
- autonomy policy.

Property matching remains owned by the existing Buyer Profile + matching preparation chain.

## Audit and execution receipts

Every executed internal write keeps stable execution identity:

- `contact_id`,
- deterministic proposal ID,
- Nexus run ID,
- correlation ID,
- `source_system = nexus_ai_chat`,
- `source_type = governed_action`,
- stable source ID and dedupe key.

Operational CRM events never manufacture `revenue_impact_eur` merely because an action executed.

For note/follow-up/task actions, a partial failure after the CRM artifact has been written is recoverable: the retry verifies the existing artifact, repairs the receipt/run and does not repeat the CRM write.

## Email boundary

Email remains:

`explicit request → action card → server revalidation → draft → Approval Center → human approval → existing executor`

No v4 route calls the customer email sender or approval executor directly.

## CRM UX simplification

The customer card now exposes **Rediger kontaktinfo** directly in the header.

When contact data is missing, the header exposes:

- **Legg til e-post**
- **Legg til telefon**

These shortcuts open the existing `CustomerUpdatePanel` directly on `Kundedetaljer`, so manual CRM editing and Nexus AI still write to the same customer data model. The ordinary `Detaljer & oppdatering` path continues to open the activity/update workflow.

## UI semantics

The single Nexus AI chat distinguishes:

- email draft action: **Krever godkjenning før sending**,
- internal CRM actions and data maintenance: **Intern CRM-handling · sender ingenting**.

The UI must never describe a proposed/draft/pending action as sent customer communication.

## Revenue truth

Raw property or pipeline value is context only. Documented commission remains the canonical commercial revenue truth when it exists.

## Acceptance criteria

V4 is ready only when:

1. all six action types are explicitly allowlisted,
2. advice questions remain read-only,
3. explicit user click is required before every write,
4. unresolved/ambiguous named customers fail closed,
5. DNC/suppressed contacts cannot receive active follow-up/task/email actions,
6. internal documentation and pure contact-data correction remain possible without clearing suppression,
7. WON/LOST contacts cannot receive new active follow-up/task actions,
8. email remains draft + human approval only,
9. email/phone actions can update only their explicit field,
10. duplicate email/phone conflicts fail closed,
11. no governed action mutates pipeline, Buyer Profile criteria, commission or revenue truth,
12. stable contact/source/run identities are written to the audit trail,
13. partial-write retries repair receipts without duplicating CRM artifacts,
14. CRM contact info is directly editable from the customer-card header,
15. dedicated Nexus AI v4 CI, Build Check and full Build Validation are green,
16. production deployment is verified after merge.
