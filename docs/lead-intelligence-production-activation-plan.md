# Lead Intelligence Production Activation Plan

Status: operational plan only. No production SQL was executed while writing this document. No feature flag was enabled, no production secret was changed, and no Lead Intelligence production migration was applied.

Production Supabase project: `ereapsfcsqtdmzosgnnn`

This plan activates the already reviewed Lead Intelligence PR 3A schema and PR 3B review flow in a controlled sequence. It builds on [Authoritative Supabase Production Migration Workflow](./production-migration-workflow.md) and must not replace that process.

## Scope

Included:

- apply exactly one reviewed migration file
- create a dedicated runtime database role/URL
- configure the server-only contact lookup HMAC secret
- keep feature flags disabled in production until explicit activation
- enable first in preview/staging
- smoke-test the Emmadale flow
- verify duplicate and conflict behavior

Not included:

- property matching
- shortlist generation
- presentations
- email, WhatsApp, SMS, or customer-message sending
- automatic contact creation
- automatic linking to an existing contact
- writes to `public.leads`
- broad RLS or Storage hardening
- migration history repair
- running old migrations as a batch

## Source Of Truth

Use the file from updated `main`, not SQL copied from chat, PR diffs, or old branches.

```text
supabase/migrations/20260614164309_lead_intelligence_persistence_foundation.sql
```

Expected SHA-256 on `main` at the time this plan was written:

```text
2f25ad8bd79b127bb0f7c0c32c8fd9783fc2893fbba18d6fb3ecde1b0c130794
```

The migration creates:

- `public.lead_intake_messages`
- `public.lead_analysis_runs`
- `public.buyer_profiles`
- `public.buyer_profile_criteria`
- `public.lead_contact_candidates`
- `public.set_lead_intelligence_updated_at()`
- update triggers for intake/profile/criteria timestamps

It does not change `public.leads`, `public.contacts`, property tables, email tables, Storage buckets, or existing production rows.

## Stop Conditions

Stop before changing production if any condition is true:

- Supabase project ref is not `ereapsfcsqtdmzosgnnn`.
- The migration checksum differs from the reviewed `main` file.
- The execution path would run more than this one migration file.
- Any target Lead Intelligence table already exists without table comment `Lead Intelligence persistence foundation v1`.
- A target function or trigger exists with an incompatible definition.
- The operator cannot identify the database role used for execution.
- Secrets or connection strings would appear in logs.
- Another schema change or deploy is modifying the same objects.
- `REALTYFLOW_AUTO_SEND_ENABLED` or `REALTYFLOW_PROPERTY_MATCHING_ENABLED` would be enabled as part of this activation.

Do not hand-repair partial objects after a failed migration. Roll back the transaction, report the failure, and leave this activation blocked.

## Preflight

Run read-only checks and save the output in the activation report. Do not fetch application rows or secrets.

```sql
select
  version(),
  current_database(),
  current_user,
  current_schema();
```

Confirm target tables do not already exist or are compatible:

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
    'lead_contact_candidates'
  )
order by c.relname;
```

Check function and trigger collisions:

```sql
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'set_lead_intelligence_updated_at';

select
  tgname,
  tgrelid::regclass as table_name,
  tgfoid::regprocedure as function_name
from pg_trigger
where tgname in (
  'trg_lead_intake_messages_updated_at',
  'trg_buyer_profiles_updated_at',
  'trg_buyer_profile_criteria_updated_at'
);
```

Snapshot migration history separately from physical schema:

```sql
select version, name, statements, inserted_at
from supabase_migrations.schema_migrations
where version = '20260614164309'
   or name ilike '%lead_intelligence%';
```

Confirm the feature flags are still disabled in production before migration:

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=false
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=false
REALTYFLOW_PROPERTY_MATCHING_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

## Apply Schema

Use Supabase SQL Editor or an explicit CLI/psql command that runs exactly this file against `ereapsfcsqtdmzosgnnn`. Do not use `supabase db push`, Vercel build, browser code, PR workflows, or a batch of historical migrations.

Run inside one explicit transaction:

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';

-- Paste the exact contents of:
-- supabase/migrations/20260614164309_lead_intelligence_persistence_foundation.sql

commit;
```

