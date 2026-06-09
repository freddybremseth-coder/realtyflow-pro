# Authoritative Supabase Production Migration Workflow

Issue: [#32 Define authoritative Supabase production migration workflow](https://github.com/freddybremseth-coder/realtyflow-pro/issues/32)

Status: process documentation only. No production SQL was executed while writing this document. No row, schema object, policy, bucket, function privilege, or `supabase_migrations.schema_migrations` entry was changed.

Production project: `ereapsfcsqtdmzosgnnn`

## Purpose

RealtyFlow and Re-Master currently have documented drift between:

- repository migrations in `supabase/migrations`
- physical production schema
- production rows in `supabase_migrations.schema_migrations`

This document defines the standard process for future production migrations so new changes are reviewed, applied, verified, and recorded without increasing drift.

## Non-Negotiable Rules

- Do not run all historical migrations against production to align history.
- Do not run migrations from Vercel build or deploy steps.
- Do not expose production database credentials to pull-request code.
- Do not add broad production credentials as repository-level GitHub secrets.
- Do not insert rows into `supabase_migrations.schema_migrations` unless physical schema equivalence has been proved and reviewed.
- Do not apply destructive SQL without a separate approval, backup/restore plan, rollback plan, and maintenance window.
- Prefer additive, backward-compatible migrations.
- Keep application deploy and schema activation order explicit.

## Standard Tooling Decision

The standard production path is a controlled manual execution of one reviewed SQL file, using either:

1. Supabase SQL Editor, with the exact reviewed file pasted once into an explicit transaction, or
2. Supabase CLI or `psql`, configured to run exactly one reviewed file against the known production project.

The standard path is not:

- `supabase db push` with a backlog of old migrations
- automatic migration from Vercel
- pull-request GitHub Actions with production secrets
- a broad full-privilege database URL stored for convenience
- direct edits copied from chat, old branches, or PR diffs

A protected GitHub workflow may be introduced later, but only after it uses a protected environment, an approved credential model, manual approval, checksum verification, and an explicit single-file target.

## Roles and Approval

Every production migration must have these roles recorded in the PR or activation report:

- Author: prepares the migration and tests.
- Reviewer: reviews SQL, application compatibility, RLS, rollback, and evidence.
- Approver: authorizes production activation.
- Operator: runs the production migration.
- Verifier: performs post-apply schema and smoke checks.

The same person may hold multiple roles only for low-risk additive changes. Destructive or auth/security-sensitive changes require at least one independent reviewer.

## Authoring Requirements

Each schema PR must include:

- one focused migration or a clearly justified small set
- no secrets, generated production IDs, access tokens, or connection strings
- additive/idempotent SQL where practical
- explicit object list
- lock and runtime risk
- data transformation risk
- RLS, grants, policy, trigger, and function-security impact
- application compatibility notes
- rollback or disable plan
- production preflight checklist
- post-apply verification checklist

If a migration cannot be idempotent, the PR must explain the exact precondition and stop condition.

## Testing Requirements

Before merge, run:

- isolated PostgreSQL integration tests for the explicit migration when applicable
- legacy/partial-baseline tests when repairing drift
- idempotency tests for additive repair migrations
- relevant unit tests
- application build
- `git diff --check`

The existing `Re-Master migration integration` workflow is the model for migration tests. It uses an isolated PostgreSQL service container and does not use production secrets.

Pull-request checks must remain static or isolated. PR workflows must never receive:

- `SUPABASE_DB_URL`
- `POSTGRES_URL`
- `DATABASE_URL`
- service-role keys
- OAuth tokens

## Production Preflight

Before any production SQL is run, document:

- exact Supabase project ref, normally `ereapsfcsqtdmzosgnnn`
- database name, database version, current role, and current schema
- source commit
- migration filename
- SHA-256 checksum of the file on `main`
- whether the intended objects already exist
- whether function names/signatures collide
- whether indexes, triggers, constraints, policies, and grants already exist
- snapshot of relevant physical schema
- snapshot of relevant migration history
- confirmation that no parallel schema change or deploy is modifying the same objects
- exact operator and execution path

Stop without changes if:

- project ref is wrong
- checksum differs from the reviewed `main` file
- a target object exists with an incompatible shape
- the execution tool intends to run unrelated migrations
- the database user or connection path is unknown
- secrets would be printed to logs
- a parallel schema change is in progress
- rollback/disable instructions are missing

## Production Execution Template

Prefer one explicit transaction when the SQL supports it:

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';

-- Exact reviewed migration file content goes here.

commit;
```

If a statement such as `create index concurrently` is required, it cannot run inside a transaction block. The PR must then document the separate execution sequence, locks, retry plan, and rollback.

On any unexpected error:

```sql
rollback;
```

Do not hand-repair individual objects after a partial failure. Report the failure and stop.

## Post-Apply Verification

Verify physical schema before application smoke tests:

- tables and columns
- primary keys and foreign keys
- check constraints
- indexes and predicates
- triggers and trigger functions
- RLS enabled state
- policies and roles
- function signatures
- function owner, language, `SECURITY DEFINER`/`SECURITY INVOKER`, and `search_path`
- function privileges, including `PUBLIC`, `anon`, `authenticated`, and `service_role`
- Storage buckets and policies when applicable

Then run safe application smoke tests that do not trigger irreversible side effects unless the migration explicitly requires that behavior and it has been approved.

## Production Activation Report Template

Every production migration must leave an activation report in the issue or PR:

```text
Timestamp and timezone:
Supabase project ref:
Migration file:
Source commit:
SHA-256:
Operator:
Database role:
Execution path:
Transaction result:
Objects created/changed:
Constraints verified:
Indexes verified:
RLS/policies verified:
Function privileges verified:
Storage verified:
Migration history result:
Application/API smoke test:
Test IDs:
Deviations:
Rollback status:
Confirmation that unrelated production data was not changed:
```

## Migration History Policy

Physical schema and migration history are separate facts.

After a migration is manually applied, record whether:

- the physical schema was changed
- a row was inserted by the execution tool into `supabase_migrations.schema_migrations`
- no history row was inserted because the SQL was run manually

Do not manually insert migration-history rows as part of a normal production activation unless a separate reviewed reconciliation task approves it.

## History Reconciliation Inventory

Use this format for future reconciliation work:

| Migration | Recorded in production | Physical equivalent | Risk | Recommendation | Evidence |
| --- | --- | --- | --- | --- | --- |
| `20260607173023_remaster_pipeline_jobs_core.sql` | no | yes | medium | candidate for reviewed baseline entry only after equivalence proof | issue #30 activation report |

Classify each migration into one of three categories:

1. Recorded and physically equivalent.
2. Not recorded, but physical objects are equivalent.
3. Not recorded, and physical state differs or is unknown.

For category 2, create a separate baselining proposal. It must prove equivalence and define rollback for any history-row correction.

For category 3, write a new forward-only reconciliation migration. Do not run the stale migration blindly.

## Manual SQL File Applications

Manual SQL is acceptable only when:

- the SQL file is already reviewed and merged, or emergency-approved
- checksum is verified against source
- only that file is executed
- preflight and stop conditions are documented
- post-apply verification is documented
- migration-history result is reported honestly

Manual SQL is not acceptable for:

- applying old migration backlogs
- registering history without schema proof
- changing RLS/security policy without code-audit evidence
- destructive cleanup without explicit approval

## Protected Environment Recommendation

Keep `production-schema-audit` as a protected GitHub Environment for live schema-contract checks.

If a future protected migration workflow is built, create a separate environment such as:

```text
production-schema-migration
```

Minimum requirements:

- manual approval
- branch restricted to `main`
- no pull-request trigger with production secrets
- explicit migration filename input
- checksum verification against `main`
- no broad historical migration command
- least-privilege credential if possible
- logs that never print connection strings, passwords, service-role keys, OAuth tokens, or raw SQL errors containing secrets

Until that exists, use the controlled manual path.

## Normal Migration Checklist

- [ ] Migration PR is merged.
- [ ] Isolated migration tests are green.
- [ ] Build/tests are green.
- [ ] Vercel preview is green if the app surface changes.
- [ ] Production project ref is verified.
- [ ] Source commit and checksum are verified.
- [ ] Preflight snapshot is captured.
- [ ] Stop conditions are checked.
- [ ] Exact SQL file is run once through the approved path.
- [ ] Physical schema is verified.
- [ ] Migration history result is documented.
- [ ] Smoke test is complete.
- [ ] Activation report is posted.

## Emergency Hotfix Checklist

Emergency hotfixes must still be auditable:

- [ ] Describe incident and impact.
- [ ] Choose the smallest safe SQL.
- [ ] Confirm backup or point-in-time recovery posture.
- [ ] Have at least one reviewer approve in writing when possible.
- [ ] Use explicit transaction and timeouts where supported.
- [ ] Run post-apply verification.
- [ ] Open a follow-up repository PR that codifies the production contract.
- [ ] Open a drift reconciliation issue if migration history was not updated.

## Rollback Guidance

Documentation-only changes roll back with `git revert`.

For production migrations:

- Prefer disabling application callers before dropping schema additions.
- Leave additive nullable columns in place unless they cause a proven problem.
- Drop newly created indexes only if they were created by the migration and are causing harm.
- Do not drop tables or buckets without explicit approval.
- Do not delete data as rollback unless a separate data-rollback plan was reviewed.
- If a migration-history row was inserted incorrectly, remove only that row after a separate review confirms no dependent tooling will be confused.

## Current Known Drift Notes

- Production contains physical schema that is not fully represented by recorded migration history.
- The Re-Master durable job schema was applied and verified physically, but the `20260607173023` history row was not inserted during that controlled activation.
- The `public.user_image_bank` production contract exists from a hotfix and later repository migration. Do not run that migration merely to register it.
- Old migrations must be treated as historical evidence, not as an execution queue.

## Next Step

Use this workflow for every new Supabase production migration until a reviewed protected migration workflow replaces the manual execution path.
