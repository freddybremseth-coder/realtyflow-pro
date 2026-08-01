-- AI Media Studio core schema.
--
-- Additive foundation for task-based media generation. The app accesses these
-- tables through authenticated server APIs; RLS also supports future direct
-- Supabase-auth tenant access via core.is_tenant_member.

insert into core.tenants (slug, name, status, plan, metadata)
values ('realtyflow', 'RealtyFlow', 'active', 'pro', '{"source":"ai_media_studio_migration"}'::jsonb)
on conflict (slug) do nothing;

create or replace function public.media_studio_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.media_studio_can_access(target_organization uuid)
returns boolean
language sql
stable
as $$
  select
    auth.role() = 'service_role'
    or (
      target_organization is not null
      and core.is_tenant_member(target_organization)
    );
$$;

create table if not exists public.media_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  project_type text not null default 'general',
  brand_id text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'active', 'review', 'completed', 'archived')),
  target_platforms text[] not null default '{}',
  target_audience text,
  deadline date,
  cover_asset_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.tenants(id) on delete cascade,
  brand_id text not null,
  name text not null,
  logo_url text,
  colors text[] not null default '{}',
  typography text,
  audience text,
  tone text,
  visual_style text,
  preferred_environments text[] not null default '{}',
  preferred_lighting text,
  products text[] not null default '{}',
  geographies text[] not null default '{}',
  keywords text[] not null default '{}',
  forbidden_terms text[] not null default '{}',
  forbidden_visuals text[] not null default '{}',
  text_rules text,
  logo_rules text,
  legal_notes text,
  reference_image_urls text[] not null default '{}',
  default_formats text[] not null default '{}',
  default_provider text,
  default_quality_tier text not null default 'balanced' check (default_quality_tier in ('fast', 'balanced', 'premium')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, brand_id)
);

create table if not exists public.media_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.tenants(id) on delete cascade,
  name text not null,
  category text not null,
  media_type text not null check (media_type in ('image', 'video', 'avatar', 'voice', 'audio')),
  default_prompt_blocks jsonb not null default '{}'::jsonb,
  default_aspect_ratio text,
  default_quality_tier text not null default 'balanced' check (default_quality_tier in ('fast', 'balanced', 'premium')),
  default_provider_preference text,
  required_inputs text[] not null default '{}',
  optional_inputs text[] not null default '{}',
  preview_image_url text,
  is_system boolean not null default false,
  active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, name)
);

