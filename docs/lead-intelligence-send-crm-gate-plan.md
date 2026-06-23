# Lead Intelligence CRM And Send Gate Plan

Status: planning and implementation contract only. No production SQL was executed while writing this document. No feature flags, Vercel environment variables, runtime credentials, HMAC secrets, contacts, leads, emails, property matching jobs, or production data were changed.

This plan defines the next safe boundary after the current Lead Intelligence flow:

1. analyze a customer message
2. approve buyer profile criteria
3. find existing properties
4. save a shortlist draft
5. create an internal presentation and email draft
6. return to the latest draft

The next phase may connect that draft to CRM and eventually send an email, but only through explicit gates. The governing rule remains:

```text
AI suggests. Freddy reviews. Freddy approves. The system sends only after explicit send approval.
```

## Current Safe State

The current production workflow can create:

- `lead_intake_messages`
- `lead_analysis_runs`
- `buyer_profiles`
- `buyer_profile_criteria`
- `lead_contact_candidates`
- `lead_property_shortlists`
- `lead_property_shortlist_items`
- `lead_customer_presentations`
- `lead_customer_message_drafts`

The current workflow must not:

- send email, WhatsApp, SMS, or any customer communication
- create or update `public.contacts`
- create or update `public.leads`
- create follow-up tasks automatically
- publish a customer presentation URL
- start an asynchronous property matching job
- expose runtime database credentials or provider secrets to the browser

## Required Feature Gates

All gates are server-side only. The browser can request an action, but it cannot enable a gate.

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true
REALTYFLOW_PROPERTY_MATCHING_ENABLED=true
REALTYFLOW_LEAD_INTELLIGENCE_CONNECT_EXISTING_ENABLED=false
REALTYFLOW_LEAD_INTELLIGENCE_CREATE_CONTACT_ENABLED=false
REALTYFLOW_LEAD_INTELLIGENCE_CREATE_LEAD_ENABLED=false
REALTYFLOW_LEAD_INTELLIGENCE_SEND_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

`REALTYFLOW_AUTO_SEND_ENABLED` must stay `false`. It is a hard global safety boundary, not a convenience flag.

## Allowed Next PR Sequence

### PR A: Contact Link Gate

Purpose: allow Freddy to link a saved buyer profile to an existing contact only after a fresh server-side candidate verification.

Allowed:

- add a protected endpoint for explicit contact linking
- verify selected contact with server-side candidate lookup inside one transaction
- require same brand
- require the contact still exists
- require the match is still valid
- write only `buyer_profiles.contact_id`
- append an audit event or structured note if an existing safe table exists

Not allowed:

- create contacts
- update existing contact fields
- create leads
- send email
- infer consent
- trust client-sent candidate hashes, scores, or reasons

Stop if:

- contact belongs to a different brand
- candidate lookup is stale
- contact no longer exists
- selected contact was not returned by fresh server-side verification
- runtime role would need broad `contacts` access

### PR B: Contact Creation Draft Gate

Purpose: prepare explicit contact creation without automatically creating a real contact.

Allowed:

- show a reviewed contact creation preview
- validate required fields
- show duplicates before creation
- require Freddy confirmation
- document exactly which existing CRM API or table would be used

Not allowed:

- create a contact yet
- merge contacts
- overwrite an existing contact
- write unverified phone or email as verified
- send a message

This PR should remain preview-only unless a separate activation plan approves actual contact creation.

### PR C: Lead Creation Draft Gate

Purpose: prepare a controlled lead creation action after a buyer profile has a contact decision.

Allowed:

- create a lead creation preview
- map buyer profile fields to the existing lead model
- require one of:
  - linked existing contact
  - explicitly approved new contact flow
  - approved `continue_without_contact` lead policy
- validate brand, source, readiness, budget, and advisor fields

Not allowed:

- write to `public.leads` until the reviewed route and activation plan are approved
- create work items automatically
- send email
- start follow-up automation

### PR D: Message Approval State

Purpose: turn the internal email draft into an explicitly approved draft without sending.

Allowed:

- add approval status transitions for message drafts
- require Freddy/admin approval before send eligibility
- record `approved_by`, `approved_at`, and approval correlation ID
- block approval if the draft has missing customer links or unresolved blocking verification items
- keep the editable local preview separate from the stored approved body

Not allowed:

- send email
- mutate recipient contact data
- publish presentation URL

### PR E: Send Preflight

Purpose: validate that a draft is technically sendable before any provider call exists.

Allowed:

- read approved message draft
- show recipient, subject, plaintext body, HTML body, property links, and missing verification warnings
- validate the chosen sender identity and brand footer
- require an explicit "ready to send" confirmation state
- return safe diagnostics

Not allowed:

- call Gmail, Resend, Postmark, SMTP, WhatsApp, SMS, or any external communication provider
- enqueue a send job
- create customer-visible links

### PR F: Provider Send Adapter, Disabled

Purpose: integrate the selected email provider behind a hard-disabled send gate.

Allowed:

- add provider adapter behind `REALTYFLOW_LEAD_INTELLIGENCE_SEND_ENABLED`
- add mock/test provider
- add idempotency key and provider message ID handling
- add safe envelope errors
- add audit logging for attempted sends

Not allowed:

- enable the flag in production
- send a real customer email from automated tests
- send if `REALTYFLOW_AUTO_SEND_ENABLED=false` is not explicitly checked

### PR G: First Controlled Send Activation

Purpose: one manual production send test with Freddy approval.

This requires a separate production activation plan and explicit approval before any real email is sent.

## Send Preconditions

A real send route must fail closed unless all conditions are true:

