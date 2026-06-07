# User image bank contract hotfix

Status: repository migration only. No production database change was applied from this branch.

## Production comparison

Read-only catalog checks against Supabase project `ereapsfcsqtdmzosgnnn` showed that `public.user_image_bank` already exists in production with:

- RLS enabled
- no open `USING (true)` image-bank policy
- columns required by Re-Master image, logo, and thumbnail uploads
- indexes on `owner`, `kind`, `created_at`, and `(owner, kind, created_at)`
- check constraints for valid `kind` values and non-negative `use_count`

The production table came from a production-only hotfix migration:

```text
20260607100044_create_user_image_bank_for_remaster
```

This branch codifies that contract in repository migrations without running old historical migrations.

## Migration shape

Migration:

```text
supabase/migrations/20260607145538_remaster_user_image_bank_contract.sql
```

The migration is additive and idempotent:

- `create table if not exists`
- `add column if not exists`
- guarded `not null` enforcement when existing rows allow it
- guarded primary-key creation when existing rows allow it
- `create index if not exists`
- check constraints added with `not valid`, then validated only when existing rows are compatible
- RLS enabled

The migration intentionally does not create the old permissive `user_image_bank_service_all` policy. Re-Master accesses the image bank through protected server APIs and the service role.

## Isolated migration test matrix

This PR extends the `Re-Master migration integration` workflow. The workflow uses an isolated PostgreSQL 17 service container, receives no production database secrets, and runs only explicit migration tests.

The `user-image-bank-contract` test covers:

| Scenario | Verification |
| --- | --- |
| Empty database | Creates the table, all columns, defaults, NOT NULL where safe, primary key, constraints, indexes, RLS, and no open policy. |
| Partial legacy table | Adds missing columns, preserves existing row data, and keeps compatible existing column types. |
| Production-like table | Completes without adding unexpected columns or changing the compatible production contract. |
| Idempotence | Applies the migration again against the same database and verifies the contract still holds. |
| Incompatible existing data | Keeps invalid existing rows, leaves check constraints `NOT VALID` when needed, skips unsafe PK/NOT NULL enforcement, and does not delete or rewrite data. |

Local usage requires a disposable local database:

```bash
MIGRATION_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/remaster_migration_test \
  npm run test:migrations -- user-image-bank-contract
```

Also run:

```bash
node --check scripts/check-remaster-schema-contract.mjs
git diff --check
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

The live `schema:contract:remaster` check must use the dedicated read-only `remaster_schema_contract` database user through the protected `production-schema-audit` GitHub Environment.

## Rollback

If this migration has not been applied, rollback is a git revert.

After the migration has been applied to an environment that already matched the production contract, normally no database rollback is needed.

Do not blindly drop indexes, constraints, columns, or policies as rollback. Those objects may have existed before this repository migration. Only remove an object if the deployment record proves this migration created it in that specific environment and removing it is approved.

Do not drop `public.user_image_bank` in production without explicit approval, because it may contain uploaded Re-Master assets.
