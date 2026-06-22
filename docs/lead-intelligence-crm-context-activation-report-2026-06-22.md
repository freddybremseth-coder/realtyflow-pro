# Lead Intelligence CRM Context Activation Report

Date: 2026-06-22
Timezone: Europe/Madrid

## Scope

Activated the read-only CRM context view for Lead Intelligence:

```text
public.lead_intelligence_crm_context_lookup
```

This activation did not enable property matching, auto-send, contact creation, lead creation, email sending, or any customer communication.

## Project

Supabase project:

```text
ereapsfcsqtdmzosgnnn / RealtyflowPRO
```

Database engine observed during preflight:

```text
PostgreSQL 17.6
```

Database user observed during preflight:

```text
postgres
```

## Source

Migration file:

```text
supabase/migrations/20260622103729_lead_intelligence_crm_context_readonly.sql
```

Reviewed source commit:

```text
f404d94cfb02cf8075223605a30ecae7abfa04bf
```

SHA-256 verified before execution:

```text
ce43981aff2dd4f1c4d25adcef8ec90830b3a53b41ca2afa9d8be8c861d4c47d
```

The checksum matched both the reviewed source commit and the local file from `main`.

## Preflight Result

Preflight was read-only.

Confirmed:

- runtime role `realtyflow_lead_intelligence_runtime` exists
- runtime role is `LOGIN`
- runtime role is `NOINHERIT`
- runtime role has no `BYPASSRLS`
- runtime role is not superuser
- runtime role cannot create databases
- runtime role cannot create roles
- runtime role connection limit is `5`
- runtime has `public` schema usage
- runtime does not have `public` schema create
- runtime cannot select `public.contacts` directly
- runtime can select `public.lead_intelligence_contact_lookup`
- required `public.contacts` columns exist
- target CRM context view did not exist before activation
- PUBLIC select grants on the target view were `0`
- migration history had no CRM-context entry before activation

Row counts before activation:

```text
lead_intake_messages: 18
lead_analysis_runs: 18
buyer_profiles: 18
buyer_profile_criteria: 99
lead_contact_candidates: 0
contacts: 254
leads: 0
```

No application rows or PII were selected for the report.

## Execution

The migration was run once using an explicit SQL transaction with timeouts:

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
-- exact reviewed migration contents
commit;
```

Result:

```text
committed successfully
```

No old migrations were run as a batch. No production secrets were added or changed. No Vercel environment variables or feature flags were changed.

## Verification Result

Physical schema:

- `public.lead_intelligence_crm_context_lookup` exists
- object kind is `view`
- `security_barrier=true`
- view comment is present

Privileges:

```text
runtime role SELECT on CRM context view: true
runtime role direct SELECT on public.contacts: false
anon SELECT on CRM context view: false
authenticated SELECT on CRM context view: false
PUBLIC privileges on CRM context view: 0
```

Brand-context behavior:

- without brand context, CRM context returned `0` rows
- `soleada` context returned `0` rows in the verification query
- no full phone, email, notes, or contact rows were included in the report

Row counts after activation:

```text
lead_intake_messages: 18
lead_analysis_runs: 18
buyer_profiles: 18
buyer_profile_criteria: 99
lead_contact_candidates: 0
contacts: 254
leads: 0
```

No count changed during activation.

## Migration History

The migration was applied through an explicit SQL execution path, not Supabase migration history tooling.

Result:

```text
supabase_migrations.schema_migrations entry for 20260622103729: none
```

Physical schema and migration history are intentionally reported separately. Migration history was not manipulated manually.

## Side Effects

Confirmed by scope and row counts:

- no `public.leads` rows created
- no `public.contacts` rows created or updated
- no Lead Intelligence candidate rows created
- no e-mails sent
- no property matching jobs started
- no shortlist or presentation was created by this activation
- no existing Neural Beat, Re-Master, or RealtyFlow data was modified by the migration

## Remaining Verification

Manual/UI smoke-test still required:

1. Open Lead Intelligence as an authorized admin.
2. Use a synthetic or already-approved test intake.
3. Click `Vis kontaktkandidater`.
4. Click `Hent CRM-kontekst`.
5. Confirm only masked contact data is displayed.
6. Confirm no contact, lead, email, matching job, shortlist, or presentation is created.

If the UI returns `PERSISTENCE_SCHEMA_NOT_READY`, verify the deployed runtime is on a commit that includes PR #91 and that server-side environment variables are scoped correctly.

## Rollback Status

No rollback was needed.

If rollback is required later, preferred first response is to disable or hide the CRM-context caller. If the view itself must be removed, use a separately reviewed SQL rollback:

```sql
drop view if exists public.lead_intelligence_crm_context_lookup;
```

Do not drop Lead Intelligence persistence tables, alter `public.contacts`, or manipulate `supabase_migrations.schema_migrations` without a separate reviewed plan.