On any unexpected error:

```sql
rollback;
```

Do not insert rows into `supabase_migrations.schema_migrations` manually. Report whether the execution tool recorded migration history or only changed physical schema.

## Physical Schema Verification

Verify tables, columns, constraints, indexes, RLS, grants, trigger, and comments before enabling any app flag.

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
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates'
  )
order by table_name, ordinal_position;
```

```sql
select
  conrelid::regclass as table_name,
  conname,
  contype,
  convalidated
from pg_constraint
where conrelid in (
  'public.lead_intake_messages'::regclass,
  'public.lead_analysis_runs'::regclass,
  'public.buyer_profiles'::regclass,
  'public.buyer_profile_criteria'::regclass,
  'public.lead_contact_candidates'::regclass
)
order by table_name::text, conname;
```

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates'
  )
order by tablename, indexname;
```

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates'
  )
order by c.relname;
```

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'lead_intake_messages',
    'lead_analysis_runs',
    'buyer_profiles',
    'buyer_profile_criteria',
    'lead_contact_candidates'
  )
order by tablename, policyname;
```

Expected: RLS enabled on all five tables and no open policies. The migration intentionally revokes `public`, `anon`, and `authenticated`.

Verify the trigger function:

```sql
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef,
  p.provolatile,
  pg_get_userbyid(p.proowner) as owner,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'set_lead_intelligence_updated_at';

select
  tgname,
  tgrelid::regclass as table_name,
  tgfoid::regprocedure as function_name,
  not tgisinternal as user_trigger
from pg_trigger
where tgname in (
  'trg_lead_intake_messages_updated_at',
  'trg_buyer_profiles_updated_at',
  'trg_buyer_profile_criteria_updated_at'
)
order by tgname;
```

Expected: the function is `SECURITY INVOKER` (`prosecdef = false`) and the triggers are only attached to the three Lead Intelligence tables that have `updated_at`.

## Dedicated Runtime Database Role

Production must not use a broad/full-privilege database URL for Lead Intelligence persistence. Create a dedicated runtime role after the schema exists.

Important RLS detail: PR 3A enables RLS on the new tables and creates no broad policies. Plain table grants are therefore not enough for a normal role to read/write the new tables. Use one of these reviewed models:

1. Preferred for this controlled server-only phase: create a dedicated `BYPASSRLS` runtime role with no DDL privileges and only the table/column grants listed below.
2. Alternative: create separate role-specific RLS policies in a reviewed migration, then use a normal runtime role.

Do not enable the feature if the runtime role cannot be made to access the new tables through one of those two explicit models. Do not fall back to a broad `service_role` or administrator database URL just to make the smoke test pass.

Recommended role name:

```text
realtyflow_lead_intelligence_runtime
```

The exact password must be generated outside the repo and never committed, pasted into issues, or logged. Use the resulting connection string only as a server-side environment secret:

```text
REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL
```

Privileges should be limited to the operations PR 3B performs:

- `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the five new Lead Intelligence tables.
- column-limited `SELECT` on `public.contacts` for:
  - `id`
  - `brand`
  - `name`
  - `phone`
  - `email`
  - `created_at`
  - `updated_at`
- no DDL privileges
- no access to OAuth tokens, secrets, email provider credentials, Storage metadata beyond unrelated inherited catalog visibility, or unrelated application tables

SQL template for the preferred dedicated runtime role, with password omitted deliberately:

```sql
-- Run only after migration verification and with a generated password supplied out of band.
create role realtyflow_lead_intelligence_runtime
  login
  bypassrls
  password '<GENERATED_PASSWORD>';

grant usage on schema public to realtyflow_lead_intelligence_runtime;

