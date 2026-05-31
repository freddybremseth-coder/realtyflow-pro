-- ============================================================================
-- 20260531_data_health_olivia_family.sql
-- Fixes Data Health warnings for Olivia/Doña Anna B2B, batch tracking and Family schema access.
-- Safe to run multiple times.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS olivia;
CREATE SCHEMA IF NOT EXISTS family;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Olivia / Doña Anna
-- ============================================================================

CREATE TABLE IF NOT EXISTS olivia.batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_number TEXT DEFAULT '',
  name TEXT DEFAULT '',
  status TEXT DEFAULT 'PLANNED',
  product_type TEXT DEFAULT '',
  harvest_date DATE,
  production_date DATE,
  kilograms NUMERIC DEFAULT 0,
  liters NUMERIC DEFAULT 0,
  yield_percentage NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS olivia.commerce_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '',
  description TEXT DEFAULT '',
  unit TEXT DEFAULT 'unit',
  unit_price NUMERIC DEFAULT 0,
  vat_rate NUMERIC DEFAULT 0,
  stock_quantity NUMERIC DEFAULT 0,
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS olivia.commerce_customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  vat_number TEXT DEFAULT '',
  billing_address TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  customer_type TEXT DEFAULT 'b2b',
  status TEXT DEFAULT 'active',
  notes TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS olivia.commerce_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT DEFAULT '',
  customer_id UUID REFERENCES olivia.commerce_customers(id) ON DELETE SET NULL,
  customer_name TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  payment_status TEXT DEFAULT 'unpaid',
  ordered_at TIMESTAMPTZ DEFAULT now(),
  due_date DATE,
  currency TEXT DEFAULT 'EUR',
  subtotal NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS olivia.commerce_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES olivia.commerce_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES olivia.commerce_products(id) ON DELETE SET NULL,
  product_name TEXT DEFAULT '',
  quantity NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'unit',
  unit_price NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  line_total NUMERIC DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS olivia.commerce_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT DEFAULT '',
  order_id UUID REFERENCES olivia.commerce_orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES olivia.commerce_customers(id) ON DELETE SET NULL,
  customer_name TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  payment_status TEXT DEFAULT 'unpaid',
  issue_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  currency TEXT DEFAULT 'EUR',
  amount NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  invoice_total NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_olivia_batches_status ON olivia.batches(status);
CREATE INDEX IF NOT EXISTS idx_olivia_orders_status ON olivia.commerce_orders(status);
CREATE INDEX IF NOT EXISTS idx_olivia_orders_customer ON olivia.commerce_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_olivia_invoices_payment_status ON olivia.commerce_invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_olivia_products_active ON olivia.commerce_products(active);

-- ============================================================================
-- Family schema access and minimum tables expected by Data Health
-- ============================================================================

CREATE TABLE IF NOT EXISTS family.households (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Family',
  currency TEXT DEFAULT 'EUR',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family.user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES family.households(id) ON DELETE SET NULL,
  email TEXT DEFAULT '',
  full_name TEXT DEFAULT '',
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family.members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES family.households(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  relation TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family.transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES family.households(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  source TEXT DEFAULT '',
  direction TEXT DEFAULT 'income',
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family.real_estate_deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT DEFAULT '',
  status TEXT DEFAULT '',
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family.farm_operations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT DEFAULT '',
  operation_type TEXT DEFAULT '',
  status TEXT DEFAULT '',
  date DATE DEFAULT CURRENT_DATE,
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family.economy_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  olivia_net_nok NUMERIC DEFAULT 0,
  realtyflow_net_nok NUMERIC DEFAULT 0,
  mondeo_interest_nok NUMERIC DEFAULT 0,
  total_net_nok NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month)
);

-- Keep public fallback view/table available for Data Health when Family schema is not exposed.
CREATE TABLE IF NOT EXISTS public.family_economy_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  olivia_net_nok NUMERIC DEFAULT 0,
  realtyflow_net_nok NUMERIC DEFAULT 0,
  mondeo_interest_nok NUMERIC DEFAULT 0,
  total_net_nok NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month)
);

-- ============================================================================
-- Grants for Supabase/PostgREST roles.
-- ============================================================================

GRANT USAGE ON SCHEMA olivia TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA family TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA olivia TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA olivia TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA family TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA family TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA olivia TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA family TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA olivia GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA olivia GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA family GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA family GRANT SELECT ON TABLES TO anon;

-- Make Supabase/PostgREST aware of schema changes.
NOTIFY pgrst, 'reload schema';
