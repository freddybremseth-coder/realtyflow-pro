# Re-Master Freddy + Olivia Foundation Schema Audit

Date: 2026-06-08

Scope: read-only audit of the older SQL draft titled `Re-Master Freddy + Olivia minimum foundation`, repository migrations/schema files, code usage, and available production-schema evidence for Supabase project `ereapsfcsqtdmzosgnnn`.

No SQL was executed against production in this branch. No data, RLS state, Storage bucket, policy, table, column, or migration history was changed.

## Evidence And Limitation

This audit used:

- `supabase/migrations/20260507135000_remaster_olivia_foundation.sql`, which contains the old draft.
- all RealtyFlow `supabase/migrations/*.sql`
- `src/lib/supabase/schema.sql`
- current RealtyFlow code references under `src/`
- existing production drift documentation in `docs/supabase-migration-drift-audit-2026-06-07.md`
- `docs/user-image-bank-contract-hotfix.md`
- issue #30 production activation report for the later Re-Master durable job schema
- Supabase CLI project listing, confirming project `ereapsfcsqtdmzosgnnn` is `RealtyflowPRO`

Live Supabase MCP read-only catalog calls could not be re-run in this session because the connector returned `token_expired`, and no read-only `SUPABASE_DB_URL`/`POSTGRES_URL`/`DATABASE_URL` was present locally. Treat the production findings below as based on the previously completed read-only production audit from 2026-06-07/2026-06-08, not as a freshly re-run catalog snapshot.

Before any schema change, re-run the appendix queries using the dedicated read-only schema contract user or Supabase SQL Editor.

## The Old Draft

The draft is present in the repository as:

```text
supabase/migrations/20260507135000_remaster_olivia_foundation.sql
```

It creates:

- `public.songs`
- `public.farm_settings`
- `public.parcels`
- `public.harvest_records`
- `public.farm_expenses`
- `public.subsidy_income`
- public Storage buckets `assets` and `neural-beat`
- RLS on all six tables
- broad policies named `Allow all on <table>` with `FOR ALL USING (true) WITH CHECK (true)`

Important draft defaults:

- `songs.artist default 'Re-Master Freddy'`
- `songs.brand default 'neural-beat'`
- `songs.steps jsonb default '[]'`
- `songs.youtube_channel_id text`

## Production Objects From Prior Read-Only Audit

These were documented in the 2026-06-07 production drift audit for project `ereapsfcsqtdmzosgnnn`.

| Object | Production status | Risk | Notes |
| --- | --- | --- | --- |
| `public.songs` | Exists | high | Core Re-Master table. Critical columns exist, but type/default drift exists versus the old draft. |
| `public.genre_images` | Exists | medium | Core fields exist. Prior audit noted missing enrichment fields `prompt` and `usage_count`. |
| `public.user_image_bank` | Exists | medium | Exists via production-only hotfix and repo contract migration. RLS enabled, no broad production image-bank policy per prior audit. |
| `public.farm_settings` | Missing | low | Expected to have been moved to `olivia.farm_settings`. Do not recreate in `public` without a current code need. |
| `public.parcels` | Missing | low | Expected to have been moved to `olivia.parcels`. |
| `public.harvest_records` | Missing | low | Expected to have been moved to `olivia.harvest_records`. |
| `public.farm_expenses` | Missing | low | Expected to have been moved to `olivia.farm_expenses`. |
| `public.subsidy_income` | Missing | low | Expected to have been moved to `olivia.subsidy_income`. |
| `olivia.farm_settings` | Exists per prior audit | high | Correct target schema for Olivia farm configuration. |
| `olivia.parcels` | Exists per prior audit | high | Correct target schema for farm parcel data. |
| `olivia.harvest_records` | Exists per prior audit | high | Correct target schema for harvest/production data. |
| `olivia.farm_expenses` | Exists per prior audit | high | Correct target schema for farm costs. |
| `olivia.subsidy_income` | Exists per prior audit | high | Correct target schema for subsidy income. |
| `storage.buckets.assets` | Exists per Re-Master schema contract requirement | high | Used by Re-Master MP3/image upload and other media flows. Public/private status must be rechecked live. |
| `storage.buckets.neural-beat` | Exists per Re-Master schema contract requirement | medium | Used by generated Neural Beat images and thumbnail variants. Public/private status must be rechecked live. |
| `storage.buckets.content-images` | Exists per Re-Master schema contract requirement | medium | Used by image generation/book engine/upload-image flows. |
| `storage.buckets.thumbnails` | Missing in prior drift audit | low now, medium later | Only needed before archive/thumbnail preview features rely on it. |

