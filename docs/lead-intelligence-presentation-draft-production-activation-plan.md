# Lead Intelligence Presentation Draft Production Activation Plan

Status: operational plan only. No production SQL was executed while writing this document. No feature flags, Vercel environment variables, runtime credentials, HMAC secrets, email sending, contacts, leads, or property matching jobs were changed.

Production Supabase project: `ereapsfcsqtdmzosgnnn`

This plan activates the draft-only Lead Intelligence presentation schema after the existing Lead Intelligence persistence, runtime RLS, and shortlist draft schemas are verified in production.

## Scope

Included:

- apply exactly one reviewed migration file
- add internal customer presentation draft storage
- add internal email message draft storage
- verify RLS, grants, policies, constraints, indexes, triggers, and idempotency
- smoke-test with already saved synthetic Lead Intelligence data only

Not included:

- sending email, WhatsApp, SMS, or any customer communication
- creating or updating `public.contacts`
- creating or updating `public.leads`
- publishing a customer presentation URL
- starting property matching jobs
- changing feature flags
- changing runtime credentials or secrets
- running historical migrations as a batch
- manipulating `supabase_migrations.schema_migrations`

## Source Of Truth

Use the migration file from the exact source commit recorded in the activation report. Do not use SQL copied from chat, PR diffs, or old branches.

Source commit when this plan was written:

```text
cbf793176bbc09fc071e281252dfe004accdd2ca
```

Migration:

```text
supabase/migrations/20260621191609_lead_intelligence_presentation_draft.sql
```

SHA-256 at source commit `cbf793176bbc09fc071e281252dfe004accdd2ca`:

```text
b04dab2dab17268a62c4a84848f09171d6e602378cd3b61d1066e4729af5ae59
```

At activation time, recompute the checksum from the file at the exact source commit used for activation and record both values in the activation report.

The migration creates:

- `public.lead_customer_presentations`
- `public.lead_customer_message_drafts`
- update triggers on both tables
- role-specific runtime RLS policies for `realtyflow_lead_intelligence_runtime`

The migration does not alter:

- `public.leads`
- `public.contacts`
- email sending tables
- property inventory tables
- shortlist rows
- buyer profile rows
- Storage buckets

## Required Dependencies

Before running the migration, verify that these production objects already exist and match their reviewed markers:

- `public.lead_intake_messages`
- `public.lead_analysis_runs`
- `public.buyer_profiles`
- `public.buyer_profile_criteria`
- `public.lead_contact_candidates`
- `public.lead_property_shortlists`
- `public.lead_property_shortlist_items`
- `public.set_lead_intelligence_updated_at()`
- role `realtyflow_lead_intelligence_runtime`

Required table comments:

```text
Lead Intelligence persistence foundation v1
Lead Intelligence shortlist draft foundation v1
```

## Stop Conditions

Stop before changing production if any condition is true:

- Supabase project ref is not `ereapsfcsqtdmzosgnnn`.
- The migration checksum differs from the reviewed source commit.
- The execution path would run more than this one migration file.
- Any dependency table is missing or has an unexpected marker.
- `public.set_lead_intelligence_updated_at()` is missing or incompatible.
- `realtyflow_lead_intelligence_runtime` is missing, unsafe, or has unexpected broad privileges.
- `lead_customer_presentations` or `lead_customer_message_drafts` already exists without marker `Lead Intelligence presentation draft foundation v1`.
- Browser roles `PUBLIC`, `anon`, or `authenticated` would receive table access.
- Secrets or connection strings would appear in logs.
- Another schema change is running against the same objects.
- The operator cannot identify the database role used to execute the migration.

Do not hand-repair partial objects after a failed migration. Roll back the transaction, report the failure, and leave activation blocked.

## Preflight

Run read-only checks and save only schema metadata in the activation report. Do not fetch raw customer messages, phone numbers, email addresses, provider payloads, or secrets.

```sql
select
  version(),
  current_database(),
  current_user,
  current_schema();
```

Confirm dependencies and target tables:

```sql
select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind,
  obj_description(c.oid, 'pg_class') as comment
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates',
    'lead_property_shortlists',
    'lead_property_shortlist_items',
    'lead_customer_presentations',
    'lead_customer_message_drafts'
  )
order by c.relname;
```

Confirm runtime role:

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
```

Confirm target trigger names do not already collide:

```sql
select
  tgname,
  tgrelid::regclass as table_name,
  tgfoid::regprocedure as function_name
from pg_trigger
where tgname in (
  'trg_lead_customer_presentations_updated_at',
  'trg_lead_customer_message_drafts_updated_at'
);
```

Snapshot migration history separately from physical schema:

```sql
select version, name, statements, inserted_at
from supabase_migrations.schema_migrations
where version in ('20260621191609')
   or name ilike '%presentation%'
   or name ilike '%lead_intelligence%';