- authenticated RealtyFlow admin session
- authorized admin user
- approved real-estate brand
- `REALTYFLOW_LEAD_INTELLIGENCE_SEND_ENABLED=true`
- `REALTYFLOW_AUTO_SEND_ENABLED=false`
- message draft status is `approved`
- message draft is not already sent, cancelled, or superseded
- recipient is explicitly selected and verified for this send
- sender identity belongs to the same brand
- presentation links are either verified or explicitly excluded
- required property links are present
- blocking verification items are resolved or manually waived
- idempotency key has not been used for a different payload
- no provider credentials are exposed to the browser

## Suggested Status Model

For `lead_customer_message_drafts` or a future side-effect table:

```text
draft
reviewed
approved
send_ready
sending
sent
failed
cancelled
superseded
```

Recommended transition rules:

- `draft -> reviewed` after Freddy finishes editing.
- `reviewed -> approved` only after explicit approval.
- `approved -> send_ready` only after recipient and preflight checks pass.
- `send_ready -> sending` only inside the send transaction/job.
- `sending -> sent` only after provider returns a message ID.
- `sending -> failed` if provider fails safely before confirmed send.
- `sending` with ambiguous provider result requires manual review before retry.
- terminal states cannot return to `draft`; create a new draft version instead.

## Side-Effect Receipt Model

Before the first real send, add a durable side-effect receipt. It should record:

- draft ID
- buyer profile ID
- optional contact ID
- optional lead ID
- brand
- channel
- recipient hash or masked recipient reference
- provider
- provider message ID, when available
- idempotency key
- payload hash
- status
- error code
- correlation ID
- initiated by
- approved by
- sent at

Retry must never send again when a provider message ID already exists.

If a provider call started but no provider message ID was recorded, retry must require manual review. This mirrors the Re-Master YouTube checkpoint model.

## Contact And Lead Rules

Contact linking:

- requires `REALTYFLOW_LEAD_INTELLIGENCE_CONNECT_EXISTING_ENABLED=true`
- must fresh-verify the selected contact server-side
- must not trust browser-sent candidate metadata
- must not overwrite existing contact fields
- must not cross brand boundaries

Contact creation:

- requires `REALTYFLOW_LEAD_INTELLIGENCE_CREATE_CONTACT_ENABLED=true`
- must show duplicates immediately before write
- must require explicit Freddy confirmation
- must not mark phone or email verified unless the source supports that
- must write only approved fields

Lead creation:

- requires `REALTYFLOW_LEAD_INTELLIGENCE_CREATE_LEAD_ENABLED=true`
- must be idempotent
- must not create duplicate leads for the same approved buyer profile without explicit force-new semantics
- must preserve the buyer profile version that generated it

## Email Content Rules

Email drafts may be edited by Freddy. The generated content should:

- use human Norwegian or the customer language selected by Freddy
- avoid repeating the same "bedrooms/bathrooms match" sentence for every property
- group common match reasons once when several properties share the same reason
- include property links only when verified
- clearly mark facts that must be confirmed
- avoid saying price, availability, view, legal status, neighbor plot risk, or total cost is verified unless the source proves it or Freddy approves it
- avoid legal, financial, tax, or availability guarantees

## Security And Privacy

Do not log:

- full customer message
- full phone
- full email
- provider raw response
- OAuth tokens
- database URLs
- service-role keys
- cookies
- generated email body when it contains customer PII

Safe logs may contain:

- correlation ID
- stable error code
- route
- duration
- feature gate state as booleans
- draft ID
- buyer profile ID
- masked recipient reference
- provider name
- provider message ID after successful send

## Tests Required Before Any Send

Minimum route and service tests:

1. unauthenticated requests are rejected
2. non-admin requests are rejected
3. unknown brand is rejected before side effects
4. send flag off rejects before provider call
5. `REALTYFLOW_AUTO_SEND_ENABLED=false` is enforced
6. draft must be approved before send preflight
7. draft with missing recipient is rejected
8. draft with missing required property links is blocked unless manually waived
9. stale contact selection is rejected
10. cross-brand contact is rejected
11. duplicate send request with same payload is idempotent
12. duplicate send request with changed payload returns conflict
13. provider timeout returns safe error
14. provider confirmed ID prevents duplicate retry
15. ambiguous provider result requires manual review
16. raw provider error is not returned to browser
17. PII and secrets are not logged
18. no contact or lead is created unless its own gate is enabled
19. no property matching job is started by send
20. no email is sent from CI tests

## Production Activation Gate

Before enabling any real send feature:

1. Create a production activation plan for the exact reviewed PR and source commit.
2. Recompute checksums for any migration files from that commit.
3. Verify existing schema, grants, RLS, and runtime role privileges.
4. Configure provider credentials only in the intended Vercel environment.
5. Run with a test recipient controlled by Freddy.
6. Confirm send result in both provider dashboard and database receipt.
7. Confirm no unintended leads, contacts, or tasks were created.
8. Keep `REALTYFLOW_AUTO_SEND_ENABLED=false`.

## Rollback

Operational rollback:

- set `REALTYFLOW_LEAD_INTELLIGENCE_SEND_ENABLED=false`
- set `REALTYFLOW_LEAD_INTELLIGENCE_CREATE_CONTACT_ENABLED=false`
- set `REALTYFLOW_LEAD_INTELLIGENCE_CREATE_LEAD_ENABLED=false`
- keep existing drafts and audit records for traceability

Data rollback is not the default. Do not delete sent-message receipts, leads, contacts, or customer messages without a separate reviewed rollback plan.

## Recommended Next Implementation

The safest next code PR is:

```text
Contact Link Gate, no contact creation and no email sending
```

It should only allow an already saved buyer profile to be linked to an existing, same-brand contact after fresh server-side candidate verification. It should not change any contact fields and should not create a lead.