## Repository-Only Or Schema-File Objects

| Object | Where defined | Production interpretation | Risk |
| --- | --- | --- | --- |
| `public.farm_settings`, `public.parcels`, `public.harvest_records`, `public.farm_expenses`, `public.subsidy_income` | `20260507135000_remaster_olivia_foundation.sql` | Old public placement. Later migration moves to `olivia`. | medium if recreated in `public`; it would fork data. |
| `olivia.batches`, `olivia.commerce_*` | `20260531_data_health_olivia_family.sql` | Expected by Data Health / Olivia B2B modules. Current live status must be rechecked. | medium |
| legacy full-access policies in `src/lib/supabase/schema.sql` | schema snapshot file | Not authoritative for current production migrations. | high if copied into production. |
| `public.pipeline_runs` | `src/lib/supabase/schema.sql` | Legacy pipeline table, not used for new durable Re-Master job core. | low |

## Objects Only In The Old Draft

No table name is unique to the old draft; the risk is the draft's placement and policies:

- farm tables are created in `public`, but the architectural target is `olivia`
- `songs.brand` defaults to `neural-beat`
- broad `FOR ALL USING (true) WITH CHECK (true)` policies are created without a role restriction
- buckets are created as public by default

## Table And Column Comparison

### `public.songs`

Old draft columns:

```text
id uuid pk, name text not null, artist text, genre text, mood text, bpm integer,
duration integer, file_url text, status text, youtube_url text,
youtube_channel_id text, brand text default 'neural-beat',
tags text[] default '{}', steps jsonb default '[]', airtable_id text,
created_at timestamptz, updated_at timestamptz
```

Additional repository migration columns:

```text
style, energy, visual_style, image_url, ai_metadata, error_message,
youtube_video_id, thumbnail_url
```

Prior production audit found:

- Re-Master critical columns exist.
- `steps` is `text[]` in production, while the old draft defines `jsonb`.
- `youtube_channel_id` is `uuid` with a foreign key to `youtube_channels(id)` in production, while the old draft defines `text`.
- `archive_status`, `archive_destination`, and `archived_at` were missing from production at the time of the previous drift audit.

Risk: **high**. Do not run the old draft against production. It encodes stale types/defaults and may mask real schema drift.

### Olivia Farm Tables

Old draft defines these in `public`:

- `farm_settings`
- `parcels`
- `harvest_records`
- `farm_expenses`
- `subsidy_income`

`20260521151000_move_olivia_tables_to_schema.sql` moves them to `olivia`.

Current code checks `OLIVIA_SCHEMA`, then `olivia`, then `public`. This is a migration bridge, not a reason to keep two copies.

Risk: **high** if public tables are recreated after `olivia` tables exist. That would split financial and farm records.

### `public.user_image_bank`

Old migration `20260418_user_image_bank.sql` creates:

- `id`, `owner`, `url`, `name`, `kind`, `tags`, `size_bytes`, `width`, `height`, `created_at`, `last_used_at`, `use_count`
- broad `user_image_bank_service_all` policy with `USING (true) WITH CHECK (true)`

Repository contract migration `20260607145538_remaster_user_image_bank_contract.sql` extends/codifies:

- `thumbnail_url`
- `archive_status`
- `archive_destination`
- `archived_at`
- indexes on owner/kind/created_at/(owner,kind,created_at)
- `kind` check including `image`, `logo`, `thumbnail`, `product`, `variant`
- `use_count >= 0`
- RLS enabled
- no broad policy

Prior production audit: production already matches the safer contract and did not have the old broad image-bank policy.

Risk: **medium**. Keep using the contract migration; do not revive the old policy.

## Code Usage Per Table

| Table | Code paths | Access model | Notes |
| --- | --- | --- | --- |
| `public.songs` | `src/services/integrations/airtable-client.ts`, `src/app/api/neural-beat/route.ts`, `src/app/api/neural-beat/cron/route.ts`, `src/app/api/neural-beat/thumbnail-rotate/route.ts`, `src/services/pipelines/neural-beat-pipeline.ts`, `src/services/integrations/publish-time-picker.ts`, `src/services/storage/google-drive-archive.ts` | server-side Supabase client, usually service role fallback | Core live Re-Master table. |
| `public.genre_images` | `src/services/integrations/airtable-client.ts`, `src/services/pipelines/neural-beat-pipeline.ts` | server-side Supabase client | AI/generated/curated image lookup. Old policies allow public insert/delete in repo migration. |
| `public.user_image_bank` | `src/app/api/neural-beat/image-bank/route.ts`, `src/app/api/image-generate/route.ts`, `src/app/api/publishing/book-engine/route.ts`, `src/app/api/upload-image/route.ts`, `src/services/storage/google-drive-archive.ts` | protected server routes/service role; some generic image APIs also write | Should remain server-mediated until owner/admin policies are designed. |
| `olivia.farm_settings` | `src/app/api/business/overview/route.ts`, `src/lib/business/data-health.ts` | server-side; schema fallback | Farm metadata/config. |
| `olivia.parcels` | `src/app/api/business/overview/route.ts`, `src/lib/business/data-health.ts` | server-side; schema fallback | Parcel/tree counts. |
| `olivia.harvest_records` | `src/app/api/business/overview/route.ts`, `src/app/api/business/finance/sync/route.ts`, `src/lib/business/data-health.ts` | server-side; schema fallback | Revenue/harvest data. |
| `olivia.farm_expenses` | `src/app/api/business/overview/route.ts`, `src/app/api/business/finance/sync/route.ts`, `src/lib/business/data-health.ts` | server-side; schema fallback | Farm cost data. |
| `olivia.subsidy_income` | `src/app/api/business/overview/route.ts`, `src/app/api/business/finance/sync/route.ts`, `src/lib/business/data-health.ts` | server-side; schema fallback | Subsidy/income data. |

## Brand And Legacy Identifier Findings

The system currently uses multiple identifiers for Re-Master/Neural Beat:

| Identifier | Where found | Risk |
| --- | --- | --- |
| `neural-beat` | old draft `songs.brand default`, `createSong()` inserts new songs with `brand: 'neural-beat'`, pipeline type/storage paths | high |
| `neuralbeat` | `BRANDS` constant, YouTube analytics/bulk update, OAuth alias support | medium |
| `remasterfreddy` | new job API/core, recommendation safety, action history, YouTube health, current pipeline upload brand | canonical target |

Critical code finding:

```text
src/services/integrations/airtable-client.ts
```

`createSong()` still writes new rows as:

```text
artist: 'Neural Beat'
brand: 'neural-beat'
```

Risk: **high**. This conflicts with the architecture rule that new data should be written primarily as `remasterfreddy`, while legacy `neuralbeat`/`neural-beat` remains read-compatible.

Recommended next code fix, separate from this audit:

- change new song writes to `brand: 'remasterfreddy'`
- keep read paths compatible with `neural-beat` and `neuralbeat`
- run live brand distribution query before any data migration:

```sql
select coalesce(brand, '<null>') as brand, count(*)
from public.songs
group by 1
order by 2 desc, 1;
```

## Storage Findings

