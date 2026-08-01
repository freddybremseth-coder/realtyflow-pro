-- RealtyFlow Personal Knowledge & Profile Intelligence.
--
-- Additive extension for Social Intelligence. It stores uploaded knowledge as
-- reviewable user data, keeps source provenance, and blocks direct browser
-- table access so all workflow decisions stay mediated by server-side APIs.

create extension if not exists pgcrypto;

do $$
declare
  target_table text;
  marker text := 'RealtyFlow Personal Knowledge & Profile Intelligence v1';
begin
  foreach target_table in array array[
    'social_knowledge_sources',
    'social_knowledge_items',
    'social_profile_goals',
    'social_target_audiences',
    'social_profile_variants',
    'social_profile_suggestions',
    'social_profile_variant_versions'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null
       and coalesce(obj_description(format('public.%I', target_table)::regclass, 'pg_class'), '') <> marker then
      raise exception 'PERSONAL_KNOWLEDGE_SCHEMA_INCOMPATIBLE: public.% already exists without reviewed marker', target_table;
    end if;
  end loop;
end $$;

create table if not exists public.social_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  source_type text not null,
  source_name text not null,
  source_filename text,
  mime_type text,
  source_uri text,
  storage_path text,
  content_hash text not null,
  source_metadata_json jsonb not null default '{}'::jsonb,
  extracted_summary text,
  item_count integer not null default 0,
  status text not null default 'active',
  visibility text not null default 'internal',
  ai_use_allowed boolean not null default true,
  public_use_allowed boolean not null default false,
  imported_at timestamptz not null default now(),
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_knowledge_sources_user_email_check check (length(trim(user_email)) between 3 and 320),
  constraint social_knowledge_sources_type_check check (source_type in ('master_profile', 'uploaded_markdown', 'uploaded_text', 'manual_note', 'linkedin_profile', 'website', 'company_profile', 'crm_profile', 'other')),
  constraint social_knowledge_sources_status_check check (status in ('active', 'disabled', 'deleted')),
  constraint social_knowledge_sources_visibility_check check (visibility in ('private', 'internal', 'public_candidate', 'public_approved')),
  constraint social_knowledge_sources_hash_check check (content_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint social_knowledge_sources_item_count_check check (item_count >= 0),
  constraint social_knowledge_sources_user_hash_key unique (organization_id, user_email, content_hash)
);

create table if not exists public.social_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  source_id uuid references public.social_knowledge_sources(id) on delete cascade,
  source_type text not null,
  source_name text not null,
  source_ref text,
  source_excerpt text,
  category text not null,
  subcategory text,
  title text not null,
  content text not null,
  summary text,
  structured_data_json jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  visibility text not null default 'internal',
  verification_status text not null default 'needs_review',
  confidence numeric(4,3) not null default 0.550,
  relevance_score integer not null default 0,
  public_use_allowed boolean not null default false,
  sensitive boolean not null default false,
  allowed_profile_types text[] not null default '{}'::text[],
  platforms text[] not null default array['linkedin']::text[],
  fact_type text not null default 'document_derived',
  possible_duplicate_of uuid references public.social_knowledge_items(id) on delete set null,
  conflict_group text,
  conflict_reason text,
  review_notes text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_knowledge_items_type_check check (source_type in ('master_profile', 'uploaded_markdown', 'uploaded_text', 'manual_note', 'linkedin_profile', 'website', 'company_profile', 'crm_profile', 'other')),
  constraint social_knowledge_items_category_check check (category in ('identity', 'role', 'experience', 'company', 'service', 'expertise', 'education', 'achievement', 'market', 'location', 'publication', 'speaking', 'course', 'skill', 'value', 'story', 'audience', 'restriction', 'positioning', 'other')),
  constraint social_knowledge_items_visibility_check check (visibility in ('private', 'internal', 'public_candidate', 'public_approved')),
  constraint social_knowledge_items_status_check check (verification_status in ('needs_review', 'user_confirmed', 'document_verified', 'rejected', 'conflict', 'outdated', 'deleted')),
  constraint social_knowledge_items_confidence_check check (confidence between 0 and 1),
  constraint social_knowledge_items_relevance_check check (relevance_score between 0 and 100),
  constraint social_knowledge_items_fact_type_check check (fact_type in ('user_claim', 'document_derived', 'positioning_suggestion', 'restriction', 'third_party_reference'))
);

