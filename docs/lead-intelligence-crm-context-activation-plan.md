# Lead Intelligence CRM Context Activation Plan

Status: operational plan only. No production SQL was executed while writing this document. No secrets, Vercel environment variables, feature flags, contacts, leads, emails, property matching jobs, or production data were changed.

Production Supabase project:

```text
ereapsfcsqtdmzosgnnn / RealtyflowPRO
```

## Purpose

Activate the read-only Lead Intelligence CRM context surface introduced by:

```text
supabase/migrations/20260622103729_lead_intelligence_crm_context_readonly.sql
```

This adds the view:

```text
public.lead_intelligence_crm_context_lookup
```

The view lets the Lead Intelligence UI show masked, read-only CRM context for server-confirmed contact candidates. It must not create, update, or delete contacts, leads, emails, properties, shortlists, presentations, or customer messages.

## Source Of Truth

Use the migration file from exact source commit:

```text
f404d94cfb02cf8075223605a30ecae7abfa04bf
```

Expected SHA-256 for that file:

```text
ce43981aff2dd4f1c4d25adcef8ec90830b3a53b41ca2afa9d8be8c861d4c47d
```

At activation time, recompute the checksum from the file at the exact source commit recorded in the activation report. Do not copy SQL from chat messages, GitHub diffs, or old branches.

## Dependencies

This migration must only run after these production prerequisites are already verified:

- Lead Intelligence PR 3A persistence foundation is active.
- Lead Intelligence runtime-RLS migration is active.
- Runtime role `realtyflow_lead_intelligence_runtime` exists and is safe.
- Runtime role has no direct `public.contacts` SELECT.
- Runtime role can select `public.lead_intelligence_contact_lookup`.
- `public.contacts` has the required CRM context columns.
- Lead Intelligence persistence smoke-test has already been reviewed or the operator explicitly accepts that this is a read-only follow-up activation.

## Stop Conditions

Stop before production change if any condition is true:

- Supabase project ref is not `ereapsfcsqtdmzosgnnn`.
- The checksum differs from the exact reviewed source commit.
- The tool wants to run all historical migrations.
- The runtime role is missing.
- The runtime role has direct `public.contacts` SELECT.
- `public.contacts` is missing or has incompatible required columns.
- A view named `public.lead_intelligence_crm_context_lookup` already exists with an incompatible definition.
- `anon`, `authenticated`, or `PUBLIC` can select the CRM context view.
- Secrets, connection strings, cookies, OAuth tokens, service-role keys, or PII would be logged.
- Another deployment or schema change is modifying the same objects.
- The activation path would enable property matching, auto-send, contact creation, or lead creation.

Do not hand-repair partial objects after a failed migration. Roll back the transaction, report the failure, and keep the activation blocked.

## Preflight Read-Only Checks

Record timestamp, operator, source commit, checksum, and project ID in the activation report.

```sql
select
  version(),
  current_database(),
  current_user,
  current_schema();
```

Verify prerequisite runtime role and direct-contact access:

```sql
select
  rolname,
  rolcanlogin,
  rolsuper,
  rolcreatedb,
  rolcreaterole,
  rolinherit,
  rolbypassrls,
  rolconnlimit
from pg_roles
where rolname = 'realtyflow_lead_intelligence_runtime';

select
  has_schema_privilege('realtyflow_lead_intelligence_runtime', 'public', 'usage') as runtime_schema_usage,
  has_schema_privilege('realtyflow_lead_intelligence_runtime', 'public', 'create') as runtime_schema_create,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') as runtime_contacts_select,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intelligence_contact_lookup', 'select') as runtime_contact_lookup_select;
```

Verify required `public.contacts` columns:

```sql
select column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'contacts'
  and column_name in (
    'id',
    'brand',
    'name',
    'email',
    'phone',
    'pipeline_status',
    'pipeline_value',
    'property_interest',
    'source',
    'sentiment',
    'notes',
    'interactions',
    'last_contact',
    'next_followup',
    'created_at',
    'updated_at'
  )
order by column_name;
```

Verify existing view/policy state:

```sql
select
  c.relname,
  c.relkind,
  c.reloptions,
  obj_description(c.oid, 'pg_class') as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'lead_intelligence_crm_context_lookup';

select
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'lead_intelligence_crm_context_lookup'
order by grantee, privilege_type;
```