create table if not exists public.media_provider_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.tenants(id) on delete cascade,
  provider text not null,
  display_name text,
  status text not null default 'unknown' check (status in ('available', 'not_connected', 'degraded', 'unavailable', 'unknown')),
  capabilities_json jsonb not null default '{}'::jsonb,
  tools_json jsonb not null default '[]'::jsonb,
  account_json jsonb not null default '{}'::jsonb,
  error_message text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.media_prompt_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.media_projects(id) on delete set null,
  brand_id text,
  original_request text not null,
  plan_json jsonb not null,
  optimized_prompt text not null,
  negative_prompt text,
  media_type text not null check (media_type in ('image', 'video', 'avatar', 'voice', 'audio')),
  operation text not null,
  provider text,
  model text,
  aspect_ratio text,
  duration_seconds integer,
  resolution text,
  quality_tier text not null check (quality_tier in ('fast', 'balanced', 'premium')),
  estimated_cost_tier text not null default 'medium' check (estimated_cost_tier in ('low', 'medium', 'high', 'premium')),
  prompt_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.media_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.media_projects(id) on delete set null,
  prompt_plan_id uuid references public.media_prompt_plans(id) on delete set null,
  brand_id text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  provider text not null,
  provider_job_id text,
  media_type text not null check (media_type in ('image', 'video', 'avatar', 'voice', 'audio')),
  operation text not null,
  status text not null default 'draft' check (status in ('draft', 'queued', 'submitted', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
  original_request text not null,
  prompt_plan_json jsonb not null default '{}'::jsonb,
  final_prompt text not null,
  negative_prompt text,
  model text,
  aspect_ratio text,
  resolution text,
  duration_seconds integer,
  quality_tier text not null default 'balanced' check (quality_tier in ('fast', 'balanced', 'premium')),
  estimated_cost text,
  actual_cost numeric(12,4),
  currency text,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  input_assets_json jsonb not null default '[]'::jsonb,
  result_assets_json jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  retry_count integer not null default 0,
  idempotency_key text,
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.media_projects(id) on delete set null,
  brand_id text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  job_id uuid references public.media_generation_jobs(id) on delete set null,
  prompt_plan_id uuid references public.media_prompt_plans(id) on delete set null,
  media_type text not null check (media_type in ('image', 'video', 'avatar', 'voice', 'audio')),
  asset_type text not null default 'generated',
  title text,
  description text,
  storage_bucket text,
  storage_path text,
  public_url text,
  signed_url_required boolean not null default false,
  thumbnail_url text,
  mime_type text,
  width integer,
  height integer,
  duration_seconds integer,
  file_size bigint,
  provider text,
  model text,
  prompt text,
  negative_prompt text,
  aspect_ratio text,
  resolution text,
  ai_generated boolean not null default true,
  ai_edited boolean not null default false,
  source_asset_ids uuid[] not null default '{}',
  metadata_json jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  status text not null default 'active' check (status in ('active', 'review', 'archived', 'deleted', 'failed')),
  content_hub_publication_id uuid references public.content_publications(id) on delete set null,
  exported_to_content_hub_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.media_projects
  add constraint media_projects_cover_asset_id_fkey
  foreign key (cover_asset_id) references public.media_assets(id) on delete set null;

create table if not exists public.media_asset_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.tenants(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  entity_type text not null check (entity_type in ('property', 'development', 'lead', 'contact', 'campaign', 'ad_campaign', 'social_post', 'content_hub_draft', 'book', 'product', 'project')),
  entity_id text not null,
  relationship_type text not null default 'related',
  created_at timestamptz not null default now(),
  unique (asset_id, entity_type, entity_id, relationship_type)
);

create table if not exists public.media_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  provider text,
  media_type text,
  job_id uuid references public.media_generation_jobs(id) on delete set null,
  asset_id uuid references public.media_assets(id) on delete set null,
  prompt_plan_id uuid references public.media_prompt_plans(id) on delete set null,
  cost_tier text,
  actual_cost numeric(12,4),
  currency text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_media_projects_org_status on public.media_projects(organization_id, status, updated_at desc);
create index if not exists idx_media_projects_brand on public.media_projects(organization_id, brand_id);
create index if not exists idx_media_brand_profiles_org_brand on public.media_brand_profiles(organization_id, brand_id);
create index if not exists idx_media_templates_category on public.media_templates(category, active);
create index if not exists idx_media_capabilities_provider on public.media_provider_capabilities(provider, updated_at desc);
create index if not exists idx_media_prompt_plans_hash on public.media_prompt_plans(organization_id, prompt_hash, created_at desc);
create index if not exists idx_media_jobs_org_status on public.media_generation_jobs(organization_id, status, updated_at desc);
create index if not exists idx_media_jobs_provider_job on public.media_generation_jobs(provider, provider_job_id);
create unique index if not exists uq_media_jobs_idempotency
  on public.media_generation_jobs(organization_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_media_assets_org_created on public.media_assets(organization_id, created_at desc);
create index if not exists idx_media_assets_filters on public.media_assets(organization_id, media_type, brand_id, provider, status, created_at desc);
create index if not exists idx_media_assets_project on public.media_assets(project_id, created_at desc);
create index if not exists idx_media_assets_campaign on public.media_assets(campaign_id, created_at desc);
create index if not exists idx_media_assets_property on public.media_assets(property_id, created_at desc);
create index if not exists idx_media_asset_links_entity on public.media_asset_links(organization_id, entity_type, entity_id);
create index if not exists idx_media_usage_events_org_created on public.media_usage_events(organization_id, created_at desc);

drop trigger if exists trg_media_projects_touch on public.media_projects;
create trigger trg_media_projects_touch
  before update on public.media_projects
  for each row execute function public.media_studio_touch_updated_at();

drop trigger if exists trg_media_brand_profiles_touch on public.media_brand_profiles;
create trigger trg_media_brand_profiles_touch
  before update on public.media_brand_profiles
  for each row execute function public.media_studio_touch_updated_at();

drop trigger if exists trg_media_templates_touch on public.media_templates;
create trigger trg_media_templates_touch
  before update on public.media_templates
  for each row execute function public.media_studio_touch_updated_at();

drop trigger if exists trg_media_jobs_touch on public.media_generation_jobs;
create trigger trg_media_jobs_touch
  before update on public.media_generation_jobs
  for each row execute function public.media_studio_touch_updated_at();

drop trigger if exists trg_media_assets_touch on public.media_assets;
create trigger trg_media_assets_touch
  before update on public.media_assets
  for each row execute function public.media_studio_touch_updated_at();

alter table public.media_projects enable row level security;
alter table public.media_brand_profiles enable row level security;
alter table public.media_templates enable row level security;
alter table public.media_provider_capabilities enable row level security;
alter table public.media_prompt_plans enable row level security;
alter table public.media_generation_jobs enable row level security;
alter table public.media_assets enable row level security;
alter table public.media_asset_links enable row level security;
alter table public.media_usage_events enable row level security;

drop policy if exists media_projects_tenant_access on public.media_projects;
create policy media_projects_tenant_access
  on public.media_projects for all
  using (public.media_studio_can_access(organization_id))
  with check (public.media_studio_can_access(organization_id));

drop policy if exists media_brand_profiles_tenant_access on public.media_brand_profiles;
create policy media_brand_profiles_tenant_access
  on public.media_brand_profiles for all
  using (organization_id is null or public.media_studio_can_access(organization_id))
  with check (organization_id is null or public.media_studio_can_access(organization_id));

drop policy if exists media_templates_tenant_access on public.media_templates;
create policy media_templates_tenant_access
  on public.media_templates for all
  using (organization_id is null or public.media_studio_can_access(organization_id))
  with check (organization_id is null or public.media_studio_can_access(organization_id));

drop policy if exists media_provider_capabilities_tenant_access on public.media_provider_capabilities;
create policy media_provider_capabilities_tenant_access
  on public.media_provider_capabilities for all
  using (organization_id is null or public.media_studio_can_access(organization_id))
  with check (organization_id is null or public.media_studio_can_access(organization_id));

drop policy if exists media_prompt_plans_tenant_access on public.media_prompt_plans;
create policy media_prompt_plans_tenant_access
  on public.media_prompt_plans for all
  using (public.media_studio_can_access(organization_id))
  with check (public.media_studio_can_access(organization_id));

drop policy if exists media_generation_jobs_tenant_access on public.media_generation_jobs;
create policy media_generation_jobs_tenant_access
  on public.media_generation_jobs for all
  using (public.media_studio_can_access(organization_id))
  with check (public.media_studio_can_access(organization_id));

drop policy if exists media_assets_tenant_access on public.media_assets;
create policy media_assets_tenant_access
  on public.media_assets for all
  using (public.media_studio_can_access(organization_id))
  with check (public.media_studio_can_access(organization_id));

drop policy if exists media_asset_links_tenant_access on public.media_asset_links;
create policy media_asset_links_tenant_access
  on public.media_asset_links for all
  using (public.media_studio_can_access(organization_id))
  with check (public.media_studio_can_access(organization_id));

drop policy if exists media_usage_events_tenant_access on public.media_usage_events;
create policy media_usage_events_tenant_access
  on public.media_usage_events for all
  using (public.media_studio_can_access(organization_id))
  with check (public.media_studio_can_access(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-studio',
  'media-studio',
  true,
  524288000,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/mp4'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read mirrors the existing generated-media pattern for ad-creatives,
-- plot-assets, and content-images. Writes stay server-side through service role.
drop policy if exists "Public read media-studio" on storage.objects;
create policy "Public read media-studio"
  on storage.objects for select
  using (bucket_id = 'media-studio');

drop policy if exists "Service role insert media-studio" on storage.objects;
create policy "Service role insert media-studio"
  on storage.objects for insert
  with check (bucket_id = 'media-studio' and auth.role() = 'service_role');

drop policy if exists "Service role update media-studio" on storage.objects;
create policy "Service role update media-studio"
  on storage.objects for update
  using (bucket_id = 'media-studio' and auth.role() = 'service_role')
  with check (bucket_id = 'media-studio' and auth.role() = 'service_role');

drop policy if exists "Service role delete media-studio" on storage.objects;
create policy "Service role delete media-studio"
  on storage.objects for delete
  using (bucket_id = 'media-studio' and auth.role() = 'service_role');

insert into public.media_templates (
  organization_id,
  name,
  category,
  media_type,
  default_prompt_blocks,
  default_aspect_ratio,
  default_quality_tier,
  default_provider_preference,
  required_inputs,
  optional_inputs,
  is_system,
  metadata_json
)
values
  (null, 'LinkedIn-portrett', 'portrait', 'image', '{"PURPOSE":"professional profile portrait","STYLE":"premium, credible, natural"}', '4:5', 'balanced', 'gemini', array['subject'], array['brand','background','clothing'], true, '{"slug":"linkedin-portrait"}'),
  (null, 'LinkedIn-annonse', 'social_ad', 'image', '{"PURPOSE":"B2B social advertisement","TEXT_RULES":"avoid embedded text unless requested"}', '16:9', 'balanced', 'gemini', array['offer','audience'], array['brand','product'], true, '{"slug":"linkedin-ad"}'),
  (null, 'Instagram-post', 'social_post', 'image', '{"PURPOSE":"Instagram feed creative","COMPOSITION":"strong central subject"}', '1:1', 'balanced', 'gemini', array['subject'], array['brand','style'], true, '{"slug":"instagram-post"}'),
  (null, 'Instagram-Reel', 'social_video', 'video', '{"PURPOSE":"short vertical social video","ACTION":"clear first three seconds"}', '9:16', 'premium', 'openart', array['subject','hook'], array['sourceImageUrl','brand'], true, '{"slug":"instagram-reel"}'),
  (null, 'Facebook-annonse', 'social_ad', 'image', '{"PURPOSE":"paid social advertisement","AUDIENCE":"clear conversion audience"}', '1:1', 'balanced', 'gemini', array['offer','audience'], array['brand','product'], true, '{"slug":"facebook-ad"}'),
  (null, 'Eiendomshero', 'property', 'image', '{"PURPOSE":"premium property hero image","STYLE":"realistic, honest, Mediterranean real estate"}', '16:9', 'premium', 'openart', array['property','setting'], array['brand','timeOfDay'], true, '{"slug":"property-hero"}'),
  (null, 'Eiendoms-Reel', 'property', 'video', '{"PURPOSE":"short property reel","ACTION":"slow cinematic movement"}', '9:16', 'premium', 'openart', array['property','sourceImageUrl'], array['brand','duration'], true, '{"slug":"property-reel"}'),
  (null, 'Produktreklame', 'product', 'image', '{"PURPOSE":"premium product advertising image","REFERENCE PRESERVATION":"Preserve real product identity, package shape, label, logo, colors and recognizable details. Do not invent new text."}', '4:5', 'premium', 'openart', array['product','sourceImageUrl'], array['brand','environment'], true, '{"slug":"product-ad"}'),
  (null, 'Middelhavslivsstil', 'lifestyle', 'image', '{"ENVIRONMENT":"authentic Mediterranean environment","LIGHTING":"warm natural sunlight"}', '4:5', 'balanced', 'gemini', array['subject'], array['brand','product'], true, '{"slug":"mediterranean-lifestyle"}'),
  (null, 'Bokomslag', 'publishing', 'image', '{"PURPOSE":"book cover","TEXT_RULES":"only render title/author text when explicitly supplied"}', '2:3', 'premium', 'gemini', array['title','genre'], array['author','subtitle'], true, '{"slug":"book-cover"}'),
  (null, 'Forfatterportrett', 'portrait', 'image', '{"PURPOSE":"author portrait","STYLE":"credible, warm, editorial"}', '4:5', 'balanced', 'gemini', array['subject'], array['background','brand'], true, '{"slug":"author-portrait"}'),
  (null, 'Bloggheader', 'website', 'image', '{"PURPOSE":"article header image","COMPOSITION":"wide, readable hero crop"}', '16:9', 'fast', 'gemini', array['topic'], array['brand','style'], true, '{"slug":"blog-header"}'),
  (null, 'Kampanjepakke', 'campaign', 'image', '{"PURPOSE":"multi-format campaign package","OUTPUT FORMAT":"create reusable visual concept for multiple formats"}', '1:1', 'premium', 'openart', array['campaign','audience'], array['brand','offer'], true, '{"slug":"campaign-pack"}')
on conflict (organization_id, name) do nothing;

notify pgrst, 'reload schema';
