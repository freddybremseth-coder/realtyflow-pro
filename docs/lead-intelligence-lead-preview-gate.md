# Lead Intelligence Lead Preview Gate

This PR adds the PR C foundation from the Lead Intelligence CRM/send gate plan: a preview-only lead creation gate.

## Scope

Allowed:

- read an approved buyer profile
- read the linked same-brand contact preview through the existing contact lookup view
- build a proposed lead payload for Freddy to review
- return blockers and warnings before any future write route exists

Not allowed:

- create rows in `public.leads`
- update contacts
- create contacts
- send email, WhatsApp, SMS, or any customer communication
- create tasks or follow-up automations
- start property matching
- publish customer presentations

## Endpoint

```text
GET /api/lead-intelligence/buyer-profiles/:buyerProfileId/lead-preview?brand=<brand>
```

The response is preview-only and includes explicit side-effect flags:

```json
{
  "leadsCreated": false,
  "contactsCreated": false,
  "contactsUpdated": false,
  "emailSent": false,
  "propertyMatchingStarted": false,
  "presentationCreated": false,
  "tasksCreated": false
}
```

## Blockers

The preview returns `canCreateLeadLater: false` until these are true:

- buyer profile status is `approved`
- buyer profile has a linked CRM contact
- linked contact is still visible through the same-brand lookup view

## Future activation

A later PR may add a real create-lead route only after separate approval. That route must be feature-gated, idempotent, audited, and must not send communication or create follow-up tasks automatically.
