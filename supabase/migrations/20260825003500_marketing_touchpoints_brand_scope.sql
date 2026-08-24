-- Marketing Growth OS — brand-isolated attribution.
-- Touchpoints were empty in production when this migration was introduced, so
-- brand_id can be made NOT NULL without an unsafe historical backfill.

alter table public.marketing_touchpoints
  add column if not exists brand_id text;

alter table public.marketing_touchpoints
  alter column brand_id set not null;

create index if not exists idx_mkt_touch_brand_contact
  on public.marketing_touchpoints (brand_id, contact_id, occurred_at);

create index if not exists idx_mkt_touch_brand_visitor
  on public.marketing_touchpoints (brand_id, visitor_id, occurred_at);

create index if not exists idx_mkt_touch_brand_content
  on public.marketing_touchpoints (brand_id, content_id);
