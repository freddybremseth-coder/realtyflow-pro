alter table public.ad_campaigns
  add column if not exists growth_goal text not null default 'unspecified',
  add column if not exists optimization_event text,
  add column if not exists default_language text;

alter table public.ad_campaigns
  drop constraint if exists ad_campaigns_growth_goal_check;
alter table public.ad_campaigns
  add constraint ad_campaigns_growth_goal_check check (growth_goal in ('unspecified','lead_generation','follower_growth','direct_sales','retargeting','awareness'));

alter table public.ad_creatives
  add column if not exists tracking_code text,
  add column if not exists growth_goal text not null default 'unspecified',
  add column if not exists hook_family text,
  add column if not exists language text,
  add column if not exists audience_segment text,
  add column if not exists creative_format text,
  add column if not exists creative_dna jsonb not null default '{}'::jsonb,
  add column if not exists parent_creative_id uuid references public.ad_creatives(id) on delete set null,
  add column if not exists generation_type text not null default 'original';

alter table public.ad_creatives
  drop constraint if exists ad_creatives_growth_goal_check;
alter table public.ad_creatives
  add constraint ad_creatives_growth_goal_check check (growth_goal in ('unspecified','lead_generation','follower_growth','direct_sales','retargeting','awareness'));

alter table public.ad_creatives
  drop constraint if exists ad_creatives_generation_type_check;
alter table public.ad_creatives
  add constraint ad_creatives_generation_type_check check (generation_type in ('original','winner_variant','manual_variant'));

create unique index if not exists ad_creatives_tracking_code_uidx on public.ad_creatives(tracking_code) where tracking_code is not null;
create index if not exists ad_creatives_growth_goal_idx on public.ad_creatives(campaign_id,growth_goal);
create index if not exists ad_creatives_parent_idx on public.ad_creatives(parent_creative_id) where parent_creative_id is not null;
create index if not exists marketing_touchpoints_creative_idx on public.marketing_touchpoints(creative_variant_id,occurred_at desc) where creative_variant_id is not null;

comment on column public.ad_creatives.creative_dna is 'Structured creative genome for analysis: concept/hook/angle/mood/audience/language/format/CTA/provider/prompt lineage. Not a metrics ledger.';
comment on column public.ad_creatives.tracking_code is 'Stable public-safe short code for UTM/ad attribution. Canonical database identity remains ad_creatives.id.';
comment on column public.ad_creatives.parent_creative_id is 'Lineage to the creative that inspired this variant. Does not imply winner status by itself.';
comment on column public.ad_campaigns.growth_goal is 'Explicit optimization intent; unspecified is used for legacy campaigns rather than inferred intent.';
