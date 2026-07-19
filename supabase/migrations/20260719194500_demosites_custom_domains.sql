-- DemoSites custom domains
-- Maps a customer-owned hostname directly to a deployed multi-tenant site.

ALTER TABLE demo_site_orders
  ADD COLUMN IF NOT EXISTS custom_domain TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_site_orders_custom_domain_unique
  ON demo_site_orders (LOWER(custom_domain))
  WHERE custom_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demo_site_orders_custom_domain_routing
  ON demo_site_orders (LOWER(custom_domain), status, site_slug)
  WHERE custom_domain IS NOT NULL;

COMMENT ON COLUMN demo_site_orders.custom_domain IS
  'Customer-owned hostname attached to the RealtyFlow Vercel project. Middleware maps this host to site_slug without redirecting or masking the URL.';
