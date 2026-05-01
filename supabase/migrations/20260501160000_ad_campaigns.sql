-- ─── Ad Campaigns ──────────────────────────────────────────────────────
-- Multi-brand IG/Meta ad campaign generator.
-- 50-ad creative matrix per campaign (5 angles × 5 scenes × 2 aspect ratios).

-- Note: brands are hardcoded in src/lib/constants.ts and identified by
-- text slugs (e.g. "zeneco", "soleada", "donaanna"). Per-brand settings
-- live in the existing `brand_settings` table.
create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id text,                                              -- slug from BRANDS constant
  user_id uuid references auth.users(id) on delete set null,

  -- intake
  name text not null,
  product_name text not null,
  product_image_url text not null,
  label_description text not null,
  target_markets text[] default '{}',
  audience_segments text[] default '{}',
  brand_voice text,
  funnel_stage text default 'cold',
  offer text,
  off_limits text,

  -- pipeline state
  status text not null default 'draft',
    -- draft → brief_pending → matrix_pending → generating → completed | failed
  brief jsonb,
  matrix jsonb,
  delivery jsonb,

  -- counters
  total_creatives int default 50,
  succeeded_count int default 0,
  failed_count int default 0,
  estimated_cost_usd numeric(8,2),

  -- audit
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ad_campaigns_brand on ad_campaigns(brand_id);
create index if not exists idx_ad_campaigns_user on ad_campaigns(user_id);
create index if not exists idx_ad_campaigns_status on ad_campaigns(status);

-- Auto-update updated_at
create or replace function touch_ad_campaigns()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_ad_campaigns on ad_campaigns;
create trigger trg_touch_ad_campaigns
  before update on ad_campaigns
  for each row execute function touch_ad_campaigns();


-- ─── Ad Creatives (one row per generated image) ────────────────────────
create table if not exists ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,

  -- scene metadata (from matrix)
  scene_id text not null,                 -- 'A1', 'B2', etc.
  angle text not null,                    -- 'Lifestyle Ritual', 'Chef Authority', ...
  mood text,                              -- 'bright/airy', 'moody/premium', ...
  scene_description text,
  aspect_ratio text not null,             -- '1:1' | '9:16'

  -- generation
  prompt text not null,
  status text default 'pending',          -- pending|generating|completed|failed
  image_url text,                         -- Supabase Storage public URL
  source_url text,                        -- Original Replicate delivery URL
  replicate_prediction_id text,
  generation_seconds numeric(6,1),
  error text,

  -- copy + organization
  caption_primary text,                   -- in primary market language
  caption_secondary text,                 -- in secondary market language (if multi-market)
  hashtags text[] default '{}',
  is_top_pick boolean default false,
  pick_rank int,                          -- 1..5 if top pick
  pushed_to_hub boolean default false,
  hub_content_id uuid,                    -- FK if pushed

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ad_creatives_campaign on ad_creatives(campaign_id);
create index if not exists idx_ad_creatives_status on ad_creatives(status);
create index if not exists idx_ad_creatives_top_pick on ad_creatives(is_top_pick) where is_top_pick = true;
create unique index if not exists uq_ad_creatives_scene on ad_creatives(campaign_id, scene_id, aspect_ratio);

drop trigger if exists trg_touch_ad_creatives on ad_creatives;
create trigger trg_touch_ad_creatives
  before update on ad_creatives
  for each row execute function touch_ad_campaigns();


-- ─── RLS ───────────────────────────────────────────────────────────────
alter table ad_campaigns enable row level security;
alter table ad_creatives enable row level security;

-- Owners can do anything with their campaigns
drop policy if exists "ad_campaigns owner full access" on ad_campaigns;
create policy "ad_campaigns owner full access"
  on ad_campaigns for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Service role bypass (for server-side batch generator)
drop policy if exists "ad_campaigns service role" on ad_campaigns;
create policy "ad_campaigns service role"
  on ad_campaigns for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Creatives inherit access from campaign
drop policy if exists "ad_creatives via campaign owner" on ad_creatives;
create policy "ad_creatives via campaign owner"
  on ad_creatives for all
  using (exists (
    select 1 from ad_campaigns c
    where c.id = ad_creatives.campaign_id
      and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from ad_campaigns c
    where c.id = ad_creatives.campaign_id
      and c.user_id = auth.uid()
  ));

drop policy if exists "ad_creatives service role" on ad_creatives;
create policy "ad_creatives service role"
  on ad_creatives for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


-- ─── Storage bucket for generated creatives ────────────────────────────
insert into storage.buckets (id, name, public)
values ('ad-creatives', 'ad-creatives', true)
on conflict (id) do nothing;

-- Public read on the bucket so Meta/IG can fetch images
drop policy if exists "Public read ad-creatives" on storage.objects;
create policy "Public read ad-creatives"
  on storage.objects for select
  using (bucket_id = 'ad-creatives');

-- Service role and authenticated users can write
drop policy if exists "Authenticated write ad-creatives" on storage.objects;
create policy "Authenticated write ad-creatives"
  on storage.objects for insert
  with check (
    bucket_id = 'ad-creatives'
    and (auth.role() = 'authenticated' or auth.role() = 'service_role')
  );