Check PUBLIC pseudo-role through ACL, not as a normal role:

```sql
select count(*)::int as public_select_grants
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
where n.nspname = 'public'
  and c.relname = 'lead_intelligence_crm_context_lookup'
  and acl.grantee = 0
  and acl.privilege_type = 'SELECT';
```

## Apply Migration

Run exactly one file:

```text
supabase/migrations/20260622103729_lead_intelligence_crm_context_readonly.sql
```

Use an explicit transaction:

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';

-- Paste exact file contents from the reviewed source commit.

commit;
```

On any unexpected error:

```sql
rollback;
```

Do not use:

- `supabase db push`
- Vercel build
- browser code
- PR workflows
- service-role in browser
- a batch run of old migrations
- a broad production credential in GitHub Actions

## Verification After Migration

Verify the view:

```sql
select
  c.relname,
  c.relkind,
  c.reloptions,
  obj_description(c.oid, 'pg_class') as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'lead_intelligence_crm_context_lookup';
```

Expected:

- `relkind = 'v'`
- `reloptions` includes `security_barrier=true`
- comment mentions Lead Intelligence read-only CRM context

Verify privileges:

```sql
select
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intelligence_crm_context_lookup', 'select') as runtime_select,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'select') as runtime_contacts_select,
  has_table_privilege('anon', 'public.lead_intelligence_crm_context_lookup', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.lead_intelligence_crm_context_lookup', 'select') as authenticated_select;
```

Expected:

- `runtime_select = true`
- `runtime_contacts_select = false`
- `anon_select = false`
- `authenticated_select = false`

Verify PUBLIC through ACL:

```sql
select count(*)::int as public_select_grants
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
where n.nspname = 'public'
  and c.relname = 'lead_intelligence_crm_context_lookup'
  and acl.grantee = 0
  and acl.privilege_type = 'SELECT';
```

Expected:

```text
0
```

Verify brand-context behavior with a read-only query through the runtime connection, or a controlled SQL Editor session using `set role` only if permitted:

```sql
begin;
set local role realtyflow_lead_intelligence_runtime;
select set_config('app.lead_intelligence_brand', 'soleada', true);

select
  brand,
  name,
  pipeline_status,
  pipeline_value,
  property_interest,
  source,
  sentiment,
  left(notes_excerpt, 50) as notes_excerpt_sample,
  interaction_count,
  last_contact,
  next_followup
from public.lead_intelligence_crm_context_lookup
limit 10;

rollback;
```

Do not include full phone, email, or notes in the activation report.

## UI Smoke Test

Only after schema verification:

1. Keep `REALTYFLOW_PROPERTY_MATCHING_ENABLED=false` unless it is already intentionally enabled for separate matching tests.
2. Keep `REALTYFLOW_AUTO_SEND_ENABLED=false`.
3. Open Lead Intelligence.
4. Analyze a synthetic or already-approved test message.
5. Click `Vis kontaktkandidater`.
6. Click `Hent CRM-kontekst`.

Expected:

- masked contact candidates only
- CRM context appears for matching contacts, if any
- no lookup hash in browser response
- no full phone or email in UI
- no contact created
- no lead created
- no email sent
- no property matching job started by CRM context
- no writes to `public.contacts`, `public.leads`, email tables, shortlist tables, or presentation tables

## Activation Report

Report without secrets:

- timestamp and timezone
- Supabase project ID
- source commit
- migration filename
- SHA-256 checksum
- database role used to run migration
- transaction result
- view verification
- privilege verification
- PUBLIC ACL verification
- brand-context verification
- UI smoke-test correlation ID
- confirmation that no leads, contacts, emails, or matching jobs were created
- migration history status, separately from physical schema
- deviations and rollback status

## Rollback

Before production migration:

- Git revert or do not run the migration.

After successful production migration:

- Preferred rollback is to disable the CRM context UI/API caller path while preserving the view.
- If the view itself must be removed, use a separately reviewed rollback:

```sql
drop view if exists public.lead_intelligence_crm_context_lookup;
```

Do not drop Lead Intelligence persistence tables. Do not change `public.contacts` data. Do not manipulate `supabase_migrations.schema_migrations` without a separate reviewed plan.
