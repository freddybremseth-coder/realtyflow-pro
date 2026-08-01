-- RealtyFlow Social Intelligence MVP.
--
-- Supabase CLI was not available in this workspace (local binary missing and
-- npx package had no darwin-arm64 binary), so this migration file was created
-- manually with a date-based name. It is additive and does not modify existing
-- CRM tables. Browser access stays mediated by server-side APIs.

create extension if not exists pgcrypto;

do $$
declare
  target_table text;
  marker text := 'RealtyFlow Social Intelligence MVP v1';
begin
  foreach target_table in array array[
    'social_brand_profiles',
    'social_profile_imports',
    'social_profile_sections',
    'social_profile_versions',
    'social_skills',
    'social_content_pillars',
    'social_content_ideas',
    'social_posts',
    'social_post_versions',
    'social_post_metrics',
    'social_ai_recommendations',
    'social_entity_links',
    'social_audit_events'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null
       and coalesce(obj_description(format('public.%I', target_table)::regclass, 'pg_class'), '') <> marker then
      raise exception 'SOCIAL_INTELLIGENCE_SCHEMA_INCOMPATIBLE: public.% already exists without reviewed MVP marker', target_table;
    end if;
  end loop;
end $$;

create table if not exists public.social_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null default 'realtyflow',
  user_email text not null,
  professional_name text,
  current_position text,
  primary_role text,
  secondary_roles text[] not null default '{}'::text[],
  company_name text,
  location text,
  markets text[] not null default '{}'::text[],
  geographic_areas text[] not null default '{}'::text[],
  industries text[] not null default '{}'::text[],
  target_audiences text[] not null default '{}'::text[],
  services text[] not null default '{}'::text[],
  expertise text[] not null default '{}'::text[],
  languages text[] not null default array['no']::text[],
  professional_values text[] not null default '{}'::text[],
  positioning_goal text,
  preferred_tones text[] not null default array['professional']::text[],
  business_goals text[] not null default '{}'::text[],
  excluded_topics text[] not null default '{}'::text[],
  publishing_frequency text,
  onboarding_step integer not null default 1,
  setup_completed boolean not null default false,
  analysis_consent boolean not null default true,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_brand_profiles_user_email_check check (length(trim(user_email)) between 3 and 320),
  constraint social_brand_profiles_onboarding_step_check check (onboarding_step between 1 and 6),
  constraint social_brand_profiles_org_user_key unique (organization_id, user_email)
);

create table if not exists public.social_profile_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  platform text not null default 'linkedin',
  import_type text not null,
  source_filename text,
  storage_path text,
  extracted_text text,
  reviewed_text text,
  content_hash text not null,
  status text not null default 'reviewed',
  analysis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profile_imports_platform_check check (platform in ('linkedin', 'facebook', 'instagram', 'x', 'youtube', 'website', 'other')),
  constraint social_profile_imports_type_check check (import_type in ('manual_text', 'text_file', 'pdf', 'exported_profile', 'manual_stats')),
  constraint social_profile_imports_status_check check (status in ('uploaded', 'extracted', 'reviewed', 'analyzed', 'deleted')),
  constraint social_profile_imports_hash_check check (content_hash ~ '^sha256:v1:[0-9a-f]{64}$')
);

create table if not exists public.social_profile_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  platform text not null default 'linkedin',
  section_type text not null,
  current_content text,
  optimized_content text,
  approved_content text,
  analysis_json jsonb not null default '{}'::jsonb,
  score integer,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profile_sections_platform_check check (platform in ('linkedin', 'facebook', 'instagram', 'x', 'youtube', 'website', 'other')),
  constraint social_profile_sections_type_check check (section_type in ('headline', 'about', 'experience', 'skills', 'services', 'featured', 'contact', 'positioning', 'profile_summary')),
  constraint social_profile_sections_score_check check (score is null or score between 0 and 100),
  constraint social_profile_sections_version_check check (version > 0),
  constraint social_profile_sections_active_key unique (organization_id, user_email, platform, section_type)
);

create table if not exists public.social_profile_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  section_id uuid not null references public.social_profile_sections(id) on delete cascade,
  content text not null,
  generated_by text not null default 'ai',
  prompt_version text,
  created_at timestamptz not null default now(),
  constraint social_profile_versions_generated_by_check check (generated_by in ('ai', 'manual', 'accepted_ai'))
);

create table if not exists public.social_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  skill_name text not null,
  category text not null,
  source text,
  relevance_score integer not null,
  is_verified boolean not null default false,
  priority integer not null default 3,
  status text not null default 'suggested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_skills_relevance_check check (relevance_score between 0 and 100),
  constraint social_skills_priority_check check (priority between 1 and 5),
  constraint social_skills_status_check check (status in ('suggested', 'accepted', 'removed'))
);

create table if not exists public.social_content_pillars (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  name text not null,
  description text,
  target_percentage integer not null default 20,
  target_audience text,
  business_goal text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_content_pillars_percentage_check check (target_percentage between 0 and 100)
);

