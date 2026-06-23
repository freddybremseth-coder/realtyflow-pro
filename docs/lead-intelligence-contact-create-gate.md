# Lead Intelligence Contact-Create Gate

This phase adds a narrow gate for creating a new CRM contact from an already approved Lead Intelligence buyer profile.

## Scope

Allowed:

- create one same-brand `public.contacts` row from the reviewed contact fields on the saved buyer profile
- link the approved buyer profile to the new contact by setting `buyer_profiles.contact_id`
- keep the operation server-mediated, admin-only, feature-gated, and transactional
- reject creation when a fresh server-side lookup finds an exact same-brand phone or email candidate

Not allowed:

- create leads
- update existing contacts
- delete contacts
- send email
- start property matching
- create shortlists or presentations
- expose full contact data, HMAC hashes, database URLs, or runtime credentials

## Runtime Database Contract

The migration expects these earlier production gates to be active:

- Lead Intelligence persistence foundation
- runtime RLS
- contact-link gate

It fails closed if the runtime role, required tables, contacts RLS, or required columns are missing or incompatible.

The runtime role receives only column-scoped `INSERT` on the specific `public.contacts` columns written by the route:

- `id`
- `name`
- `email`
- `phone`
- `type`
- `pipeline_status`
- `source`
- `brand`
- `brand_id`
- `created_at`
- `updated_at`

It does not receive direct `SELECT`, `UPDATE`, or `DELETE` on `public.contacts`, and it receives no privileges on leads, email, Storage, or property matching tables.

## RLS

`contacts_lead_intelligence_runtime_insert` allows inserts only for the dedicated runtime role when all of these are true:

- transaction-local `app.lead_intelligence_brand` matches `brand`
- `brand_id` is either null-equivalent to the brand or matches the brand
- `type = 'buyer'`
- `pipeline_status = 'NEW'`
- `source = 'lead_intelligence'`

Browser roles remain blocked.

## Server Behavior

The route is:

```text
POST /api/lead-intelligence/buyer-profiles/:buyerProfileId/contact-create
```

It requires:

- valid RealtyFlow admin session
- `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true`
- `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true`
- `REALTYFLOW_LEAD_INTELLIGENCE_CREATE_CONTACT_ENABLED=true`

Before creating a contact, the server reloads the saved buyer profile and runs a fresh contact candidate lookup in the same brand context. If an exact phone or email candidate exists, the route fails with `CONTACT_CANDIDATE_EXISTS` so Freddy can review or link the existing contact instead.

## Activation Gate

Do not run this migration in production until reviewed. After production activation, keep `REALTYFLOW_LEAD_INTELLIGENCE_CREATE_CONTACT_ENABLED` disabled until a controlled smoke test is ready.

The first smoke test should verify:

- a saved approved buyer profile without `contact_id` can create one same-brand contact
- the buyer profile receives that contact ID
- no existing contact row is updated
- no lead is created
- no email is sent
- no property matching job starts
- no shortlist or presentation is created
- the created contact has `source = 'lead_intelligence'`, `type = 'buyer'`, and `pipeline_status = 'NEW'`

## Rollback

Before production execution: revert this PR.

After production execution, disable the feature flag first:

```text
REALTYFLOW_LEAD_INTELLIGENCE_CREATE_CONTACT_ENABLED=false
```

Database rollback for privileges is normally:

```sql
drop policy if exists contacts_lead_intelligence_runtime_insert on public.contacts;
revoke insert (
  id,
  name,
  email,
  phone,
  type,
  pipeline_status,
  source,
  brand,
  brand_id,
  created_at,
  updated_at
) on public.contacts from realtyflow_lead_intelligence_runtime;
```

Do not delete created contacts or clear `buyer_profiles.contact_id` values without explicit approval and a row-level audit.
