# Production RLS and Storage Recheck - 2026-06-09

Issue: [#36 Fresh production RLS and Storage recheck](https://github.com/freddybremseth-coder/realtyflow-pro/issues/36)

Project: `ereapsfcsqtdmzosgnnn`

Status: partial read-only recheck. No production data, schema, RLS policy, Storage bucket, Storage object, or migration-history entry was changed.

## Executive Summary

This recheck found confirmed live security drift and one important schema-placement change since the previous documentation audit:

- **critical:** Supabase catalog metadata reports RLS disabled on `public.engagement_snapshots`, `public.scheduling_insights`, and `public.chatbot_sessions`.
- **high:** Supabase Security Advisor reports multiple `SECURITY DEFINER` views in exposed schemas.
- **high:** Supabase Security Advisor reports broad `USING (true) WITH CHECK (true)` policies on multiple live tables. Exact full enumeration is blocked until a dedicated read-only SQL path is available.
- **high:** public Olivia/farm tables now exist again in `public` while corresponding tables also exist in `olivia`. This can split financial/farm data if application fallback writes or reads the wrong schema.
- **medium:** Re-Master critical tables are present and RLS-enabled, including `public.user_image_bank`, `public.remaster_pipeline_jobs`, and `public.remaster_pipeline_job_events`.
- **medium:** `public.songs.brand` still defaults to `neural-beat`; issue #35 should canonicalize new Re-Master writes to `remasterfreddy` without migrating existing rows.
- **blocked:** exact live `pg_policies`, `storage.objects` policies, bucket names/public flags, and `songs.brand` distribution require SQL. The only SQL path exposed in this session ran as `postgres`, so no further SQL was used to avoid relying on a broad credential.

## Method

Read-only sources used:

- Supabase MCP `list_tables` for `public`, `olivia`, and `storage` catalog metadata.
- Supabase MCP Security Advisor.
- Repository search for code usage and migration-policy patterns.

One SQL probe was attempted to confirm connection context:

```sql
select version(), current_database(), current_user, current_schema();
```

It returned `current_user = postgres`. Because issue #36 requires a safe read-only path and explicitly forbids using a broad credential as a shortcut, no further raw SQL was run in this task.

## Confirmed Live Table Status

### Re-Master Critical Tables

| Object | Live status | RLS | Rows | Risk | Notes |
| --- | --- | --- | ---: | --- | --- |
| `public.songs` | exists | enabled | 181 | high | Core Re-Master table. Verbose catalog metadata confirms `brand text default 'neural-beat'`, `steps text[]`, and `youtube_channel_id uuid`. |
| `public.genre_images` | exists | enabled | 80 | medium | Used by legacy Neural Beat image lookup. |
| `public.user_image_bank` | exists | enabled | 15 | medium | Advisor says RLS enabled with no policies, matching server/service-role-only design for current Re-Master. |
| `public.brand_settings` | exists | enabled | 1 | high | Stores brand settings and legacy YouTube/autopilot settings. |
| `public.growth_actions` | exists | enabled | 0 | medium | Used for recommendation history and duplicate protection. |
| `public.social_channels` | exists | enabled | 16 | high | OAuth channel metadata. Do not expose token values. |
| `public.oauth_tokens` | exists | enabled | 16 | critical | Token table exists; no token values were queried. |
| `public.oauth_states` | exists | enabled | 50 | high | OAuth state table exists; no state metadata was queried. |
| `public.remaster_pipeline_jobs` | exists | enabled | 1 | medium | Durable job core is active. Advisor notes RLS enabled with no policies, intended for server-only APIs. |
| `public.remaster_pipeline_job_events` | exists | enabled | 1 | medium | Durable job events are active. Advisor notes RLS enabled with no policies, intended for server-only APIs. |

### Olivia and Farm Tables

| Object | Live status | RLS | Rows | Risk | Notes |
| --- | --- | --- | ---: | --- | --- |
| `olivia.farm_settings` | exists | enabled | 1 | high | Intended target schema. |
| `olivia.parcels` | exists | enabled | 7 | high | Intended target schema. |
| `olivia.harvest_records` | exists | enabled | 7 | high | Intended target schema. |
| `olivia.farm_expenses` | exists | enabled | 3 | high | Intended target schema. |
| `olivia.subsidy_income` | exists | enabled | 0 | medium | Intended target schema. |
| `public.farm_settings` | exists | enabled | 1 | high | Differs from prior audit expectation. Public duplicate can confuse fallback code. |
| `public.parcels` | exists | enabled | 0 | high | Public duplicate can confuse fallback code. |
| `public.harvest_records` | exists | enabled | 0 | high | Public duplicate can confuse fallback code. |
| `public.farm_expenses` | exists | enabled | 0 | high | Public duplicate can confuse fallback code. |
| `public.subsidy_income` | exists | enabled | 0 | medium | Public duplicate can confuse fallback code. |

Additional Olivia/B2B tables confirmed live in `olivia` include:

- `batches`
- `recipes`
- `tasks`
- `commerce_products`
- `commerce_customers`
- `commerce_orders`
- `commerce_order_items`
- `commerce_invoices`
- `commerce_content_templates`
- `commerce_notifications`
- `olive_varieties`
- `harvest_plans`
- `production_sops`
- `farm_zones`
- `tree_groups`
- `sensor_devices`
- `sensor_readings`
- `sensor_alerts`
- `irrigation_events`
- `farm_observations`
- `farm_season_settings`
- `caecv_documents`
- `property_documents`

## Confirmed RLS Disabled Findings

Supabase catalog metadata/advisor reports RLS disabled on:

| Object | Rows | Risk | Recommended next step |
| --- | ---: | --- | --- |
| `public.engagement_snapshots` | 18 | critical | Audit code usage, then enable RLS with explicit policies in a dedicated PR. |
| `public.scheduling_insights` | 3 | critical | Audit code usage, then enable RLS with explicit policies in a dedicated PR. |
| `public.chatbot_sessions` | 0 | critical | Audit code usage, then enable RLS with explicit policies in a dedicated PR. |

Do not auto-run the Advisor remediation. Enabling RLS without matching policies may break current routes.

## Advisor Security Findings

Supabase Security Advisor reported:

### RLS enabled, no policies

Examples include:

- `public.user_image_bank`
- `public.remaster_pipeline_jobs`
- `public.remaster_pipeline_job_events`
- `public.area_profiles`
- several commerce, sensor, and farm-support tables

Risk depends on access model. For `user_image_bank` and Re-Master job tables, no policy is currently expected because all access should be mediated by server-side APIs/service-role operations. For broader app tables, each must be reviewed independently.

### SECURITY DEFINER views

Advisor reports `SECURITY DEFINER` views including:

- `public.family_economy_monthly`
- `public.brand_tenant_map`
- `public.family_economy_mondeo`
- `public.family_economy_olivia`
- `public.family_economy_realtyflow`
- `family.economy_monthly`

Risk: **high**. Views in exposed schemas can bypass RLS depending on definition and grants. Review whether they should use `security_invoker = true`, move to a private schema, or have access revoked.

### Broad always-true policies

Advisor reported `rls_policy_always_true` findings. Confirmed examples visible in this session include:

- `public.work_items`
- `public.youtube_channels`
- `public.youtube_videos`

Repository migrations also define many broad policies, including OAuth and growth tables. Exact live enumeration requires `pg_policies` SQL through a dedicated read-only connection.

Risk: **high** to **critical** depending on table sensitivity. OAuth-token tables must be treated as critical even if RLS is enabled.

### Public bucket listing

Advisor reported public buckets with broad object-listing policies:

- `ad-creatives`
- `olivia-field-observations`
- `plot-assets`

Risk: **medium** to **high**. Public object URLs may be intended, but broad listing policies can expose object inventory. Review bucket by bucket before changing policies.

## Storage Status

Confirmed from catalog metadata:

- `storage.buckets` exists, RLS enabled, 6 rows.
- `storage.objects` exists, RLS enabled, 509 rows.

Blocked pending safe SQL:

- exact bucket list
- `public` flag for `assets`
- `public` flag for `neural-beat`
- `public` flag for `content-images`
- `public` flag for `thumbnails`
- exact `storage.objects` policies and roles

Important: Re-Master currently uploads MP3/image assets through protected server routes and signed upload URLs. Do not make buckets private/public or alter `storage.objects` policies until code paths and URL assumptions are reviewed.

## `public.songs` Live Shape

Confirmed from Supabase catalog metadata:

- rows: 181
- RLS: enabled
- `brand text default 'neural-beat'`
- `artist text nullable`
- `steps text[]`
- `youtube_channel_id uuid`
- `youtube_video_id text`
- `thumbnail_url text`

Blocked pending safe SQL:

- actual brand distribution across `neural-beat`, `neuralbeat`, `remasterfreddy`, null, and other values
- exact defaults and constraints in a queryable report format

Risk: **high** because the default still points to the old brand. Issue #35 should update new write paths without rewriting existing rows.

## Code Usage Summary

| Object | Main code users | Notes |
| --- | --- | --- |
| `public.songs` | `src/services/integrations/airtable-client.ts`, `src/app/api/neural-beat/route.ts`, `src/app/api/neural-beat/cron/route.ts`, `src/app/api/neural-beat/thumbnail-rotate/route.ts`, `src/services/pipelines/neural-beat-pipeline.ts` | Core Re-Master song and pipeline state. |
| `public.user_image_bank` | `src/app/api/neural-beat/image-bank/route.ts`, `src/app/api/image-generate/route.ts`, `src/app/api/publishing/book-engine/route.ts`, `src/app/api/upload-image/route.ts` | Should remain server-mediated. |
| `public.brand_settings` | OAuth, website CMS, property PDF, autopilot/settings routes | Contains settings; may include sensitive legacy fields. |
| `public.social_channels`, `public.oauth_tokens`, `public.oauth_states` | OAuth routes and migration script | Must never be exposed through broad browser policies. |
| `public.growth_actions` | Growth APIs and Re-Master recommendations/autopilot | Used for history and duplicate protection. |
| `olivia.*` farm tables | `src/app/api/olivia/route.ts`, `src/app/api/business/overview/route.ts`, `src/app/api/business/finance/sync/route.ts`, `src/lib/business/data-health.ts` | Code uses schema fallback: configured schema, then `olivia`, then `public`. |
| Storage `assets` | `src/app/api/neural-beat/upload/route.ts` | Re-Master MP3/image upload path returns public object URLs. |
| Storage `neural-beat` | `src/services/pipelines/neural-beat-pipeline.ts` | Generated visual assets / thumbnails. |
| Storage `content-images` | `src/app/api/image-generate/route.ts`, `src/app/api/upload-image/route.ts`, website post upload | Generated and uploaded images. |

## Differences From `docs/remaster-olivia-foundation-schema-audit.md`

- Prior report described public farm tables as missing and expected to live only in `olivia`; live catalog now shows public farm tables exist again.
- Prior report said image bank was empty during early production fixes; live catalog shows `public.user_image_bank` has 15 rows.
- Durable Re-Master job core is now physically active with one audit job/event.
- The `public.songs.brand` default remains `neural-beat`, so canonical-brand work remains necessary.

## Recommended Hardening Plan

Do not harden everything at once.

1. Complete exact live SQL recheck using a dedicated read-only user or reauthenticated MCP path that does not run as `postgres`.
2. Address critical RLS-disabled tables one table per PR.
3. Audit public duplicate Olivia tables before any schema cleanup. Do not drop or merge data without explicit data review.
4. Fix new Re-Master song writes to `remasterfreddy` in issue #35.
5. Review OAuth tables and broad policies before any client access changes.
6. Review Storage bucket/public-listing behavior one bucket at a time.

## Rollback Posture

This PR is documentation-only. Rollback is a git revert.

Future hardening rollback must be one object at a time:

- RLS policy changes: restore previous policy only if code smoke tests fail and the previous policy is documented.
- Bucket policy changes: revert the specific bucket/object policy, not all Storage policies.
- Duplicate Olivia table cleanup: no drops until data equivalence is proved and backed up.
- Brand changes: do not rewrite existing `songs.brand` rows in the canonical-write PR.

## Required Follow-Up SQL After Safe Read-Only Access

Run these only through a dedicated read-only database user or approved read-only SQL path. Do not use a broad production credential as a shortcut.

```sql
select schemaname, tablename, rowsecurity, relforcerowsecurity
from pg_tables t
join pg_class c on c.relname = t.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
where schemaname in ('public', 'olivia')
order by schemaname, tablename;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'olivia', 'storage')
order by schemaname, tablename, policyname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (qual is not null and regexp_replace(lower(qual), '[() ]', '', 'g') = 'true')
   or (with_check is not null and regexp_replace(lower(with_check), '[() ]', '', 'g') = 'true')
order by schemaname, tablename, policyname;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('assets', 'neural-beat', 'content-images', 'thumbnails')
order by id;

select coalesce(brand, '<null>') as brand, count(*) as count
from public.songs
group by coalesce(brand, '<null>')
order by brand;

select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'songs'
order by ordinal_position;
```

## Current Status

Issue #36 should remain open until the blocked exact SQL evidence is captured through a safe read-only path and reviewed.