create table if not exists public.social_profile_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  name text not null,
  description text,
  primary_platform text not null default 'linkedin',
  profile_type text not null default 'linkedin',
  success_metrics text[] not null default '{}'::text[],
  priority integer not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profile_goals_platform_check check (primary_platform in ('linkedin', 'facebook', 'instagram', 'x', 'youtube', 'newsletter', 'blog', 'other')),
  constraint social_profile_goals_type_check check (profile_type in ('linkedin', 'website_bio', 'real_estate', 'ai_crm', 'author', 'speaker', 'consultant', 'company', 'general')),
  constraint social_profile_goals_priority_check check (priority between 1 and 5)
);

create table if not exists public.social_target_audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  name text not null,
  description text,
  markets text[] not null default '{}'::text[],
  needs text[] not null default '{}'::text[],
  objections text[] not null default '{}'::text[],
  languages text[] not null default array['no']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_profile_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  name text not null,
  profile_type text not null default 'linkedin',
  primary_platform text not null default 'linkedin',
  goal_id uuid references public.social_profile_goals(id) on delete set null,
  audience_id uuid references public.social_target_audiences(id) on delete set null,
  tone text[] not null default '{}'::text[],
  focus_tags text[] not null default '{}'::text[],
  instructions text,
  status text not null default 'draft',
  generated_profile_json jsonb not null default '{}'::jsonb,
  approved_profile_json jsonb not null default '{}'::jsonb,
  approved_suggestion_ids uuid[] not null default '{}'::uuid[],
  coverage_json jsonb not null default '{}'::jsonb,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profile_variants_type_check check (profile_type in ('linkedin', 'website_bio', 'real_estate', 'ai_crm', 'author', 'speaker', 'consultant', 'company', 'general')),
  constraint social_profile_variants_platform_check check (primary_platform in ('linkedin', 'facebook', 'instagram', 'x', 'youtube', 'newsletter', 'blog', 'other')),
  constraint social_profile_variants_status_check check (status in ('draft', 'generated', 'approved', 'archived'))
);

create table if not exists public.social_profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  variant_id uuid not null references public.social_profile_variants(id) on delete cascade,
  field_key text not null,
  label text not null,
  suggested_value_json jsonb not null,
  current_value_json jsonb,
  rationale text,
  confidence numeric(4,3) not null default 0.650,
  source_knowledge_ids uuid[] not null default '{}'::uuid[],
  source_summary_json jsonb not null default '[]'::jsonb,
  safety_warnings text[] not null default '{}'::text[],
  status text not null default 'draft',
  approved_value_json jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profile_suggestions_status_check check (status in ('draft', 'approved', 'rejected', 'archived')),
  constraint social_profile_suggestions_confidence_check check (confidence between 0 and 1)
);

create table if not exists public.social_profile_variant_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  variant_id uuid not null references public.social_profile_variants(id) on delete cascade,
  profile_json jsonb not null default '{}'::jsonb,
  approved_suggestion_ids uuid[] not null default '{}'::uuid[],
  source_knowledge_ids uuid[] not null default '{}'::uuid[],
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  constraint social_profile_variant_versions_created_by_check check (created_by in ('user', 'system', 'ai'))
);

create index if not exists idx_social_knowledge_sources_org_user_status
  on public.social_knowledge_sources (organization_id, user_email, status, imported_at desc);
create index if not exists idx_social_knowledge_items_org_user_status
  on public.social_knowledge_items (organization_id, user_email, verification_status, created_at desc);
create index if not exists idx_social_knowledge_items_source
  on public.social_knowledge_items (source_id, category);
create index if not exists idx_social_knowledge_items_category
  on public.social_knowledge_items (organization_id, user_email, category, public_use_allowed);
create index if not exists idx_social_knowledge_items_duplicate
  on public.social_knowledge_items (organization_id, user_email, possible_duplicate_of)
  where possible_duplicate_of is not null;
