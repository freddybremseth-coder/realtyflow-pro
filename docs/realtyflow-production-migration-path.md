# RealtyFlow production migration path

Status: documented before introducing the Re-Master job-core migration. No production migration was run while writing this document.

## What currently runs automatically

Repository checks show:

- `.github/workflows/ci.yml` runs `npm ci` and `npm run build` on pull requests and pushes to `main`.
- `.github/workflows/remaster-migration-integration.yml` runs explicit migrations against an isolated PostgreSQL service container on pull requests that touch migrations or the test harness. It can also run manually through `workflow_dispatch`.
- `.github/workflows/remaster-schema-contract-static.yml` runs static script syntax and whitespace checks on pull requests.
- `.github/workflows/remaster-schema-contract-production.yml` can run the live production schema contract only on push to `main` or manual dispatch, and only behind the protected `production-schema-audit` environment.

None of these workflows applies Supabase migrations to production.

## What is not present

Current repository inspection found no production deployment path that runs:

- `supabase db push`
- `supabase migration up`
- `psql` against production
- a Vercel build or deploy command that applies `supabase/migrations`
- a GitHub Action that applies repository migrations to the production Supabase project

There is also no evidence that Vercel deploys apply database migrations during `next build`.

## Current operating model

At this point, `supabase/migrations` is repository source of truth for reviewed migration files, but not an automatic production migration runner.

Production schema changes appear to have historically happened through a mix of:

- direct/manual SQL
- Supabase dashboard or SQL Editor hotfixes
- repository migrations that may not be recorded in production history
- production-only hotfix migration history, such as `20260607100044_create_user_image_bank_for_remaster`

Because of the documented migration drift, old migrations must not be applied in bulk.

## Required process before future production migrations

For each production schema change:

1. Merge an additive, idempotent migration PR after isolated PostgreSQL tests pass.
2. Confirm whether production already has the intended contract.
3. If production needs the migration, choose and document the exact runner before execution.
4. Use a least-privilege or approved administrative path.
5. Do not run broad historical migrations to register history.
6. Do not apply a migration manually just to mark it recorded when production already has the equivalent schema.

For `public.user_image_bank`, production already has the desired contract from the hotfix. The repository migration codifies the contract for future environments and should not be manually run against production merely to register it.

## Rollback

Documentation rollback is a git revert.

For future production migrations, rollback must be defined per migration. In additive migrations, the safest rollback is often leaving compatible additions in place unless there is a reviewed reason to drop them.
