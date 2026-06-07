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

## Validation

Recommended validation before applying to production:

1. Run the migration against an empty local/test database.
2. Run the migration against a test database with a partial `public.user_image_bank` table.
3. Run the migration twice and verify it remains idempotent.
4. Run:

```bash
node --check scripts/check-remaster-schema-contract.mjs
npm run schema:contract:remaster
git diff --check
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

The live `schema:contract:remaster` check must use the dedicated read-only `remaster_schema_contract` database user through the protected `production-schema-audit` GitHub Environment.

## Rollback

If this migration has not been applied, rollback is a git revert.

If it has been applied to a database where `user_image_bank` existed before the migration, rollback should be conservative:

```sql
drop index if exists public.idx_user_image_bank_owner_kind_created;
drop index if exists public.idx_user_image_bank_created_at;
drop index if exists public.idx_user_image_bank_kind;
drop index if exists public.idx_user_image_bank_owner;
alter table if exists public.user_image_bank drop constraint if exists user_image_bank_kind_check;
alter table if exists public.user_image_bank drop constraint if exists user_image_bank_use_count_check;
```

Do not drop `public.user_image_bank` in production without explicit approval, because it may contain uploaded Re-Master assets.
