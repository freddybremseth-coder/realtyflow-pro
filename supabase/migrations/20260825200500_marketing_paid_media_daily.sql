create table if not exists public.marketing_paid_media_daily (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  brand_id text not null,
  platform text not null,
  source text not null,
  campaign_external_id text,
  adset_external_id text,
  ad_external_id text,
  creative_variant_id uuid references public.ad_creatives(id) on delete set null,
  spend_amount numeric(18,6),
  currency text,
  spend_eur numeric(18,6),
  fx_rate_to_eur numeric(18,8),
  fx_date date,
  impressions bigint,
  reach bigint,
  clicks bigint,
  landing_page_views bigint,
  platform_conversions bigint,
  raw_payload jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_paid_media_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint marketing_paid_media_spend_check check (spend_amount is null or spend_amount >= 0),
  constraint marketing_paid_media_spend_eur_check check (spend_eur is null or spend_eur >= 0),
  constraint marketing_paid_media_fx_provenance check (
    spend_eur is null or (fx_rate_to_eur is not null and fx_rate_to_eur > 0 and fx_date is not null)
  )
);

create unique index if not exists marketing_paid_media_daily_identity_uidx
  on public.marketing_paid_media_daily(
    metric_date,
    brand_id,
    platform,
    source,
    coalesce(campaign_external_id,''),
    coalesce(adset_external_id,''),
    coalesce(ad_external_id,''),
    coalesce(creative_variant_id::text,'')
  );
create index if not exists marketing_paid_media_daily_creative_idx on public.marketing_paid_media_daily(creative_variant_id,metric_date desc) where creative_variant_id is not null;
create index if not exists marketing_paid_media_daily_brand_idx on public.marketing_paid_media_daily(brand_id,metric_date desc);

alter table public.marketing_paid_media_daily enable row level security;

comment on table public.marketing_paid_media_daily is 'Canonical provider-agnostic daily paid-media cost/delivery observations. Downstream CRM outcomes remain in marketing_touchpoints/revenue_events.';
comment on column public.marketing_paid_media_daily.platform_conversions is 'Provider-native conversion count only; never canonical CRM sales/leads.';
comment on column public.marketing_paid_media_daily.spend_eur is 'Optional normalized spend. Must have explicit fx_rate_to_eur and fx_date provenance; missing conversion is unknown, not zero.';
