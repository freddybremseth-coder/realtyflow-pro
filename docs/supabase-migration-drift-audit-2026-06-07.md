# Supabase migration drift audit - 2026-06-07

Issue: [#20 Audit and prevent Supabase migration drift in production](https://github.com/freddybremseth-coder/realtyflow-pro/issues/20)

Project audited: `ereapsfcsqtdmzosgnnn` (`RealtyflowPRO`, Postgres 17.6, `eu-central-1`)

This was a read-only audit. No production data was changed, no migration was applied, and no old migration was run automatically.

## Method

- Compared `supabase/migrations/*.sql` in this repository with production catalog metadata from `information_schema`, `pg_class`, `pg_indexes`, `pg_constraint`, `pg_policies`, `storage.buckets`, and `supabase_migrations.schema_migrations`.
- Queried metadata only. Token values, song contents, image rows, and user rows were not selected.
- Checked Supabase changelog before the audit. The relevant operational note is that newer Supabase projects may not expose new public tables through the Data API automatically; future hotfixes must explicitly consider grants/RLS/Data API exposure instead of assuming table creation is enough.

## Executive summary

Production is usable for the current Re-Master flow: the critical Re-Master tables and columns now exist, including `public.user_image_bank`.

There is still material migration drift:

- Repository contains 54 migration files.
- Production migration history contains 14 matching repository migrations plus one production-only hotfix migration: `20260607100044_create_user_image_bank_for_remaster`.
- 40 repository migrations are not recorded in production migration history.
- Many objects from those unrecorded migrations exist anyway, which means they were created by direct SQL, legacy schema files, dashboard edits, or another nonstandard path.
- The migration history is therefore not authoritative and must not be "fixed" by blindly running every old migration.

Risk level for the migration drift itself: **critical**.

## Production migration history

Recorded in production:

- `003_email_automation`
- `004_content_publishing`
- `005_saas_module`
- `006_market_intelligence`
- `007_brand_settings`
- `008_persistence_and_crm`
- `009_growth_engine`
- `010_saas_opportunities`
- `011_property_scanner`
- `012_marketing_notifications`
- `013_scheduling_tables`
- `20260329062904_add_missing_scheduling_columns`
- `20260401180111_neural_beat_supabase`
- `20260402072254_command_conversations`
- `20260607100044_create_user_image_bank_for_remaster` (production-only hotfix; not present in repository)

Repository migrations not recorded in production:

- `012b_saas_build_queue.sql`
- `014_commission_tracking.sql`
- `015_chatbot_sessions.sql`
- `016_chatbot_messages.sql`
- `20260411_perplexity_insights.sql`
- `20260412_market_insights.sql`
- `20260418_user_image_bank.sql`
- `20260425_area_profiles_and_marketing_copy.sql`
- `20260425_property_floorplans_and_agent.sql`
- `20260429130000_area_profiles_website_visibility.sql`
- `20260429143000_portal_users.sql`
- `20260501090000_work_items_hub.sql`
- `20260501110000_scanner_portal_messages.sql`
- `20260501160000_ad_campaigns.sql`
- `20260501170000_ad_campaigns_aspect_ratios.sql`
- `20260502080000_plot_assets.sql`
- `20260505120000_work_items_publishing_sources.sql`
- `20260505123000_publishing_books.sql`
- `20260505130000_advisor_playbooks.sql`
- `20260505133000_kdp_report_imports.sql`
- `20260505134500_publishing_book_roles.sql`
- `20260505140000_seed_saas_app_links.sql`
- `20260506100000_business_financial_events.sql`
- `20260507135000_remaster_olivia_foundation.sql`
- `20260507143000_storage_thumbnails_archive.sql`
- `20260508131500_multitenant_foundation.sql`
- `20260508134500_tenant_brand_backfill.sql`
- `20260509120000_booking_attendance.sql`
- `20260510120000_documents_archive.sql`
- `20260510120000_social_oauth_multibrand.sql`
- `20260510130000_social_oauth_columns_repair.sql`
- `20260513205300_realty_brand_import_routing.sql`
- `20260519123000_automation_logs.sql`
- `20260519142000_publishing_book_engine.sql`
- `20260519150000_publishing_market_watch.sql`
- `20260519170000_publishing_book_projects_genre_series.sql`
- `20260521151000_move_olivia_tables_to_schema.sql`
- `20260531_data_health_olivia_family.sql`
- `20260531_safe_rls_skip_views.sql`
- `20260603120000_lead_nurture.sql`

Risk: **critical** for deployment governance, because a fresh environment built from production migration history would not match the current production schema.

## 1. Tables defined in migrations but missing in production

Only these repo-defined tables are physically missing from production:

| Table | Migration | Risk | Notes |
| --- | --- | --- | --- |
| `public.farm_settings` | `20260507135000_remaster_olivia_foundation.sql` | low | Olivia/farm data appears to have moved to the `olivia` schema. Not Re-Master critical. |
| `public.parcels` | `20260507135000_remaster_olivia_foundation.sql` | low | `olivia.parcels` exists. |
| `public.harvest_records` | `20260507135000_remaster_olivia_foundation.sql` | low | `olivia.harvest_records` exists. |
| `public.farm_expenses` | `20260507135000_remaster_olivia_foundation.sql` | low | `olivia.farm_expenses` exists. |
| `public.subsidy_income` | `20260507135000_remaster_olivia_foundation.sql` | low | `olivia.subsidy_income` exists. |

Recommendation: do not recreate these public tables unless a current route still reads them from `public`. The likely correct fix is documentation/migration-history reconciliation for the Olivia schema move.

## 2. Columns defined in migrations but missing in production

Re-Master critical columns are present for:

- `public.user_image_bank`
- `public.songs`
- `public.brand_settings`
- `public.growth_actions`
- `public.social_channels`
- `public.oauth_tokens`
- `public.oauth_states`
- `storage.buckets`
- `storage.objects`

`public.genre_images` exists and has the core fields used by current image lookup (`id`, `genre`, `image_url`, `created_at`), but it is missing migration-defined enrichment fields.

The following migration-defined columns are missing on related tables:

| Table | Missing columns | Migration | Risk | Notes |
| --- | --- | --- | --- | --- |
| `public.songs` | `archive_status`, `archive_destination`, `archived_at` | `20260507143000_storage_thumbnails_archive.sql` | medium | Not required by current video generation, but needed before song archive/delete UX relies on archive state. |
| `public.plot_assets` | `archive_status`, `archive_destination`, `archived_at` | `20260507143000_storage_thumbnails_archive.sql` | medium | Affects archive cleanup semantics for plot assets. |
| `public.ad_creatives` | `archive_status`, `archive_destination`, `archived_at` | `20260507143000_storage_thumbnails_archive.sql` | medium | Affects archive cleanup semantics for ad creatives. |
| `public.genre_images` | `prompt`, `usage_count` | `20260401180111_neural_beat_supabase.sql` | low | Useful for AI-image provenance and reuse analytics. Current Re-Master production flow is not blocked by their absence. |

Additional type/default drift to review before any future migration repair:

- `public.songs.steps` is `text[]` in production, while `20260507135000_remaster_olivia_foundation.sql` defines it as `jsonb default '[]'`.
- `public.songs.youtube_channel_id` is `uuid` with a foreign key to `youtube_channels(id)` in production, while the migration defines it as text.
- `public.growth_actions.status` has no visible check constraint in production even though the migration defines one.
- Several OAuth columns have nullable/default differences from the repo migration, but the required encrypted-token columns exist.

## 3. Missing indexes, constraints, and RLS policies

### Missing indexes

| Object | Expected | Production status | Risk |
| --- | --- | --- | --- |
| `public.growth_actions` | `idx_growth_actions_brand`, `idx_growth_actions_status`, `idx_growth_actions_type`, `idx_growth_actions_priority`, `idx_growth_actions_created` | Missing | medium |
| `public.brand_settings` | `idx_brand_settings_brand` | Missing, but `brand_settings_brand_id_key` unique index covers `brand_id` lookups | low |

For Re-Master duplicate protection specifically, consider adding a narrower index that the current code actually uses:

```sql
create index if not exists idx_growth_actions_remaster_fingerprint
  on public.growth_actions (brand, platform, hypothesis)
  where brand = 'remasterfreddy' and platform = 'youtube';
```

### Missing constraints

| Object | Expected | Production status | Risk |
| --- | --- | --- | --- |
| `public.growth_actions.status` | check in `('planned','ready','published','completed','failed')` | Missing | medium |

Before adding the check, validate existing values with:

```sql
select status, count(*)
from public.growth_actions
group by status
order by status;
```

### RLS and policies

RLS is enabled on the Re-Master critical tables.

Drift:

- `public.user_image_bank` has RLS enabled but no policy in production.
- Repo migration `20260418_user_image_bank.sql` creates `user_image_bank_service_all` with `USING (true)`.

Risk: **low** for current Re-Master because all image-bank access goes through server APIs with service role. This production shape is also safer than the repo's permissive policy. If direct browser access is introduced later, add explicit owner/admin policies instead of copying `USING (true)`.

Security advisor also reports RLS disabled on:

- `public.chatbot_sessions`
- `public.engagement_snapshots`
- `public.scheduling_insights`

Risk: **high** for general RealtyFlow security. Do not auto-enable RLS without adding matching policies, because that could break current routes.

## 4. Migrations that assume previous migrations already ran

These are the most important ordering hazards:

| Migration | Assumption | Risk |
| --- | --- | --- |
| `20260401180111_neural_beat_supabase.sql` | `public.songs` already exists, even though the repo migration that creates `songs` is dated later (`20260507135000_remaster_olivia_foundation.sql`). | high |
| `20260507143000_storage_thumbnails_archive.sql` | `user_image_bank`, `content_publications`, `plot_assets`, `ad_creatives`, and `songs` all exist. This caused the `user_image_bank` incident when the earlier table migration was absent. | critical |
| `20260501170000_ad_campaigns_aspect_ratios.sql` | `ad_campaigns` / `ad_creatives` already exist. | medium |
| `20260429130000_area_profiles_website_visibility.sql` | `area_profiles` already exists. | medium |
| `20260508134500_tenant_brand_backfill.sql` | `social_accounts`, `brand_settings`, `content_publications`, and `core.tenants` already exist. `social_accounts` is not created by any `supabase/migrations` file. | high |
| `20260510130000_social_oauth_columns_repair.sql` | The OAuth tables from `20260510120000_social_oauth_multibrand.sql` exist before indexes/triggers are created. | high |

Rule going forward: repair migrations should use `create table if not exists` before `alter table`, and `alter table if exists` only when absence is acceptable.

## 5. Production objects not represented by migration history

Production contains many base tables that are not represented by recorded migration history. Important examples:

- `public.user_image_bank` (exists due to production-only hotfix)
- `public.social_channels`, `public.oauth_tokens`, `public.oauth_states`
- `public.social_accounts` (legacy OAuth fallback used by code, not created in repo migrations)
- `public.pipeline_runs` (legacy/pipeline table, present in `src/lib/supabase/schema.sql`, not in `supabase/migrations`)
- `public.youtube_channels`, `public.youtube_videos`
- family/finance tables such as `public.assets`, `public.bank_accounts`, `public.transactions`
- many `family.*` and `olivia.*` tables that appear to come from later consolidation work

Risk: **high** for rebuilds and disaster recovery, because production cannot be reconstructed from migration history alone.

## 6. Risk matrix

| Difference | Risk |
| --- | --- |
| 40 repo migrations missing from production migration history | critical |
| Production-only hotfix migration not in repo | high |
| `20260507143000_storage_thumbnails_archive.sql` order hazard | critical |
| Current Re-Master critical columns missing | low; none found |
| Missing archive columns on `songs`, `plot_assets`, `ad_creatives` | medium |
| Missing enrichment columns on `genre_images` | low |
| Missing `thumbnails` storage bucket | low today, medium before thumbnail archive features rely on it |
| Missing `growth_actions` indexes and status check | medium |
| `user_image_bank` RLS policy drift | low for current server-only access |
| RLS disabled on non-Re-Master public tables | high |
| Production objects outside migration history | high |

## 7. Suggested idempotent hotfix migrations

Do not apply these during the audit PR. Use them as the basis for small follow-up PRs after review.

### A. Re-Master contract repair

Purpose: codify the production `user_image_bank` hotfix in repository migrations.

Shape:

```sql
create extension if not exists pgcrypto;

create table if not exists public.user_image_bank (
  id uuid primary key default gen_random_uuid(),
  owner text not null default 'system',
  url text not null,
  thumbnail_url text,
  name text,
  kind text not null default 'image',
  tags text[] not null default '{}',
  size_bytes bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0,
  archive_status text not null default 'active',
  archive_destination text,
  archived_at timestamptz
);

alter table public.user_image_bank add column if not exists thumbnail_url text;
alter table public.user_image_bank add column if not exists archive_status text not null default 'active';
alter table public.user_image_bank add column if not exists archive_destination text;
alter table public.user_image_bank add column if not exists archived_at timestamptz;

create index if not exists idx_user_image_bank_owner on public.user_image_bank(owner);
create index if not exists idx_user_image_bank_kind on public.user_image_bank(kind);
create index if not exists idx_user_image_bank_created_at on public.user_image_bank(created_at desc);
create index if not exists idx_user_image_bank_owner_kind_created
  on public.user_image_bank(owner, kind, created_at desc);

alter table public.user_image_bank enable row level security;
```

Policy decision: keep no browser policy while access is server-only, or add a narrow admin/service policy. Do not add broad `USING (true)` without review.

### B. Archive-column convergence

```sql
alter table if exists public.songs add column if not exists archive_status text default 'active';
alter table if exists public.songs add column if not exists archive_destination text;
alter table if exists public.songs add column if not exists archived_at timestamptz;

alter table if exists public.plot_assets add column if not exists archive_status text default 'active';
alter table if exists public.plot_assets add column if not exists archive_destination text;
alter table if exists public.plot_assets add column if not exists archived_at timestamptz;

alter table if exists public.ad_creatives add column if not exists archive_status text default 'active';
alter table if exists public.ad_creatives add column if not exists archive_destination text;
alter table if exists public.ad_creatives add column if not exists archived_at timestamptz;
```

### C. Storage thumbnail bucket convergence

```sql
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;
```

Before adding public listing policies, confirm whether object URLs are enough. Public buckets usually do not need broad `storage.objects` SELECT policies just for public object URL access.

### D. Growth action performance and status guard

```sql
create index if not exists idx_growth_actions_brand on public.growth_actions(brand);
create index if not exists idx_growth_actions_status on public.growth_actions(status);
create index if not exists idx_growth_actions_type on public.growth_actions(action_type);
create index if not exists idx_growth_actions_priority on public.growth_actions(priority desc);
create index if not exists idx_growth_actions_created on public.growth_actions(created_at desc);

create index if not exists idx_growth_actions_remaster_fingerprint
  on public.growth_actions (brand, platform, hypothesis)
  where brand = 'remasterfreddy' and platform = 'youtube';
```

For the status check, first audit existing statuses, then add the check in a guarded `do $$` block.

### E. Neural Beat image enrichment convergence

```sql
alter table if exists public.genre_images add column if not exists prompt text;
alter table if exists public.genre_images add column if not exists usage_count integer default 0;
```

## 8. Rollback plan

For the audit PR:

- No database rollback is required because it performs no production writes.
- Roll back by reverting the documentation/script PR.

For future additive hotfix migrations:

- Take a Supabase backup or point-in-time recovery marker before applying.
- Keep new columns nullable or defaulted; rollback by leaving unused columns in place unless a later reviewed migration drops them.
- Drop newly added indexes with `drop index concurrently if exists ...` if performance regresses.
- Do not delete a newly created storage bucket if any objects have been written to it.
- Do not repair `supabase_migrations.schema_migrations` by inserting rows until each migration has been proven equivalent to production. If a migration-history repair is made incorrectly, rollback requires removing only the mistaken history row and confirming no DDL depended on it.

## 9. Re-Master schema contract test

This PR adds:

- `scripts/check-remaster-schema-contract.mjs`
- `npm run schema:contract:remaster`
- `.github/workflows/remaster-schema-contract.yml`

The script is read-only and checks:

- required Re-Master tables and columns
- critical indexes for image bank, songs, and OAuth tables
- RLS enabled on critical tables
- required storage buckets: `assets`, `neural-beat`, `content-images`
- optional warnings for `thumbnails`, archive columns, and `genre_images` enrichment columns

It does not print credentials. It requires one of:

- `SUPABASE_DB_URL`
- `POSTGRES_URL`
- `DATABASE_URL`

CI skips the live contract if `SUPABASE_DB_URL` is not configured. To make it a blocking deployment control, add a GitHub secret named `SUPABASE_DB_URL` for a protected Supabase connection string.

Run locally:

```bash
SUPABASE_DB_URL="postgresql://..." npm run schema:contract:remaster
```

To make optional archive drift fail the check:

```bash
REMASTER_SCHEMA_STRICT_ARCHIVE=1 SUPABASE_DB_URL="postgresql://..." npm run schema:contract:remaster
```

## 10. Recommended next steps

1. Review this audit PR and merge it without database changes.
2. Decide whether `user_image_bank` should intentionally remain service-role-only with no RLS policy. That is the safest current shape.
3. Create a small additive hotfix PR for archive columns and `thumbnails` bucket only if those features are needed now.
4. Create a separate migration-history reconciliation plan. Do not mark all 40 missing migrations as applied until each has been compared to production.
5. Add `SUPABASE_DB_URL` as a GitHub secret so the contract test becomes a live deployment check.
6. Address high-risk general Supabase advisors separately, especially disabled RLS on `chatbot_sessions`, `engagement_snapshots`, and `scheduling_insights`.