| Bucket | Defined/used by | Current concern | Risk |
| --- | --- | --- | --- |
| `assets` | old draft, `/api/neural-beat/upload`, publisher media flows | Re-Master MP3 upload creates signed upload URL into `assets/neural-beat/...` then returns a public object URL. Public/private status must be rechecked live. | high for source MP3 privacy |
| `neural-beat` | old draft, `NeuralBeatPipeline.uploadToSupabaseStorage()` | Generated AI images and thumbnail variants are uploaded and public URLs returned. | medium |
| `content-images` | image generation, book engine, upload-image | Used for generated/content images. | medium |
| `thumbnails` | archive migration, `src/services/storage/media.ts` | Prior audit found missing. Only needed for thumbnail archive/preview features. | low now |

No broad `storage.objects` policy for `assets` or `neural-beat` was found in repository migrations, but the old draft creates both buckets with `public = true`. Public buckets allow public object URLs, which may be acceptable for published images but is risky for raw MP3s/source assets.

Storage risk: **high** for source audio and any private campaign/farm/brand assets. Future work should classify each bucket/path by data sensitivity and move private source files to private buckets or signed URL flows.

## Security Findings

### Critical: old draft broad policies

The old draft creates broad `FOR ALL USING (true) WITH CHECK (true)` policies for:

- `public.songs`
- `public.farm_settings`
- `public.parcels`
- `public.harvest_records`
- `public.farm_expenses`
- `public.subsidy_income`

Because no `TO <role>` is specified, PostgreSQL treats the policy as applying to `PUBLIC`. In a Supabase exposed schema, that can become full table access for roles that have table privileges.

Priority: **critical**. Never run this draft as-is.

### High: Olivia/family authenticated full CRUD policy pattern

`20260531_safe_rls_skip_views.sql` creates:

```sql
CREATE POLICY authenticated_all_<table>
ON olivia.<table>
FOR ALL TO authenticated
USING (true)
WITH CHECK (true)
```

This is safer than anonymous public access but still too broad for financial/farm data if any authenticated browser user can reach it.

Priority: **high**. Browser clients should not get full CRUD on Olivia economics/farm data. Prefer server-only routes, narrow admin roles, or explicit owner/tenant policies.

### High: repo contains many broad legacy policies

Repository migrations/schema files include many open policy patterns such as:

- `brand_settings`
- `growth_actions`
- `business_financial_events`
- `automation_logs`
- `market_insights`
- `content_publications`
- `publishing_books`
- `work_items`
- `portal_messages`
- `genre_images` insert/delete
- older schema snapshot policies for many base CRM tables

Priority: **high** for a broader RealtyFlow RLS hardening phase. Do not mix that cleanup into this foundation audit PR.

### Medium: `user_image_bank` old policy drift

Old repo migration creates `user_image_bank_service_all` with broad access; production hotfix/contract intentionally does not.

Priority: **medium**. Keep the safer production shape. If direct browser image-bank access is needed later, add narrow owner/admin policies.

## Recommended Target Schema

### Public schema

Keep in `public`:

- `songs`
- `genre_images`
- `user_image_bank`
- Re-Master durable job tables already activated:
  - `remaster_pipeline_jobs`
  - `remaster_pipeline_job_events`
- shared system tables:
  - `brand_settings`
  - `social_channels`
  - `oauth_tokens`
  - `oauth_states`
  - `growth_actions`

Rules:

- new Re-Master rows should write canonical `brand = 'remasterfreddy'`
- read paths should support `neural-beat` and `neuralbeat` during migration
- no broad anonymous/full CRUD policies
- service-role/server APIs remain the write path for admin operations

### Olivia schema

Keep Olivia/farm data in `olivia`:

- `farm_settings`
- `parcels`
- `harvest_records`
- `farm_expenses`
- `subsidy_income`
- `batches`
- `commerce_products`
- `commerce_customers`
- `commerce_orders`
- `commerce_order_items`
- `commerce_invoices`

