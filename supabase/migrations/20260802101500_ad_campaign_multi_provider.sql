-- Multi-provider Ad Campaign Generator
-- Adds Auto/OpenArt/Gemini/Flux routing, structured concept families,
-- overlay copy and Media Library traceability without removing legacy data.

alter table public.ad_campaigns
  add column if not exists campaign_style text not null default 'product_focused',
  add column if not exists overlay_mode text not null default 'suggestions',
  add column if not exists preserve_product_identity boolean not null default true,
  add column if not exists provider_strategy jsonb not null default '{}'::jsonb,
  add column if not exists concept_count integer not null default 10,
  add column if not exists variants_per_concept integer not null default 5;

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_image_provider_check;

alter table public.ad_campaigns
  alter column image_provider set default 'auto';

alter table public.ad_campaigns
  add constraint ad_campaigns_image_provider_check
  check (image_provider in ('auto', 'openart', 'gemini', 'flux', 'replicate'));

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_campaign_style_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_campaign_style_check
  check (campaign_style in (
    'product_focused',
    'lifestyle',
    'luxury',
    'scandinavian_clean',
    'organic_natural',
    'seasonal',
    'social_proof',
    'promo_sale',
    'mixed'
  ));

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_overlay_mode_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_overlay_mode_check
  check (overlay_mode in ('none', 'suggestions', 'automatic'));

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_concept_count_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_concept_count_check
  check (concept_count between 1 and 20);

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_variants_per_concept_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_variants_per_concept_check
  check (variants_per_concept between 1 and 20);

alter table public.ad_creatives
  add column if not exists concept_group text,
  add column if not exists variant_index integer not null default 1,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists provider_job_id text,
  add column if not exists output_asset_id uuid references public.media_assets(id) on delete set null,
  add column if not exists overlay_headline text,
  add column if not exists overlay_subheadline text,
  add column if not exists overlay_cta text,
  add column if not exists overlay_badge text,
  add column if not exists overlay_applied boolean not null default false,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

update public.ad_creatives
set provider_job_id = replicate_prediction_id
where provider_job_id is null and replicate_prediction_id is not null;

update public.ad_creatives c
set provider = case
  when ac.image_provider = 'replicate' then 'flux'
  else ac.image_provider
end
from public.ad_campaigns ac
where ac.id = c.campaign_id and c.provider is null;

update public.ad_creatives
set concept_group = angle
where concept_group is null;

create index if not exists ad_creatives_campaign_concept_idx
  on public.ad_creatives(campaign_id, concept_group, variant_index);

create index if not exists ad_creatives_campaign_provider_status_idx
  on public.ad_creatives(campaign_id, provider, status);

create index if not exists ad_creatives_output_asset_idx
  on public.ad_creatives(output_asset_id)
  where output_asset_id is not null;

comment on column public.ad_campaigns.image_provider is
  'Ad image routing mode: auto, openart, gemini, flux, or legacy replicate.';
comment on column public.ad_campaigns.provider_strategy is
  'Resolved provider allocation and cost assumptions for this campaign.';
comment on column public.ad_creatives.concept_group is
  'Campaign concept family used to group related ad variants.';
comment on column public.ad_creatives.output_asset_id is
  'Generated Media Studio asset corresponding to this creative.';