create table if not exists public.social_content_ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  title text not null,
  hook text,
  angle text,
  description text,
  pillar_id uuid references public.social_content_pillars(id) on delete set null,
  target_audience text,
  goal text,
  platform text not null default 'linkedin',
  format text not null default 'linkedin_post',
  suggested_cta text,
  source_context_json jsonb not null default '{}'::jsonb,
  status text not null default 'idea',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_content_ideas_status_check check (status in ('idea', 'drafted', 'scheduled', 'used', 'archived')),
  constraint social_content_ideas_platform_check check (platform in ('linkedin', 'facebook', 'instagram', 'x', 'youtube', 'newsletter', 'blog', 'other'))
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  platform text not null default 'linkedin',
  title text,
  content text not null,
  language text not null default 'no',
  tone text[] not null default '{}'::text[],
  content_type text not null default 'linkedin_post',
  pillar_id uuid references public.social_content_pillars(id) on delete set null,
  goal text,
  target_audience text,
  hook_type text,
  cta_type text,
  quality_score integer,
  quality_analysis_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  campaign_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_platform_check check (platform in ('linkedin', 'facebook', 'instagram', 'x', 'youtube', 'newsletter', 'blog', 'other')),
  constraint social_posts_status_check check (status in ('idea', 'draft', 'review', 'approved', 'scheduled', 'published', 'archived')),
  constraint social_posts_quality_score_check check (quality_score is null or quality_score between 0 and 100)
);

create table if not exists public.social_post_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  post_id uuid not null references public.social_posts(id) on delete cascade,
  content text not null,
  generation_instruction text,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create table if not exists public.social_post_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  post_id uuid not null references public.social_posts(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  impressions integer not null default 0,
  reach integer not null default 0,
  reactions integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  clicks integer not null default 0,
  profile_views integer not null default 0,
  followers_gained integer not null default 0,
  messages integer not null default 0,
  leads integer not null default 0,
  meetings integer not null default 0,
  sales integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_post_metrics_nonnegative_check check (
    impressions >= 0 and reach >= 0 and reactions >= 0 and comments >= 0 and shares >= 0 and saves >= 0
    and clicks >= 0 and profile_views >= 0 and followers_gained >= 0 and messages >= 0 and leads >= 0
    and meetings >= 0 and sales >= 0
  )
);

create table if not exists public.social_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  category text not null,
  priority text not null,
  title text not null,
  description text not null,
  rationale text,
  evidence_json jsonb not null default '{}'::jsonb,
  action_type text,
  action_payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_ai_recommendations_priority_check check (priority in ('critical', 'high_impact', 'medium_impact', 'optional')),
  constraint social_ai_recommendations_status_check check (status in ('open', 'done', 'dismissed', 'expired'))
);

create table if not exists public.social_entity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  social_entity_type text not null,
  social_entity_id uuid not null,
  crm_entity_type text not null,
  crm_entity_id text not null,
  relationship_type text not null default 'attributed_to',
  created_at timestamptz not null default now(),
  constraint social_entity_links_social_type_check check (social_entity_type in ('profile', 'section', 'idea', 'post', 'metric', 'recommendation')),
  constraint social_entity_links_crm_type_check check (crm_entity_type in ('lead', 'contact', 'company', 'property', 'development', 'campaign', 'opportunity', 'sale')),
  constraint social_entity_links_unique_key unique (organization_id, social_entity_type, social_entity_id, crm_entity_type, crm_entity_id, relationship_type)
);

create table if not exists public.social_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  user_email text not null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_brand_profiles_org_user
  on public.social_brand_profiles (organization_id, user_email);
create index if not exists idx_social_imports_org_user_created
  on public.social_profile_imports (organization_id, user_email, created_at desc);
create index if not exists idx_social_sections_org_user
  on public.social_profile_sections (organization_id, user_email, platform, section_type);
create index if not exists idx_social_skills_org_user_status
  on public.social_skills (organization_id, user_email, status, priority);
create unique index if not exists social_skills_user_skill_key
  on public.social_skills (organization_id, user_email, lower(skill_name));
create index if not exists idx_social_pillars_org_user_active
  on public.social_content_pillars (organization_id, user_email, is_active);
create unique index if not exists social_content_pillars_user_name_key
  on public.social_content_pillars (organization_id, user_email, lower(name));
create index if not exists idx_social_ideas_org_user_status
  on public.social_content_ideas (organization_id, user_email, status, created_at desc);
create index if not exists idx_social_posts_org_user_status
  on public.social_posts (organization_id, user_email, status, created_at desc);
create index if not exists idx_social_posts_schedule
  on public.social_posts (organization_id, user_email, scheduled_at)
  where scheduled_at is not null;
create index if not exists idx_social_metrics_post_recorded
  on public.social_post_metrics (post_id, recorded_at desc);
create index if not exists idx_social_recommendations_org_user_status
  on public.social_ai_recommendations (organization_id, user_email, status, priority, created_at desc);
create index if not exists idx_social_entity_links_social
  on public.social_entity_links (organization_id, social_entity_type, social_entity_id);
create index if not exists idx_social_entity_links_crm
  on public.social_entity_links (organization_id, crm_entity_type, crm_entity_id);

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
    'social_brand_profiles',
    'social_profile_imports',
    'social_profile_sections',
    'social_skills',
    'social_content_pillars',
    'social_content_ideas',
    'social_posts',
    'social_post_metrics',
    'social_ai_recommendations'
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
    'social_brand_profiles',
    'social_profile_imports',
    'social_profile_sections',
    'social_profile_versions',
    'social_skills',
    'social_content_pillars',
    'social_content_ideas',
    'social_posts',
    'social_post_versions',
    'social_post_metrics',
    'social_ai_recommendations',
    'social_entity_links',
    'social_audit_events'
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

comment on table public.social_brand_profiles is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_profile_imports is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_profile_sections is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_profile_versions is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_skills is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_content_pillars is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_content_ideas is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_posts is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_post_versions is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_post_metrics is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_ai_recommendations is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_entity_links is 'RealtyFlow Social Intelligence MVP v1';
comment on table public.social_audit_events is 'RealtyFlow Social Intelligence MVP v1';

notify pgrst, 'reload schema';
