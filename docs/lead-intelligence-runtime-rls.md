# Lead Intelligence Runtime RLS

Status: PR documentation only. No production SQL was executed while writing this document. No secrets or feature flags are changed by this PR.

## Purpose

This PR removes the need for a temporary `BYPASSRLS` Lead Intelligence runtime database user by introducing a normal dedicated runtime role with explicit role-specific RLS policies.

Migration:

```text
supabase/migrations/20260617130114_lead_intelligence_runtime_rls.sql
```

## Scope

Included:

- normal runtime role `realtyflow_lead_intelligence_runtime`
- no `BYPASSRLS`
- no `SUPERUSER`, `CREATEDB`, or `CREATEROLE`
- low connection limit
- no role memberships
- schema `USAGE` only
- runtime grants required by PR 3B
- named RLS policies for Lead Intelligence runtime access
- optional `contacts` policy when `public.contacts` already has RLS enabled
- isolated PostgreSQL migration tests

Not included:

- production SQL execution
- password or database URL creation
- feature flag activation
- property matching
- email sending
- contact creation
- `public.leads` writes
- changes to existing Lead Intelligence data

## Runtime Grants

The runtime role gets only:

- `SELECT`, `INSERT` on `public.lead_intake_messages`
- `SELECT`, `INSERT` on `public.lead_analysis_runs`
- `SELECT`, `INSERT` on `public.buyer_profiles`
- `SELECT`, `INSERT` on `public.buyer_profile_criteria`
- `SELECT`, `INSERT`, `UPDATE` on `public.lead_contact_candidates`
- column-limited `SELECT` on `public.contacts`:
  - `id`
  - `brand`
  - `name`
  - `phone`
  - `email`
  - `created_at`
  - `updated_at`

It does not get:

- `DELETE`
- general `UPDATE` on intakes, analyses, profiles, or criteria
- table ownership
- DDL privileges
- function execute privileges
- sequence privileges
- access to `public.leads`, email, OAuth, Storage metadata, or other application tables

## Brand Context

The RLS policies use:

```sql
current_setting('app.lead_intelligence_brand', true)
```

The application must set this only on the server side, after validating the requested brand against the existing Lead Intelligence real-estate brand allowlist.

Safe server sequence:

1. Authenticate the RealtyFlow admin session.
2. Validate the admin is allowed to use Lead Intelligence.
3. Validate the brand through the server-side allowlist.
4. Open a database transaction or short-lived connection.
5. Set the brand context with a parameterized call:

```sql
select set_config('app.lead_intelligence_brand', $1, true);
```

6. Run the repository queries.
7. End the transaction/connection.

Do not trust client-sent database session context. The browser may send a brand in the request, but the server must validate it and set `app.lead_intelligence_brand` itself. The browser must never receive the runtime database URL.

## Contacts

The migration grants only column-limited `SELECT` on `public.contacts`.

If `public.contacts` already has RLS enabled, the migration creates a role-specific policy:

```text
contacts_lead_intelligence_runtime_select
```

If `public.contacts` does not have RLS enabled, the migration does not enable it in this PR because that would be a broader CRM hardening change. In that case, the app route must keep its existing server-validated `where brand = $1` predicate, and a later dedicated contacts-RLS PR should harden the table.

## Rollback

Before production execution:

- git revert this PR

After production execution:

- disable `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED`
- remove `REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL` from the affected environment
- revoke login or rotate the runtime role password
- do not drop Lead Intelligence tables
- only remove runtime policies/grants after confirming no smoke-test or audit process is using them

## Tests

Run:

```bash
npm run test:migrations -- lead-intelligence-runtime-rls
```

The migration test uses `MIGRATION_TEST_DATABASE_URL` and refuses production-style database URL variables. It verifies:

- runtime role is not privileged and has no `BYPASSRLS`
- runtime role can perform required inserts/selects
- candidate upsert works
- runtime role cannot delete
- runtime role cannot update profiles or intakes
- anon/authenticated/PUBLIC have no Lead Intelligence table access
- brand context blocks cross-brand rows
- sensitive test tables are inaccessible
- policies are named and scoped to the runtime role
- migration is idempotent
- missing or incompatible PR 3A schema fails closed