grant select, insert, update, delete
on public.lead_intake_messages,
   public.lead_analysis_runs,
   public.buyer_profiles,
   public.buyer_profile_criteria,
   public.lead_contact_candidates
to realtyflow_lead_intelligence_runtime;

grant select (id, brand, name, phone, email, created_at, updated_at)
on public.contacts
to realtyflow_lead_intelligence_runtime;

alter role realtyflow_lead_intelligence_runtime
  set statement_timeout = '30s';
alter role realtyflow_lead_intelligence_runtime
  set lock_timeout = '5s';
alter role realtyflow_lead_intelligence_runtime
  set idle_in_transaction_session_timeout = '30s';
```

Runtime role verification:

```sql
select
  (select rolbypassrls from pg_roles where rolname = 'realtyflow_lead_intelligence_runtime') as bypassrls_enabled,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_intake_messages', 'select,insert,update,delete') as intake_rw,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_analysis_runs', 'select,insert,update,delete') as analysis_rw,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profiles', 'select,insert,update,delete') as profiles_rw,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.buyer_profile_criteria', 'select,insert,update,delete') as criteria_rw,
  has_table_privilege('realtyflow_lead_intelligence_runtime', 'public.lead_contact_candidates', 'select,insert,update,delete') as candidates_rw,
  has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'id', 'select') as contacts_id_select,
  has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'brand', 'select') as contacts_brand_select,
  has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'name', 'select') as contacts_name_select,
  has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'phone', 'select') as contacts_phone_select,
  has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'email', 'select') as contacts_email_select,
  has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'created_at', 'select') as contacts_created_at_select,
  has_column_privilege('realtyflow_lead_intelligence_runtime', 'public.contacts', 'updated_at', 'select') as contacts_updated_at_select;
```

Also test that the role cannot:

- create a table
- alter an existing table
- select OAuth/token tables
- select unrelated application data
- access full customer communication logs outside the specific contact columns above

## HMAC Secret

Configure a server-only secret before candidate lookup or review persistence:

```text
REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET=<at least 32 characters>
```

Generate it outside the repo, for example with a password manager or a local command such as:

```bash
openssl rand -base64 48
```

Do not print the generated value in logs or activation reports. The same secret must be used consistently within the environment so duplicate contact lookup hashes remain stable. Rotating it later requires a separate plan because existing `lead_contact_candidates.match_value_hash` rows use the old HMAC secret.

## Environment Activation Order

Production stays disabled until preview/staging proves the flow.

### Preview/Staging

Set these server-side variables in the preview/staging environment only:

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true
REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL=<dedicated runtime connection string>
REALTYFLOW_LEAD_CONTACT_LOOKUP_HMAC_SECRET=<server-only secret>
REALTYFLOW_PROPERTY_MATCHING_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

Required AI-provider variables for extraction may be enabled only in the same controlled environment. Provider keys must remain server-only.

### Production

Keep these disabled until the activation report is reviewed:

```text
REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=false
REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=false
REALTYFLOW_PROPERTY_MATCHING_ENABLED=false
REALTYFLOW_AUTO_SEND_ENABLED=false
```

After a successful preview/staging smoke-test, production may be enabled in two steps:

1. `REALTYFLOW_LEAD_INTELLIGENCE_ENABLED=true` for extraction/review UI visibility.
2. `REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED=true` only after the runtime DB URL and HMAC secret are verified.

Rollback is to set both Lead Intelligence flags back to `false`. Do not drop tables as an operational rollback.

## Emmadale Smoke Test

Use this exact fixture in preview/staging first:

```text
Pratet med en kunde. Han er kjøpeklar om vi finner noe. Vi kan kontakte han om vi kommer over noe aktuelt.

Emmadale
+47 90 17 47 14

Notat:
Enderekkehus, eller leilighet.

Rekkehuset vårt i Polop likte han svært godt, men det er ikke aktuelt på grunn av den kommunale tomten på siden som kan bygges på i fremtiden.

