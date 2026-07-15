-- ─── DemoSites automatic publishing ─────────────────────────────────────────
--
-- Paid orders are published automatically at /sites/<site_slug> (the real,
-- indexable one-pager — the trial preview stays noindex and token-gated).
-- The slug is assigned at publish time from the company name, with a
-- numeric suffix on collisions.

alter table demo_site_orders
  add column if not exists site_slug text;

create unique index if not exists idx_demo_site_orders_site_slug
  on demo_site_orders (site_slug)
  where site_slug is not null;

comment on column demo_site_orders.site_slug is
  'Public slug for the published live site (/sites/<slug>). Assigned automatically when the order is paid; null until published.';
