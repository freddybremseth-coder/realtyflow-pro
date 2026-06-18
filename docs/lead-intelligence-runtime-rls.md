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
- no unsafe or effective-privilege role memberships
- no ownership of database objects
- schema `USAGE` only
- runtime grants required by PR 3B
- named RLS policies for Lead Intelligence runtime access
- restricted contact lookup view instead of direct `public.contacts` access
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
- `SELECT`, `INSERT` on `public.lead_contact_candidates`
- column-limited `UPDATE` on `public.lead_contact_candidates` only for:
  - `score`
  - `reasons`
  - `status`
- `SELECT` on `public.lead_intelligence_contact_lookup`

The contact lookup view exposes only:

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
- direct `SELECT` on `public.contacts`
- table ownership
- DDL privileges
- function execute privileges
- sequence privileges
- access to `public.leads`, email, OAuth, Storage metadata, or other application tables

The migration does not revoke or modify global `PUBLIC` privileges on the `public` schema. It verifies that the runtime role itself has no `CREATE` privilege.

If the runtime role already exists, security-sensitive role shape is audited before any grants are applied. `NOLOGIN`, `INHERIT`, `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, unsafe role memberships, effective access outside the reviewed runtime surface, schema `CREATE`, sequence access, or owned database objects are stop conditions. A wrong connection limit is the only role attribute the migration attempts to normalize, and only with `ALTER ROLE ... CONNECTION LIMIT 5`. The idempotence check permits only the exact reviewed runtime surface from a previous successful migration run: SELECT/INSERT on the five Lead Intelligence tables and SELECT on the contact lookup view.

## Production Activation Halt

The first controlled production activation stopped correctly during the runtime-RLS phase with:

```text
LEAD_INTELLIGENCE_RUNTIME_ROLE_INCOMPATIBLE: runtime role has memberships
```

At that point:

- PR 3A persistence tables had already been physically applied and verified in production.
- The five Lead Intelligence tables existed and were empty.
- The runtime-RLS migration failed atomically and rolled back.
- The runtime role, contact lookup view, and runtime policies did not exist after rollback.
- No migration history was manipulated.
- No Lead Intelligence data, leads, contacts, emails, or property records were written.

The likely root cause is PostgreSQL 16+ role-membership metadata around role creation. A non-superuser or managed platform role that creates a role can receive an admin-only membership row for that new role. The previous migration treated every `pg_auth_members` row in either direction as dangerous, even when the membership did not allow inheritance, `SET ROLE`, or effective table/function/sequence privileges.

The second controlled production activation stopped correctly with:

```text
permission denied to alter role
```

The failing statement was the broad post-create normalization:

```sql
alter role realtyflow_lead_intelligence_runtime
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  nobypassrls
  connection limit 5;
```

Managed Supabase/Postgres allows the reviewed `CREATE ROLE ... LOGIN NOINHERIT NOBYPASSRLS CONNECTION LIMIT 5` path, but does not allow this SQL context to run `ALTER ROLE` clauses that touch superuser/BYPASSRLS-style attributes. The corrected migration therefore uses audit as the security guarantee: dangerous attributes stop activation; they are not blindly normalized.

## Membership And Effective-Privilege Model

The corrected migration audits risk instead of counting membership rows:

- Incoming membership where another role is a member of `realtyflow_lead_intelligence_runtime` is treated as creator/admin metadata only when it has no `INHERIT` and no `SET` option. The migration does not rely on revoking this metadata, because managed PostgreSQL can keep it as part of role creation. Incoming memberships with `INHERIT` or `SET` remain stop conditions.
- Outgoing membership where the runtime role is a member of another role is allowed only when `ADMIN`, `INHERIT`, and `SET` options are all false, the granted role is not elevated, and negative privilege probes prove the runtime role has no effective application access from that membership.
- The migration still fails closed if membership grants `SUPERUSER`-like escalation, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, DDL, ownership, schema `CREATE`, sequence privileges, direct `contacts` access, sensitive table access, unrelated application-table access, or table privileges outside the reviewed runtime surface.
- `NOINHERIT` remains mandatory, but it is not the only safety boundary. PostgreSQL membership options are checked directly, including `inherit_option`, `set_option`, and `admin_option`.
- Runtime role timeout settings are best-effort role settings. If the SQL context cannot set them, the migration continues after warning; application connections must still set timeouts explicitly. These timeout settings are not the security boundary.

Run the read-only diagnostic query in [Lead Intelligence Runtime Membership Diagnostic](./lead-intelligence-runtime-membership-diagnostic.sql) before retrying production activation. Do not run the runtime migration again if the diagnostic shows effective privileges outside the documented runtime surface.

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
4. Open a database transaction.
5. Set the brand context transaction-locally with a parameterized call:

```sql
select set_config('app.lead_intelligence_brand', $1, true);
```

6. Run the repository queries in the same transaction.
7. Commit or roll back the transaction so the local context is cleared.

Do not trust client-sent database session context. The browser may send a brand in the request, but the server must validate it and set `app.lead_intelligence_brand` itself. The browser must never receive the runtime database URL.

## Contacts

The migration does not grant direct `SELECT` on `public.contacts`.

Instead it creates:

```text
public.lead_intelligence_contact_lookup
```

This view is a narrow server-runtime read surface with only lookup-safe columns. It always filters rows through `app.lead_intelligence_brand`, so cross-brand rows are blocked even if `public.contacts` RLS is disabled. The browser never receives direct database access to this view.

Future CRM hardening should still review and enable explicit `public.contacts` RLS policies, but Lead Intelligence runtime access does not depend on direct contacts-table grants.

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
- runtime role can update only candidate `score`, `reasons`, and `status`
- anon/authenticated/PUBLIC have no Lead Intelligence table access
- global `PUBLIC` `CREATE` on schema `public` is unchanged
- runtime role has no `CREATE` on schema `public`
- brand context blocks cross-brand rows
- contact lookup blocks cross-brand rows with contacts RLS both on and off
- missing brand context is rejected or returns no rows
- transaction-local brand context does not leak between reused connections
- sensitive test tables are inaccessible
- policies are named and scoped to the runtime role
- new role is created with safe attributes and no forbidden post-create role normalization
- existing safe role passes audit
- wrong connection limit is normalized with a narrow `ALTER ROLE ... CONNECTION LIMIT 5`
- existing `NOLOGIN`, `INHERIT`, `SUPERUSER`, `CREATEDB`, `CREATEROLE`, and `BYPASSRLS` roles fail closed
- production-like non-superuser migration runner can apply the migration without `ALTER ROLE ... NOSUPERUSER/NOBYPASSRLS`
- production-like admin-only creator membership is revoked
- harmless noinherit/noset membership passes only when effective privileges remain inside the reviewed runtime surface
- dangerous memberships and inherited sensitive access fail closed
- ownership, schema `CREATE`, direct `contacts` access, sensitive table access, and sequence privileges fail closed
- migration is idempotent
- missing or incompatible PR 3A schema fails closed