Ikke fastsatt på område.

Hvis leilighet:
Stor åpen terrasse eventuelt ut fra stue 20 kvm+
Må være på toppen.
Må være heis om det er opp i etasjene.
God utsikt.
Minst 2 soverom.

440.000€ omtrent inkludert omkostninger.
```

Expected analysis before save:

- contact name: `Emmadale`
- phone: original visible in UI; normalized lookup does not leak into logs
- email: `null`
- readiness: `ready_to_buy`
- budget: `440000 EUR`, includes costs, approximate
- location flexible: `true`
- property types include `end_townhouse` and `apartment` or `penthouse`
- hard requirements include bedrooms `gte 2`, top floor for apartment/penthouse, lift for elevated apartment/penthouse
- preferences include terrace area at least 20 m2, terrace from living room, good view
- exclusions include future building risk and view/privacy loss risk

Review/save steps:

1. Analyze the fixture.
2. Edit locally only if needed.
3. Approve or reject every criterion at item level.
4. Run contact candidate lookup.
5. Choose one explicit contact decision:
   - connect existing only if a server-returned candidate is clearly correct
   - create new, which records intent only and does not create a contact in PR 3B
   - continue without contact
6. Save review.

Expected persistence:

- one `lead_intake_messages` row
- one `lead_analysis_runs` row with validated structured JSON and `reviewPayloadHash`
- one `buyer_profiles` row
- `buyer_profile_criteria` rows for approved active criteria; rejected criteria inactive
- zero writes to `public.leads`
- zero new `public.contacts` rows
- zero customer-message sends
- zero property match/shortlist/presentation rows

## Duplicate And Conflict Smoke Tests

Use the same review payload and idempotency seed twice.

Expected:

- second save returns duplicate/idempotent status
- same intake ID
- same analysis run ID
- same buyer profile ID
- no duplicate criteria
- no duplicate contact candidates

Then reuse the same idempotency seed with one material payload change, for example:

- change one criterion approval status, or
- change the contact decision, or
- change the reviewed analysis summary

Expected:

- API returns `REVIEW_CONFLICT`
- HTTP 409
- safe error envelope with correlation ID
- no new profile
- no additional criteria
- no additional contact candidates
- no existing profile overwritten

## Safety Verification

During and after smoke testing, verify:

- raw provider output is not stored
- `raw_text_restricted` remains null unless a future reviewed retention policy enables it
- no full phone/email appears in logs
- contact candidates store HMAC hashes, not plain phone/email
- browser responses do not include database URLs, HMAC secret, provider secrets, service-role keys, or stack traces
- no call is made to `/api/email/send`
- no property matching route is invoked
- `REALTYFLOW_AUTO_SEND_ENABLED=false`
- `REALTYFLOW_PROPERTY_MATCHING_ENABLED=false`

## Activation Report Template

Leave the activation report in the relevant issue or PR before enabling production persistence broadly:

```text
Timestamp and timezone:
Supabase project ref:
Migration file:
Source commit:
SHA-256:
Operator:
Database role used for migration:
Execution path:
Transaction result:
Objects created/changed:
Constraint verification:
Index verification:
RLS/policy verification:
Trigger/function verification:
Runtime role created:
Runtime role privilege verification:
HMAC secret configured:
Feature flags configured:
Migration history result:
Preview/staging smoke test:
Emmadale test IDs:
Duplicate test result:
Conflict test result:
No email/matching confirmation:
Production flags status:
Deviations:
Rollback/disable status:
Confirmation that existing RealtyFlow/Lead/Contact/Property/Email data was not modified except approved Lead Intelligence test rows:
```

## Gate Before PR 4

Do not start property normalization or deterministic matching until:

- the schema migration has been applied and verified
- the dedicated runtime DB URL is configured
- the HMAC secret is configured
- preview/staging smoke-test passes
- duplicate and conflict behavior is verified
- email sending and property matching remain off
- Freddy approves the reviewed Lead Intelligence flow