```

## Apply Migration

Use Supabase SQL Editor or an explicit CLI/psql command that runs exactly this file against `ereapsfcsqtdmzosgnnn`.

Do not use:

- `supabase db push`
- Vercel build
- browser code
- PR workflows
- a broad GitHub Actions database credential
- a batch of historical migrations

Run inside one explicit transaction:

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';

-- Paste the exact contents of:
-- supabase/migrations/20260621191609_lead_intelligence_presentation_draft.sql

commit;
```

On any unexpected error:

```sql
rollback;
```

Do not insert rows into `supabase_migrations.schema_migrations` manually. Report whether the execution tool recorded migration history or only changed physical schema.

## Physical Schema Verification

Verify columns:

```sql
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'lead_customer_presentations',
    'lead_customer_message_drafts'
  )
order by table_name, ordinal_position;
```

Verify constraints:

```sql
select
  conrelid::regclass as table_name,
  conname,
  contype,
  convalidated,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.lead_customer_presentations'::regclass,
  'public.lead_customer_message_drafts'::regclass
)
order by table_name::text, conname;
```

Verify indexes:

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'lead_customer_presentations',
    'lead_customer_message_drafts'
  )
order by tablename, indexname;
```

Verify RLS:

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'lead_customer_presentations',
    'lead_customer_message_drafts'
  )
order by c.relname;
```

Verify policies:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'lead_customer_presentations',
    'lead_customer_message_drafts'
  )
order by tablename, policyname;
```

Verify privileges:

```sql
select
  has_table_privilege('anon', 'public.lead_customer_presentations', 'select') as anon_presentations_select,
  has_table_privilege('authenticated', 'public.lead_customer_presentations', 'select') as authenticated_presentations_select,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'select') as runtime_presentations_select,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'insert') as runtime_presentations_insert,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'update') as runtime_presentations_update,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_presentations', 'delete') as runtime_presentations_delete,
  has_table_privilege('anon', 'public.lead_customer_message_drafts', 'select') as anon_messages_select,
  has_table_privilege('authenticated', 'public.lead_customer_message_drafts', 'select') as authenticated_messages_select,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'select') as runtime_messages_select,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'insert') as runtime_messages_insert,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'update') as runtime_messages_update,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_customer_message_drafts', 'delete') as runtime_messages_delete;
```

Expected:

- `anon_* = false`
- `authenticated_* = false`
- runtime `select = true`
- runtime `insert = true`
- runtime `update = false`
- runtime `delete = false`

Verify PUBLIC ACL explicitly:

```sql
select
  c.relname,
  acl.privilege_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
where n.nspname = 'public'
  and c.relname in (
    'lead_customer_presentations',
    'lead_customer_message_drafts'
  )
  and acl.grantee = 0
  and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
```

Expected: zero rows.

## Controlled Smoke Test

Use existing synthetic Lead Intelligence test data only. Do not use a real customer unless explicitly approved.

Preconditions:

- persistence foundation active
- runtime RLS active
- shortlist draft schema active
- a draft shortlist exists for an approved buyer profile
- `REALTYFLOW_AUTO_SEND_ENABLED=false`

Actions:

1. Open the Lead Intelligence flow.
2. Use an already saved buyer profile and shortlist.
3. Click the presentation draft action.
4. Confirm the response creates:
   - one `lead_customer_presentations` row
   - one `lead_customer_message_drafts` row
5. Repeat the same request with the same idempotency seed and same payload.
6. Confirm duplicate/idempotent behavior returns the same IDs.
7. Repeat with the same idempotency seed and changed payload.
8. Confirm `REVIEW_CONFLICT` and no new rows.

Verify no external side effects:

```sql
select count(*) from public.leads;
select count(*) from public.contacts;
```

Also verify no new email send records, no property matching jobs, and no presentation was published. Use table-specific count queries only for tables known to exist in the target environment, and do not report PII.

## Rollback

Before production migration:

- revert or supersede the code/migration PR.

After production migration:

- prefer disabling the UI action by code/flag if available.
- normally leave the additive draft tables in place.
- drop the new tables only if it is proven that this migration created them in the target environment and no real presentation/message drafts must be retained.

Rollback SQL must be reviewed separately before use:

```sql
drop table if exists public.lead_customer_message_drafts;
drop table if exists public.lead_customer_presentations;
```

Never drop buyer profiles, shortlists, contacts, leads, email, property, or Storage data as part of this rollback.

## Activation Report Template

Record:

- timestamp and timezone
- Supabase project ref
- source commit
- migration file path
- SHA-256 checksum
- database role used for execution
- transaction result
- objects created
- constraints and indexes verified
- RLS/policies verified
- privilege verification
- migration history status
- smoke-test IDs
- duplicate result
- conflict result
- side-effect verification
- rollback status
- any deviations or stop conditions