Rules:

- do not recreate public copies
- keep public fallback reads only temporarily
- browser clients should not have full CRUD over farm financial data
- if PostgREST exposure is needed, use narrow read/write policies and role checks

## Future Additive Migration Ideas

Do not implement these in this audit PR.

| Priority | Proposal | Notes |
| --- | --- | --- |
| critical | Do not run `20260507135000_remaster_olivia_foundation.sql` as-is | Replace with documented target-schema migrations only. |
| high | Code fix: `createSong()` should write `brand = 'remasterfreddy'` | Preserve read compatibility for legacy variants. |
| high | Add a brand compatibility view/helper or query convention | Avoid losing legacy `neural-beat` and `neuralbeat` songs during transition. |
| high | Olivia RLS redesign | Replace broad authenticated full CRUD with server-mediated or role-specific policies. |
| medium | Storage classification migration/ops plan | Decide which buckets/paths are public, private, or signed-URL only. |
| medium | Song archive columns | Add only if song archive/delete UI depends on them. Prior audit found them missing. |
| medium | `genre_images` enrichment columns | Add `prompt`/`usage_count` only if image provenance/reuse analytics are needed. |
| low | Remove public Olivia fallback after production is verified | Only after all callers consistently resolve `olivia`. |

## Data And Rollback Risk

- Do not drop or recreate farm tables; if both `public` and `olivia` copies exist in any environment, run a read-only row-count and FK audit first.
- Do not update existing `songs.brand` values until code is canonicalized and all consumers read legacy variants.
- Do not change bucket privacy without checking every stored URL that may already be embedded in songs, image bank rows, or published content.
- Rollback for this documentation PR is a git revert only.
- Rollback for future additive migrations should normally leave compatible additions in place unless a reviewed reason exists to remove them.

## Required Live Recheck Queries

Run these read-only before any future schema work. Do not select token ciphertext, OAuth token values, MP3 URLs, or application row payloads unless explicitly needed.

```sql
select
  table_schema,
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema in ('public', 'olivia', 'storage')
  and table_name in (
    'songs',
    'genre_images',
    'user_image_bank',
    'farm_settings',
    'parcels',
    'harvest_records',
    'farm_expenses',
    'subsidy_income',
    'buckets',
    'objects'
  )
order by table_schema, table_name, ordinal_position;
```

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname in ('public', 'olivia', 'storage')
  and tablename in (
    'songs',
    'genre_images',
    'user_image_bank',
    'farm_settings',
    'parcels',
    'harvest_records',
    'farm_expenses',
    'subsidy_income',
    'buckets',
    'objects'
  )
order by schemaname, tablename;
```

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'olivia', 'storage')
  and (
    qual = 'true'
    or with_check = 'true'
    or qual ilike '%true%'
    or with_check ilike '%true%'
  )
order by schemaname, tablename, policyname;
```

```sql
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname in ('public', 'olivia')
  and tablename in (
    'songs',
    'genre_images',
    'user_image_bank',
    'farm_settings',
    'parcels',
    'harvest_records',
    'farm_expenses',
    'subsidy_income'
  )
order by schemaname, tablename, indexname;
```

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'olivia')
  and c.relname in (
    'songs',
    'genre_images',
    'user_image_bank',
    'farm_settings',
    'parcels',
    'harvest_records',
    'farm_expenses',
    'subsidy_income'
  )
order by n.nspname, c.relname, con.conname;
```

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('assets', 'neural-beat', 'content-images', 'thumbnails')
order by id;
```

```sql
select coalesce(brand, '<null>') as brand, count(*)
from public.songs
group by 1
order by 2 desc, 1;
```

## Gate

This audit does not approve any schema change. Review should decide:

1. whether to re-run the live catalog queries with a refreshed Supabase connector/read-only DB user
2. whether to prioritize the `createSong()` canonical brand fix
3. whether Olivia RLS/storage hardening should become the next database-focused PR
