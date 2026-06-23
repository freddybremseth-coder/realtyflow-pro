# Lead Intelligence Contact-Link Gate

This PR adds the narrow database and repository foundation for explicitly linking an approved Lead Intelligence buyer profile to an existing CRM contact.

## Scope

Allowed:

- link `public.buyer_profiles.contact_id` to a same-brand contact already visible through `public.lead_intelligence_contact_lookup`
- keep the operation server-mediated and feature-gated
- return idempotent success when the same profile is already linked to the same contact

Not allowed:

- create contacts
- update contacts
- create leads
- send email
- start property matching
- expose full contact data, HMAC hashes, secrets, or direct `public.contacts` access

## Runtime Database Contract

The migration expects the Lead Intelligence persistence foundation and runtime-RLS migration to already be active. It fails closed when either the schema, runtime role, lookup view, or runtime policies are missing or incompatible.

The runtime role receives only:

- `UPDATE(contact_id)` on `public.buyer_profiles`

It does not receive:

- `DELETE` on buyer profiles
- update rights on `summary`, `status`, `brand`, or `intake_id`
- direct `SELECT` on `public.contacts`
- any browser-role access for `anon`, `authenticated`, or `PUBLIC`

The RLS policy requires:

- transaction-local `app.lead_intelligence_brand`
- profile status `approved`
- existing `contact_id is null`
- new contact visible through `public.lead_intelligence_contact_lookup` for the same brand

## Repository Behavior

`linkBuyerProfileContact` uses one statement with a verified-contact CTE and profile update. If the profile is already linked to the same verified contact, it returns `duplicate: true`. If the contact is stale, cross-brand, or the profile is already linked differently, it fails with `REVIEW_CONFLICT`.

## Activation Gate

Do not run this migration in production until reviewed. After production activation, keep `REALTYFLOW_LEAD_INTELLIGENCE_CONNECT_EXISTING_ENABLED` disabled until there is a controlled test contact and a manual smoke test plan.

The first smoke test should verify:

- selected contact is still same-brand and visible through the lookup view
- buyer profile receives `contact_id`
- CRM contact row is unchanged
- no lead is created
- no email is sent
- no property matching job starts

## Rollback

Before production execution: revert this PR.

After production execution, rollback is normally:

```sql
drop policy if exists buyer_profiles_runtime_contact_link on public.buyer_profiles;
revoke update (contact_id) on public.buyer_profiles from realtyflow_lead_intelligence_runtime;
```

Do not clear existing `buyer_profiles.contact_id` values without explicit approval and a row-level audit.
