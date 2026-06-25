# Lead Intelligence Buyer Profile Revisions

This phase adds a protected buyer-profile revision endpoint for Lead Intelligence.

## Why

A customer may change requirements after a buyer profile has already been approved. For example:

- budget changes from 400,000 EUR to 550,000 EUR
- preferred area changes
- customer becomes more ready to buy
- summary/details need manual correction

The old workflow required creating a new profile manually. This feature creates a safer revision flow.

## Scope

Included:

- Protected admin route for saving a revised buyer profile.
- New `buyer_profiles` row with `version + 1` for the same `brand` and `intake_id`.
- Previous profile is marked `superseded` only after the new profile row and copied criteria are created successfully in the same transaction.
- Existing active criteria are copied to the new profile.
- Old shortlists, presentations and message drafts remain tied to the old profile/version.

Not included:

- No contact creation.
- No contact updates.
- No lead creation.
- No email sending.
- No presentation publishing.
- No property matching job creation.
- No automatic modification of existing shortlists or presentations.

## API

```text
POST /api/lead-intelligence/buyer-profiles/:buyerProfileId/revision
```

The route requires:

- valid RealtyFlow admin session
- `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true`
- `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true`
- server-side Lead Intelligence database runtime access

Example body:

```json
{
  "brand": "zeneco",
  "summary": "Customer wants a modern villa in Finestrat with updated budget.",
  "purchaseReadiness": "hot",
  "budgetAmount": 550000,
  "budgetCurrency": "EUR",
  "budgetIncludesCosts": false,
  "budgetApproximate": true,
  "locationFlexible": false,
  "revisionNote": "Customer called and increased budget from 400000 to 550000."
}
```

Successful response returns the new buyer profile id and version, plus the previous profile id/version.

## Data model

No new tables are added. The feature uses the existing version field on `buyer_profiles`:

- previous profile: `status = superseded`
- new profile: `status = approved`
- same `brand`
- same `intake_id`
- incremented `version`

The migration only adds the RLS/update gate required for the runtime role to mark the previous row as superseded.

## Production activation

1. Merge the PR with no production SQL executed automatically.
2. Apply only:

```text
supabase/migrations/20260625173000_lead_intelligence_buyer_profile_revision.sql
```

3. Verify:

```sql
select has_column_privilege(
  'realtyflow_lead_intelligence_runtime',
  'public.buyer_profiles',
  'status',
  'update'
) as runtime_can_update_status;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'buyer_profiles'
  and policyname = 'buyer_profiles_runtime_supersede';
```

4. Smoke-test with one approved buyer profile:

- save a revision with changed budget
- confirm a new buyer profile version is created
- confirm previous profile is superseded
- confirm old shortlists/presentations are untouched
- run property matching from the new profile manually

## Rollback

Before migration:

- revert this PR.

After migration:

- disable the UI caller / do not call the revision endpoint.
- optionally remove the policy and revoke the extra column update grant after reviewing whether other profile actions still need it:

```sql
drop policy if exists buyer_profiles_runtime_supersede on public.buyer_profiles;
-- Review before revoking because archive/profile actions may also need update(status).
-- revoke update (status) on public.buyer_profiles from realtyflow_lead_intelligence_runtime;
```

Do not drop Lead Intelligence tables as rollback for this feature.