create index if not exists idx_social_knowledge_items_conflict
  on public.social_knowledge_items (organization_id, user_email, conflict_group)
  where conflict_group is not null;
create index if not exists idx_social_profile_goals_org_user
  on public.social_profile_goals (organization_id, user_email, is_active, priority);
create index if not exists idx_social_target_audiences_org_user
  on public.social_target_audiences (organization_id, user_email, is_active, created_at desc);
create index if not exists idx_social_profile_variants_org_user_status
  on public.social_profile_variants (organization_id, user_email, status, updated_at desc);
create index if not exists idx_social_profile_suggestions_variant_status
  on public.social_profile_suggestions (variant_id, status, created_at desc);
create index if not exists idx_social_profile_variant_versions_variant
  on public.social_profile_variant_versions (variant_id, created_at desc);

create or replace function public.set_social_intelligence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'social_knowledge_sources',
    'social_knowledge_items',
    'social_profile_goals',
    'social_target_audiences',
    'social_profile_variants',
    'social_profile_suggestions'
  ] loop
    if not exists (
      select 1
      from pg_trigger
      where tgrelid = format('public.%I', target_table)::regclass
        and tgname = format('trg_%s_updated_at', target_table)
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_social_intelligence_updated_at()',
        format('trg_%s_updated_at', target_table),
        target_table
      );
    end if;
  end loop;
end $$;

do $$
declare
  target_table text;
  policy_base text;
begin
  foreach target_table in array array[
    'social_knowledge_sources',
    'social_knowledge_items',
    'social_profile_goals',
    'social_target_audiences',
    'social_profile_variants',
    'social_profile_suggestions',
    'social_profile_variant_versions'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on public.%I from public, anon, authenticated', target_table);
    execute format('grant select, insert, update, delete on public.%I to service_role', target_table);

    policy_base := replace(target_table, 'social_', 'social_');

    execute format('drop policy if exists %I on public.%I', policy_base || '_service_select', target_table);
    execute format('create policy %I on public.%I for select to service_role using (true)', policy_base || '_service_select', target_table);

    execute format('drop policy if exists %I on public.%I', policy_base || '_service_insert', target_table);
    execute format('create policy %I on public.%I for insert to service_role with check (true)', policy_base || '_service_insert', target_table);

    execute format('drop policy if exists %I on public.%I', policy_base || '_service_update', target_table);
    execute format('create policy %I on public.%I for update to service_role using (true) with check (true)', policy_base || '_service_update', target_table);

    execute format('drop policy if exists %I on public.%I', policy_base || '_service_delete', target_table);
    execute format('create policy %I on public.%I for delete to service_role using (true)', policy_base || '_service_delete', target_table);

    execute format('drop policy if exists %I on public.%I', policy_base || '_deny_direct_browser_access', target_table);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      policy_base || '_deny_direct_browser_access',
      target_table
    );
  end loop;
end $$;

revoke execute on function public.set_social_intelligence_updated_at() from public;
revoke execute on function public.set_social_intelligence_updated_at() from anon;
revoke execute on function public.set_social_intelligence_updated_at() from authenticated;
grant execute on function public.set_social_intelligence_updated_at() to service_role;

comment on table public.social_knowledge_sources is 'RealtyFlow Personal Knowledge & Profile Intelligence v1';
comment on table public.social_knowledge_items is 'RealtyFlow Personal Knowledge & Profile Intelligence v1';
comment on table public.social_profile_goals is 'RealtyFlow Personal Knowledge & Profile Intelligence v1';
comment on table public.social_target_audiences is 'RealtyFlow Personal Knowledge & Profile Intelligence v1';
comment on table public.social_profile_variants is 'RealtyFlow Personal Knowledge & Profile Intelligence v1';
comment on table public.social_profile_suggestions is 'RealtyFlow Personal Knowledge & Profile Intelligence v1';
comment on table public.social_profile_variant_versions is 'RealtyFlow Personal Knowledge & Profile Intelligence v1';

notify pgrst, 'reload schema';
