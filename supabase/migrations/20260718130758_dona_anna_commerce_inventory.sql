-- Doña Anna commerce, food traceability and inventory foundation.
--
-- The operational schemas stay private. Browser and partner applications use
-- authenticated Next.js APIs; those APIs call the explicitly granted RPCs at
-- the bottom of this migration with the server-side service role.

create extension if not exists pgcrypto;

create schema if not exists commerce;
create schema if not exists inventory;
create schema if not exists integrations;

comment on schema commerce is 'Canonical sales, purchasing, pricing, POS, reseller and commission data.';
comment on schema inventory is 'Canonical warehouses, lots, stock movements, landed cost and recall data.';
comment on schema integrations is 'Private outbox and idempotency state for external storefronts and apps.';

create table commerce.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text not null,
  default_currency text not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  status text not null default 'planning' check (status in ('planning', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table commerce.workspace_users (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text not null,
  role text not null default 'viewer' check (role in ('owner', 'administrator', 'operations', 'sales', 'finance', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_email)
);

create table commerce.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  slug text not null,
  display_name text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table commerce.brand_organization_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  brand_id uuid not null references commerce.brands(id) on delete cascade,
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  role text not null check (role in ('holding', 'producer', 'importer', 'seller', 'service_provider')),
  market_country_code text check (market_country_code is null or market_country_code ~ '^[A-Z]{2}$'),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  unique (brand_id, organization_id, role, market_country_code, valid_from)
);

create table commerce.parties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  organization_id uuid references public.billing_organizations(id) on delete set null,
  billing_customer_id uuid references public.billing_customers(id) on delete set null,
  party_type text not null default 'company' check (party_type in ('person', 'company')),
  name text not null,
  roles text[] not null default array['customer']::text[],
  registration_number text,
  vat_number text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  email text,
  phone text,
  address jsonb,
  default_price_list_id uuid,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index commerce_parties_workspace_name_idx on commerce.parties (workspace_id, lower(name));
create index commerce_parties_roles_idx on commerce.parties using gin (roles);

create table commerce.products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  brand_id uuid references commerce.brands(id) on delete set null,
  owner_organization_id uuid references public.billing_organizations(id) on delete set null,
  billing_product_id uuid references public.billing_products(id) on delete set null,
  sku text not null,
  name text not null,
  description text,
  product_type text not null default 'goods' check (product_type in ('goods', 'service', 'packaging')),
  unit text not null default 'stk',
  track_lots boolean not null default true,
  shelf_life_days integer check (shelf_life_days is null or shelf_life_days > 0),
  barcode text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, sku)
);

create index commerce_products_workspace_active_idx on commerce.products (workspace_id, active, name);

create table commerce.price_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  organization_id uuid references public.billing_organizations(id) on delete set null,
  brand_id uuid references commerce.brands(id) on delete set null,
  name text not null,
  code text not null,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  sales_channel text not null default 'all' check (sales_channel in ('all', 'website', 'pos', 'market', 'b2b', 'reseller', 'family_reseller', 'intercompany')),
  customer_type text not null default 'all' check (customer_type in ('all', 'private', 'business', 'reseller', 'family_reseller')),
  valid_from date not null default current_date,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  unique (workspace_id, code)
);

create table commerce.price_list_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  price_list_id uuid not null references commerce.price_lists(id) on delete cascade,
  product_id uuid not null references commerce.products(id) on delete cascade,
  unit_price numeric(18,4) not null check (unit_price >= 0),
  minimum_quantity numeric(18,4) not null default 1 check (minimum_quantity > 0),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  unique (price_list_id, product_id, minimum_quantity, valid_from)
);

alter table commerce.parties
  add constraint commerce_parties_default_price_list_fk
  foreign key (default_price_list_id) references commerce.price_lists(id) on delete set null;

create table inventory.warehouses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  owner_organization_id uuid references public.billing_organizations(id) on delete set null,
  code text not null,
  name text not null,
  warehouse_type text not null default 'main' check (warehouse_type in ('farm', 'production', 'main', 'transit', 'market', 'vehicle', 'reseller', 'consignment', 'returns')),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  address jsonb,
  status text not null default 'planned' check (status in ('planned', 'active', 'paused', 'closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create table inventory.lots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  product_id uuid not null references commerce.products(id) on delete restrict,
  owner_organization_id uuid references public.billing_organizations(id) on delete set null,
  lot_number text not null,
  status text not null default 'planned' check (status in ('planned', 'quarantine', 'released', 'blocked', 'recalled', 'depleted')),
  harvest_year integer check (harvest_year is null or harvest_year between 1900 and 2200),
  harvest_date date,
  production_date date,
  bottling_date date,
  best_before_date date,
  origin_country_code text check (origin_country_code is null or origin_country_code ~ '^[A-Z]{2}$'),
  olive_variety text,
  organic_status text,
  quality_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, product_id, lot_number)
);

create index inventory_lots_trace_idx on inventory.lots (workspace_id, lot_number, status);

create table commerce.pos_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  organization_id uuid references public.billing_organizations(id) on delete restrict,
  warehouse_id uuid not null references inventory.warehouses(id) on delete restrict,
  session_number text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  opened_by_email text not null,
  opening_cash numeric(18,2) not null default 0 check (opening_cash >= 0),
  closed_at timestamptz,
  closed_by_email text,
  expected_cash numeric(18,2),
  actual_cash numeric(18,2),
  difference numeric(18,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, session_number)
);

create unique index commerce_pos_one_open_per_warehouse_idx
  on commerce.pos_sessions (workspace_id, warehouse_id) where status = 'open';

create table commerce.order_series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  organization_id uuid references public.billing_organizations(id) on delete cascade,
  order_type text not null,
  fiscal_year integer not null,
  prefix text not null,
  next_number bigint not null default 1 check (next_number > 0),
  padding integer not null default 5 check (padding between 3 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (workspace_id, organization_id, order_type, fiscal_year)
);

create table commerce.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  brand_id uuid references commerce.brands(id) on delete set null,
  order_number text not null,
  order_type text not null check (order_type in ('sale', 'purchase', 'intercompany_sale', 'intercompany_purchase', 'pos')),
  seller_organization_id uuid references public.billing_organizations(id) on delete restrict,
  buyer_organization_id uuid references public.billing_organizations(id) on delete restrict,
  party_id uuid references commerce.parties(id) on delete set null,
  sales_rep_party_id uuid references commerce.parties(id) on delete set null,
  billing_customer_id uuid references public.billing_customers(id) on delete set null,
  warehouse_id uuid references inventory.warehouses(id) on delete restrict,
  destination_warehouse_id uuid references inventory.warehouses(id) on delete restrict,
  pos_session_id uuid references commerce.pos_sessions(id) on delete restrict,
  related_order_id uuid references commerce.orders(id) on delete set null,
  intercompany_transaction_id uuid,
  sales_channel text not null default 'admin' check (sales_channel in ('admin', 'website', 'pos', 'market', 'b2b', 'reseller', 'family_reseller', 'intercompany')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'reserved', 'partially_fulfilled', 'fulfilled', 'cancelled', 'returned')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid', 'refunded', 'partially_refunded')),
  ordered_at timestamptz not null default now(),
  requested_delivery_date date,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  billing_document_id uuid references public.billing_documents(id) on delete set null,
  commission_rule_id uuid,
  idempotency_key text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, order_number)
);

create unique index commerce_orders_idempotency_idx on commerce.orders (workspace_id, idempotency_key) where idempotency_key is not null;
create index commerce_orders_workspace_status_idx on commerce.orders (workspace_id, status, ordered_at desc);
create index commerce_orders_intercompany_idx on commerce.orders (intercompany_transaction_id) where intercompany_transaction_id is not null;

create table commerce.order_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  order_id uuid not null references commerce.orders(id) on delete cascade,
  position integer not null check (position > 0),
  product_id uuid not null references commerce.products(id) on delete restrict,
  lot_id uuid references inventory.lots(id) on delete restrict,
  description text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  fulfilled_quantity numeric(18,4) not null default 0 check (fulfilled_quantity >= 0),
  unit text not null,
  unit_price numeric(18,4) not null check (unit_price >= 0),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  discount_percent numeric(7,4) not null default 0 check (discount_percent between 0 and 100),
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  line_net numeric(18,2) not null,
  line_tax numeric(18,2) not null,
  line_total numeric(18,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, position),
  check (fulfilled_quantity <= quantity)
);

create table commerce.order_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  order_id uuid not null references commerce.orders(id) on delete restrict,
  payment_date timestamptz not null default now(),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method text not null check (method in ('cash', 'card', 'bank_transfer', 'vipps', 'stripe', 'other')),
  reference text,
  external_payment_id text,
  status text not null default 'captured' check (status in ('pending', 'captured', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_email text not null,
  created_at timestamptz not null default now()
);

create unique index commerce_order_payments_external_idx on commerce.order_payments (workspace_id, external_payment_id) where external_payment_id is not null;

create table inventory.reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  order_id uuid not null references commerce.orders(id) on delete cascade,
  order_line_id uuid not null references commerce.order_lines(id) on delete cascade,
  product_id uuid not null references commerce.products(id) on delete restrict,
  lot_id uuid references inventory.lots(id) on delete restrict,
  warehouse_id uuid not null references inventory.warehouses(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'released', 'committed', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inventory_reservations_source_idx
  on inventory.reservations (order_line_id, lot_id, warehouse_id) nulls not distinct;
create index inventory_reservations_active_idx on inventory.reservations (workspace_id, product_id, warehouse_id) where status = 'active';

create table inventory.movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  owner_organization_id uuid references public.billing_organizations(id) on delete restrict,
  product_id uuid not null references commerce.products(id) on delete restrict,
  lot_id uuid references inventory.lots(id) on delete restrict,
  warehouse_id uuid not null references inventory.warehouses(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening', 'receipt', 'shipment', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out', 'return_in', 'return_out', 'write_off', 'sample')),
  quantity numeric(18,4) not null check (quantity <> 0),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  source_type text not null,
  source_id uuid,
  correlation_id uuid,
  idempotency_key text,
  reason text,
  occurred_at timestamptz not null default now(),
  created_by_email text not null,
  created_at timestamptz not null default now()
);

create unique index inventory_movements_idempotency_idx on inventory.movements (workspace_id, idempotency_key) where idempotency_key is not null;
create index inventory_movements_balance_idx on inventory.movements (workspace_id, warehouse_id, product_id, lot_id, occurred_at);
create index inventory_movements_source_idx on inventory.movements (source_type, source_id);

create table inventory.landed_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  purchase_order_id uuid references commerce.orders(id) on delete restrict,
  cost_type text not null check (cost_type in ('freight', 'insurance', 'customs', 'brokerage', 'packaging', 'handling', 'other')),
  supplier_party_id uuid references commerce.parties(id) on delete set null,
  amount numeric(18,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  allocation_method text not null default 'quantity' check (allocation_method in ('quantity', 'weight', 'value', 'manual')),
  document_reference text,
  notes text,
  created_by_email text not null,
  created_at timestamptz not null default now()
);

create table inventory.landed_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  landed_cost_id uuid not null references inventory.landed_costs(id) on delete cascade,
  order_line_id uuid references commerce.order_lines(id) on delete cascade,
  product_id uuid not null references commerce.products(id) on delete restrict,
  lot_id uuid references inventory.lots(id) on delete restrict,
  allocated_amount numeric(18,2) not null check (allocated_amount >= 0),
  allocated_unit_cost numeric(18,4) not null default 0 check (allocated_unit_cost >= 0),
  created_at timestamptz not null default now()
);

create table commerce.commission_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  organization_id uuid references public.billing_organizations(id) on delete set null,
  name text not null,
  rule_type text not null check (rule_type in ('revenue_percent', 'margin_percent', 'fixed')),
  percentage numeric(7,4) check (percentage is null or percentage between 0 and 100),
  fixed_amount numeric(18,2) check (fixed_amount is null or fixed_amount >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  payable_event text not null default 'paid' check (payable_event in ('fulfilled', 'paid')),
  applies_to_channel text not null default 'all',
  active boolean not null default true,
  valid_from date not null default current_date,
  valid_to date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

alter table commerce.orders
  add constraint commerce_orders_commission_rule_fk
  foreign key (commission_rule_id) references commerce.commission_rules(id) on delete set null;

create table commerce.commission_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  order_id uuid not null references commerce.orders(id) on delete restrict,
  order_line_id uuid references commerce.order_lines(id) on delete restrict,
  beneficiary_party_id uuid not null references commerce.parties(id) on delete restrict,
  rule_id uuid references commerce.commission_rules(id) on delete set null,
  basis_amount numeric(18,2) not null,
  amount numeric(18,2) not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'earned', 'approved', 'payable', 'paid', 'reversed')),
  earned_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index commerce_commission_entry_source_idx
  on commerce.commission_entries (order_id, order_line_id, beneficiary_party_id)
  nulls not distinct;

create table commerce.returns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  order_id uuid references commerce.orders(id) on delete restrict,
  return_number text not null,
  return_type text not null default 'customer_return' check (return_type in ('customer_return', 'supplier_return')),
  status text not null default 'received' check (status in ('requested', 'authorized', 'received', 'inspected', 'refunded', 'rejected', 'closed')),
  reason text not null,
  refund_amount numeric(18,2) not null default 0 check (refund_amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  received_warehouse_id uuid references inventory.warehouses(id) on delete restrict,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, return_number)
);

create table commerce.return_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  return_id uuid not null references commerce.returns(id) on delete cascade,
  order_line_id uuid references commerce.order_lines(id) on delete set null,
  product_id uuid not null references commerce.products(id) on delete restrict,
  lot_id uuid references inventory.lots(id) on delete restrict,
  quantity numeric(18,4) not null check (quantity > 0),
  disposition text not null default 'quarantine' check (disposition in ('restock', 'quarantine', 'write_off', 'supplier_return')),
  created_at timestamptz not null default now()
);

create table inventory.recalls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  recall_number text not null,
  lot_id uuid not null references inventory.lots(id) on delete restrict,
  status text not null default 'open' check (status in ('draft', 'open', 'contained', 'closed')),
  risk_level text not null default 'precautionary' check (risk_level in ('precautionary', 'low', 'medium', 'high', 'critical')),
  reason text not null,
  instructions text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by_email text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, recall_number)
);

create table integrations.outbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'retry', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index integrations_outbox_queue_idx on integrations.outbox_events (status, available_at) where status in ('pending', 'retry');

create table commerce.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references commerce.workspaces(id) on delete cascade,
  actor_email text not null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index commerce_audit_workspace_created_idx on commerce.audit_events (workspace_id, created_at desc);

create or replace view inventory.stock_balances
with (security_invoker = true)
as
select
  workspace_id,
  owner_organization_id,
  warehouse_id,
  product_id,
  lot_id,
  sum(quantity)::numeric(18,4) as on_hand,
  case when sum(quantity) = 0 then 0::numeric else
    (sum(case when quantity > 0 then quantity * unit_cost else 0 end) /
      nullif(sum(case when quantity > 0 then quantity else 0 end), 0))::numeric(18,4)
  end as average_receipt_cost,
  max(occurred_at) as last_movement_at
from inventory.movements
group by workspace_id, owner_organization_id, warehouse_id, product_id, lot_id;

create or replace view inventory.available_stock
with (security_invoker = true)
as
select
  balances.workspace_id,
  balances.owner_organization_id,
  balances.warehouse_id,
  balances.product_id,
  balances.lot_id,
  balances.on_hand,
  coalesce(reserved.reserved_quantity, 0)::numeric(18,4) as reserved,
  (balances.on_hand - coalesce(reserved.reserved_quantity, 0))::numeric(18,4) as available,
  balances.average_receipt_cost,
  balances.last_movement_at
from inventory.stock_balances balances
left join (
  select workspace_id, warehouse_id, product_id, lot_id, sum(quantity) as reserved_quantity
  from inventory.reservations
  where status = 'active' and (expires_at is null or expires_at > now())
  group by workspace_id, warehouse_id, product_id, lot_id
) reserved
  on reserved.workspace_id = balances.workspace_id
 and reserved.warehouse_id = balances.warehouse_id
 and reserved.product_id = balances.product_id
 and reserved.lot_id is not distinct from balances.lot_id;

create or replace function commerce.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = commerce, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function inventory.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = inventory, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function inventory.reject_immutable_mutation()
returns trigger
language plpgsql
security invoker
set search_path = inventory, pg_temp
as $$
begin
  raise exception '% is append-only and cannot be changed or deleted', tg_table_name;
end;
$$;

create trigger trg_inventory_movements_immutable
before update or delete on inventory.movements
for each row execute function inventory.reject_immutable_mutation();

create trigger trg_commerce_audit_events_immutable
before update or delete on commerce.audit_events
for each row execute function inventory.reject_immutable_mutation();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces', 'workspace_users', 'brands', 'parties', 'products', 'price_lists',
    'price_list_items', 'pos_sessions', 'order_series', 'orders', 'order_lines',
    'reservations', 'commission_rules', 'commission_entries', 'returns', 'recalls'
  ] loop
    if table_name in ('reservations', 'recalls') then
      execute format('create trigger %I before update on inventory.%I for each row execute function inventory.touch_updated_at()', 'trg_' || table_name || '_updated_at', table_name);
    elsif table_name <> 'recalls' then
      execute format('create trigger %I before update on commerce.%I for each row execute function commerce.touch_updated_at()', 'trg_' || table_name || '_updated_at', table_name);
    end if;
  end loop;
  execute 'create trigger trg_warehouses_updated_at before update on inventory.warehouses for each row execute function inventory.touch_updated_at()';
  execute 'create trigger trg_lots_updated_at before update on inventory.lots for each row execute function inventory.touch_updated_at()';
end;
$$;

-- The operational schemas are deliberately not exposed to anon or authenticated.
revoke all on schema commerce, inventory, integrations from public, anon, authenticated;
revoke all on all tables in schema commerce, inventory, integrations from public, anon, authenticated;
revoke all on all sequences in schema commerce, inventory, integrations from public, anon, authenticated;
revoke all on all functions in schema commerce, inventory, integrations from public, anon, authenticated;

grant usage on schema commerce, inventory, integrations to service_role;
grant select, insert, update, delete on all tables in schema commerce, inventory, integrations to service_role;
grant usage, select on all sequences in schema commerce, inventory, integrations to service_role;
grant execute on all functions in schema commerce, inventory, integrations to service_role;
revoke update, delete on inventory.movements, commerce.audit_events from service_role;

alter default privileges for role postgres in schema commerce revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema inventory revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema integrations revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema commerce grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema inventory grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema integrations grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema commerce grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema inventory grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema integrations grant usage, select on sequences to service_role;

do $$
declare
  relation record;
begin
  for relation in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('commerce', 'inventory', 'integrations') and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', relation.schema_name, relation.table_name);
  end loop;
end;
$$;

-- Stable workspace identifiers make the legacy migration and API deterministic.
insert into commerce.workspaces (id, slug, display_name, default_currency, status)
values ('d0aa0000-0000-4000-8000-000000000001', 'dona-anna', 'Doña Anna', 'EUR', 'planning')
on conflict (slug) do update set display_name = excluded.display_name, updated_at = now();

insert into commerce.brands (id, workspace_id, slug, display_name)
values ('d0aa0000-0000-4000-8000-000000000002', 'd0aa0000-0000-4000-8000-000000000001', 'dona-anna', 'Doña Anna')
on conflict (workspace_id, slug) do update set display_name = excluded.display_name, updated_at = now();

insert into commerce.price_lists (id, workspace_id, brand_id, name, code, currency, sales_channel, customer_type, valid_from)
values ('d0aa0000-0000-4000-8000-000000000003', 'd0aa0000-0000-4000-8000-000000000001', 'd0aa0000-0000-4000-8000-000000000002', 'Standard utsalgspris EUR', 'retail-eur', 'EUR', 'all', 'all', current_date)
on conflict (workspace_id, code) do update set active = true, updated_at = now();

-- Preserve existing Olivia product and price records. The user has confirmed
-- that physical opening inventory is zero, so legacy demo stock is retained
-- only as audit metadata and never becomes a canonical movement.
do $$
begin
  if to_regclass('olivia.commerce_products') is not null then
    insert into commerce.products (
      workspace_id, brand_id, sku, name, description, product_type, unit,
      track_lots, active, metadata, created_at, updated_at
    )
    select
      'd0aa0000-0000-4000-8000-000000000001'::uuid,
      'd0aa0000-0000-4000-8000-000000000002'::uuid,
      coalesce(nullif(trim(p.sku), ''), 'legacy-' || left(p.id::text, 8)),
      p.name,
      nullif(p.description, ''),
      'goods',
      coalesce(nullif(p.unit, ''), 'stk'),
      true,
      p.active,
      coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
        'legacyOliviaId', p.id,
        'legacyOliviaStockQuantityIgnored', coalesce(p.stock_quantity, 0),
        'canonicalOpeningStock', 0,
        'stockMigrationReason', 'User-confirmed physical opening inventory is zero'
      ),
      p.created_at,
      p.updated_at
    from olivia.commerce_products p
    on conflict (workspace_id, sku) do nothing;

    insert into commerce.price_list_items (
      workspace_id, price_list_id, product_id, unit_price, minimum_quantity, valid_from, created_at, updated_at
    )
    select
      'd0aa0000-0000-4000-8000-000000000001'::uuid,
      'd0aa0000-0000-4000-8000-000000000003'::uuid,
      product.id,
      greatest(coalesce(p.unit_price, 0), 0),
      1,
      current_date,
      now(),
      now()
    from olivia.commerce_products p
    join commerce.products product
      on product.workspace_id = 'd0aa0000-0000-4000-8000-000000000001'::uuid
     and product.metadata->>'legacyOliviaId' = p.id::text
    on conflict (price_list_id, product_id, minimum_quantity, valid_from) do nothing;

  end if;
end;
$$;

create or replace function commerce.workspace_id(p_slug text default 'dona-anna')
returns uuid
language sql
stable
security invoker
set search_path = commerce, pg_temp
as $$
  select id from commerce.workspaces where slug = p_slug and status <> 'archived' limit 1;
$$;

create or replace function commerce.next_order_number(
  p_workspace_id uuid,
  p_organization_id uuid,
  p_order_type text,
  p_ordered_at timestamptz default now()
)
returns text
language plpgsql
security invoker
set search_path = commerce, pg_temp
as $$
declare
  target_year integer := extract(year from p_ordered_at)::integer;
  target_prefix text;
  series_row commerce.order_series%rowtype;
  next_value bigint;
begin
  target_prefix := case p_order_type
    when 'purchase' then 'PO'
    when 'intercompany_purchase' then 'ICPO'
    when 'intercompany_sale' then 'ICSO'
    when 'pos' then 'POS'
    else 'SO'
  end || '-' || target_year::text || '-';

  insert into commerce.order_series (
    workspace_id, organization_id, order_type, fiscal_year, prefix
  ) values (
    p_workspace_id, p_organization_id, p_order_type, target_year, target_prefix
  )
  on conflict (workspace_id, organization_id, order_type, fiscal_year) do nothing;

  select * into series_row
  from commerce.order_series
  where workspace_id = p_workspace_id
    and organization_id is not distinct from p_organization_id
    and order_type = p_order_type
    and fiscal_year = target_year
  for update;

  next_value := series_row.next_number;
  update commerce.order_series set next_number = next_number + 1, updated_at = now() where id = series_row.id;
  return series_row.prefix || lpad(next_value::text, series_row.padding, '0');
end;
$$;

create or replace function public.donaanna_snapshot(p_workspace_slug text default 'dona-anna')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, commerce, inventory, integrations, pg_temp
as $$
declare
  workspace_row commerce.workspaces%rowtype;
begin
  select * into workspace_row from commerce.workspaces where slug = p_workspace_slug and status <> 'archived';
  if not found then raise exception 'Doña Anna workspace not found'; end if;

  return jsonb_build_object(
    'workspace', to_jsonb(workspace_row),
    'brands', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.display_name)
      from (select * from commerce.brands where workspace_id = workspace_row.id and active) row_value
    ), '[]'::jsonb),
    'legalEntities', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.legal_name)
      from (
        select id, slug, legal_name, trading_name, country_code, registration_number,
               vat_number, default_currency, active
        from public.billing_organizations where active
      ) row_value
    ), '[]'::jsonb),
    'brandOrganizationLinks', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.valid_from desc)
      from (select * from commerce.brand_organization_links where workspace_id = workspace_row.id) row_value
    ), '[]'::jsonb),
    'billingCustomers', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.name)
      from (
        select id, organization_id, name, customer_type, country_code, currency, email, active
        from public.billing_customers where active
      ) row_value
    ), '[]'::jsonb),
    'parties', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.name)
      from (select * from commerce.parties where workspace_id = workspace_row.id and active) row_value
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.name)
      from (
        select p.*,
          price.id as price_item_id,
          price.price_list_id,
          price.unit_price,
          list.currency as price_currency,
          list.name as price_list_name
        from commerce.products p
        left join lateral (
          select item.* from commerce.price_list_items item
          join commerce.price_lists price_list on price_list.id = item.price_list_id
          where item.product_id = p.id and price_list.active
            and item.valid_from <= current_date and (item.valid_to is null or item.valid_to >= current_date)
          order by case when price_list.code = 'retail-eur' then 0 else 1 end, item.valid_from desc
          limit 1
        ) price on true
        left join commerce.price_lists list on list.id = price.price_list_id
        where p.workspace_id = workspace_row.id and p.active
      ) row_value
    ), '[]'::jsonb),
    'priceLists', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.name)
      from (select * from commerce.price_lists where workspace_id = workspace_row.id and active) row_value
    ), '[]'::jsonb),
    'priceItems', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.price_list_code, row_value.product_id, row_value.minimum_quantity)
      from (
        select item.*, list.code as price_list_code, list.currency, list.sales_channel, list.customer_type
        from commerce.price_list_items item
        join commerce.price_lists list on list.id = item.price_list_id
        where item.workspace_id = workspace_row.id and list.active
          and item.valid_from <= current_date and (item.valid_to is null or item.valid_to >= current_date)
      ) row_value
    ), '[]'::jsonb),
    'warehouses', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.name)
      from (select * from inventory.warehouses where workspace_id = workspace_row.id and status <> 'closed') row_value
    ), '[]'::jsonb),
    'lots', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc)
      from (
        select lot.*, product.name as product_name, product.sku
        from inventory.lots lot join commerce.products product on product.id = lot.product_id
        where lot.workspace_id = workspace_row.id
      ) row_value
    ), '[]'::jsonb),
    'stock', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.product_name, row_value.warehouse_name, row_value.lot_number)
      from (
        select stock.*, product.name as product_name, product.sku, warehouse.name as warehouse_name,
               lot.lot_number, lot.best_before_date, lot.status as lot_status
        from inventory.available_stock stock
        join commerce.products product on product.id = stock.product_id
        join inventory.warehouses warehouse on warehouse.id = stock.warehouse_id
        left join inventory.lots lot on lot.id = stock.lot_id
        where stock.workspace_id = workspace_row.id
      ) row_value
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.ordered_at desc)
      from (
        select orders.*, party.name as party_name, warehouse.name as warehouse_name,
               sales_rep.name as sales_rep_name,
               coalesce((select sum(payment.amount) from commerce.order_payments payment where payment.order_id = orders.id and payment.status = 'captured'), 0) as paid_amount
        from commerce.orders orders
        left join commerce.parties party on party.id = orders.party_id
        left join commerce.parties sales_rep on sales_rep.id = orders.sales_rep_party_id
        left join inventory.warehouses warehouse on warehouse.id = orders.warehouse_id
        where orders.workspace_id = workspace_row.id
      ) row_value
    ), '[]'::jsonb),
    'orderLines', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.order_id, row_value.position)
      from (
        select line.*, product.sku, product.name as product_name, lot.lot_number
        from commerce.order_lines line
        join commerce.products product on product.id = line.product_id
        left join inventory.lots lot on lot.id = line.lot_id
        where line.workspace_id = workspace_row.id
      ) row_value
    ), '[]'::jsonb),
    'posSessions', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.opened_at desc)
      from (
        select session.*, warehouse.name as warehouse_name
        from commerce.pos_sessions session
        join inventory.warehouses warehouse on warehouse.id = session.warehouse_id
        where session.workspace_id = workspace_row.id
      ) row_value
    ), '[]'::jsonb),
    'commissionRules', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.name)
      from (select * from commerce.commission_rules where workspace_id = workspace_row.id and active) row_value
    ), '[]'::jsonb),
    'commissionEntries', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc)
      from (
        select entry.*, party.name as beneficiary_name, orders.order_number
        from commerce.commission_entries entry
        join commerce.parties party on party.id = entry.beneficiary_party_id
        join commerce.orders orders on orders.id = entry.order_id
        where entry.workspace_id = workspace_row.id
      ) row_value
    ), '[]'::jsonb),
    'returns', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc)
      from (select * from commerce.returns where workspace_id = workspace_row.id) row_value
    ), '[]'::jsonb),
    'recalls', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.opened_at desc)
      from (
        select recall.*, lot.lot_number, product.name as product_name
        from inventory.recalls recall
        join inventory.lots lot on lot.id = recall.lot_id
        join commerce.products product on product.id = lot.product_id
        where recall.workspace_id = workspace_row.id
      ) row_value
    ), '[]'::jsonb),
    'landedCosts', coalesce((
      select jsonb_agg(to_jsonb(row_value) order by row_value.created_at desc)
      from (select * from inventory.landed_costs where workspace_id = workspace_row.id) row_value
    ), '[]'::jsonb),
    'metrics', jsonb_build_object(
      'productCount', (select count(*) from commerce.products where workspace_id = workspace_row.id and active),
      'warehouseCount', (select count(*) from inventory.warehouses where workspace_id = workspace_row.id and status <> 'closed'),
      'lotCount', (select count(*) from inventory.lots where workspace_id = workspace_row.id),
      'onHand', coalesce((select sum(on_hand) from inventory.stock_balances where workspace_id = workspace_row.id), 0),
      'reserved', coalesce((select sum(reserved) from inventory.available_stock where workspace_id = workspace_row.id), 0),
      'openOrders', (select count(*) from commerce.orders where workspace_id = workspace_row.id and status not in ('fulfilled', 'cancelled', 'returned')),
      'openRecalls', (select count(*) from inventory.recalls where workspace_id = workspace_row.id and status in ('draft', 'open', 'contained')),
      'inventoryValue', coalesce((select sum(greatest(on_hand, 0) * average_receipt_cost) from inventory.stock_balances where workspace_id = workspace_row.id), 0)
    )
  );
end;
$$;

create or replace function public.donaanna_upsert_product(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  target_id uuid := nullif(p_payload->>'id', '')::uuid;
  product_row commerce.products%rowtype;
  price_list_value uuid;
  price_value numeric(18,4);
  current_price commerce.price_list_items%rowtype;
begin
  if workspace_value is null then raise exception 'Workspace not found'; end if;
  if nullif(trim(p_payload->>'sku'), '') is null or nullif(trim(p_payload->>'name'), '') is null then
    raise exception 'SKU and product name are required';
  end if;

  if target_id is null then
    insert into commerce.products (
      workspace_id, brand_id, owner_organization_id, billing_product_id, sku, name,
      description, product_type, unit, track_lots, shelf_life_days, barcode, metadata
    ) values (
      workspace_value,
      coalesce(nullif(p_payload->>'brandId', '')::uuid, 'd0aa0000-0000-4000-8000-000000000002'::uuid),
      nullif(p_payload->>'ownerOrganizationId', '')::uuid,
      nullif(p_payload->>'billingProductId', '')::uuid,
      trim(p_payload->>'sku'), trim(p_payload->>'name'), nullif(trim(p_payload->>'description'), ''),
      coalesce(nullif(p_payload->>'productType', ''), 'goods'), coalesce(nullif(p_payload->>'unit', ''), 'stk'),
      coalesce((p_payload->>'trackLots')::boolean, true), nullif(p_payload->>'shelfLifeDays', '')::integer,
      nullif(trim(p_payload->>'barcode'), ''), coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into product_row;
  else
    update commerce.products set
      brand_id = coalesce(nullif(p_payload->>'brandId', '')::uuid, brand_id),
      owner_organization_id = nullif(p_payload->>'ownerOrganizationId', '')::uuid,
      billing_product_id = nullif(p_payload->>'billingProductId', '')::uuid,
      sku = trim(p_payload->>'sku'), name = trim(p_payload->>'name'),
      description = nullif(trim(p_payload->>'description'), ''),
      product_type = coalesce(nullif(p_payload->>'productType', ''), product_type),
      unit = coalesce(nullif(p_payload->>'unit', ''), unit),
      track_lots = coalesce((p_payload->>'trackLots')::boolean, track_lots),
      shelf_life_days = nullif(p_payload->>'shelfLifeDays', '')::integer,
      barcode = nullif(trim(p_payload->>'barcode'), ''),
      metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb),
      updated_at = now()
    where id = target_id and workspace_id = workspace_value
    returning * into product_row;
    if not found then raise exception 'Product not found'; end if;
  end if;

  if nullif(p_payload->>'unitPrice', '') is not null then
    price_value := (p_payload->>'unitPrice')::numeric;
    if price_value < 0 then raise exception 'Price cannot be negative'; end if;
    price_list_value := coalesce(
      nullif(p_payload->>'priceListId', '')::uuid,
      (select id from commerce.price_lists where workspace_id = workspace_value and code = 'retail-eur' limit 1)
    );
    select * into current_price from commerce.price_list_items
    where price_list_id = price_list_value and product_id = product_row.id
      and valid_from <= current_date and (valid_to is null or valid_to >= current_date)
    order by valid_from desc limit 1 for update;
    if found and current_price.valid_from = current_date then
      update commerce.price_list_items set unit_price = price_value, updated_at = now() where id = current_price.id;
    elsif found and current_price.unit_price is distinct from price_value then
      update commerce.price_list_items set valid_to = current_date - 1, updated_at = now() where id = current_price.id;
      insert into commerce.price_list_items (workspace_id, price_list_id, product_id, unit_price, valid_from)
      values (workspace_value, price_list_value, product_row.id, price_value, current_date);
    elsif not found then
      insert into commerce.price_list_items (workspace_id, price_list_id, product_id, unit_price, valid_from)
      values (workspace_value, price_list_value, product_row.id, price_value, current_date);
    end if;
  end if;

  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, case when target_id is null then 'product_created' else 'product_updated' end, 'product', product_row.id, to_jsonb(product_row));
  return to_jsonb(product_row);
end;
$$;

create or replace function public.donaanna_upsert_price_list(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  target_id uuid := nullif(p_payload->>'id', '')::uuid;
  list_row commerce.price_lists%rowtype;
  code_value text := lower(trim(p_payload->>'code'));
begin
  if workspace_value is null then raise exception 'Workspace not found'; end if;
  if nullif(trim(p_payload->>'name'), '') is null or code_value = '' then
    raise exception 'Price list name and code are required';
  end if;
  if code_value !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'Invalid price list code'; end if;
  if target_id is null then
    insert into commerce.price_lists (
      workspace_id, organization_id, brand_id, name, code, currency,
      sales_channel, customer_type, valid_from
    ) values (
      workspace_value, nullif(p_payload->>'organizationId', '')::uuid,
      coalesce(nullif(p_payload->>'brandId', '')::uuid, 'd0aa0000-0000-4000-8000-000000000002'::uuid),
      trim(p_payload->>'name'), code_value,
      upper(coalesce(nullif(p_payload->>'currency', ''), 'EUR')),
      coalesce(nullif(p_payload->>'salesChannel', ''), 'all'),
      coalesce(nullif(p_payload->>'customerType', ''), 'all'),
      coalesce(nullif(p_payload->>'validFrom', '')::date, current_date)
    ) returning * into list_row;
  else
    update commerce.price_lists set
      organization_id = nullif(p_payload->>'organizationId', '')::uuid,
      name = trim(p_payload->>'name'), code = code_value,
      currency = upper(coalesce(nullif(p_payload->>'currency', ''), currency)),
      sales_channel = coalesce(nullif(p_payload->>'salesChannel', ''), sales_channel),
      customer_type = coalesce(nullif(p_payload->>'customerType', ''), customer_type),
      updated_at = now()
    where id = target_id and workspace_id = workspace_value
    returning * into list_row;
    if not found then raise exception 'Price list not found'; end if;
  end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, case when target_id is null then 'price_list_created' else 'price_list_updated' end, 'price_list', list_row.id, to_jsonb(list_row));
  return to_jsonb(list_row);
end;
$$;

create or replace function public.donaanna_set_price(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  product_value uuid := nullif(p_payload->>'productId', '')::uuid;
  price_list_value uuid := nullif(p_payload->>'priceListId', '')::uuid;
  price_value numeric(18,4) := nullif(p_payload->>'unitPrice', '')::numeric;
  minimum_value numeric(18,4) := coalesce(nullif(p_payload->>'minimumQuantity', '')::numeric, 1);
  current_price commerce.price_list_items%rowtype;
begin
  if workspace_value is null or product_value is null or price_list_value is null or price_value is null then
    raise exception 'Workspace, product, price list and price are required';
  end if;
  if price_value < 0 or minimum_value <= 0 then raise exception 'Price must be non-negative and minimum quantity positive'; end if;
  perform 1 from commerce.products where id = product_value and workspace_id = workspace_value and active;
  if not found then raise exception 'Product not found'; end if;
  perform 1 from commerce.price_lists where id = price_list_value and workspace_id = workspace_value and active;
  if not found then raise exception 'Price list not found'; end if;
  select * into current_price from commerce.price_list_items
  where price_list_id = price_list_value and product_id = product_value
    and minimum_quantity = minimum_value
    and valid_from <= current_date and (valid_to is null or valid_to >= current_date)
  order by valid_from desc limit 1 for update;
  if found and current_price.valid_from = current_date then
    update commerce.price_list_items set unit_price = price_value, updated_at = now()
    where id = current_price.id returning * into current_price;
  else
    if found then
      update commerce.price_list_items set valid_to = current_date - 1, updated_at = now() where id = current_price.id;
    end if;
    insert into commerce.price_list_items (
      workspace_id, price_list_id, product_id, unit_price, minimum_quantity, valid_from
    ) values (
      workspace_value, price_list_value, product_value, price_value, minimum_value, current_date
    ) returning * into current_price;
  end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'price_set', 'price_list_item', current_price.id, to_jsonb(current_price));
  return to_jsonb(current_price);
end;
$$;

create or replace function public.donaanna_upsert_party(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  target_id uuid := nullif(p_payload->>'id', '')::uuid;
  party_row commerce.parties%rowtype;
  roles_value text[];
begin
  select coalesce(array_agg(value), array['customer']::text[]) into roles_value
  from jsonb_array_elements_text(coalesce(p_payload->'roles', '["customer"]'::jsonb));
  if nullif(trim(p_payload->>'name'), '') is null then raise exception 'Party name is required'; end if;
  if target_id is null then
    insert into commerce.parties (
      workspace_id, organization_id, billing_customer_id, party_type, name, roles,
      registration_number, vat_number, country_code, email, phone, default_price_list_id, metadata
    ) values (
      workspace_value, nullif(p_payload->>'organizationId', '')::uuid,
      nullif(p_payload->>'billingCustomerId', '')::uuid,
      coalesce(nullif(p_payload->>'partyType', ''), 'company'), trim(p_payload->>'name'), roles_value,
      nullif(trim(p_payload->>'registrationNumber'), ''), nullif(trim(p_payload->>'vatNumber'), ''),
      nullif(upper(trim(p_payload->>'countryCode')), ''), nullif(trim(p_payload->>'email'), ''),
      nullif(trim(p_payload->>'phone'), ''), nullif(p_payload->>'defaultPriceListId', '')::uuid,
      coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into party_row;
  else
    update commerce.parties set
      organization_id = nullif(p_payload->>'organizationId', '')::uuid,
      billing_customer_id = nullif(p_payload->>'billingCustomerId', '')::uuid,
      party_type = coalesce(nullif(p_payload->>'partyType', ''), party_type),
      name = trim(p_payload->>'name'), roles = roles_value,
      registration_number = nullif(trim(p_payload->>'registrationNumber'), ''),
      vat_number = nullif(trim(p_payload->>'vatNumber'), ''),
      country_code = nullif(upper(trim(p_payload->>'countryCode')), ''),
      email = nullif(trim(p_payload->>'email'), ''), phone = nullif(trim(p_payload->>'phone'), ''),
      default_price_list_id = nullif(p_payload->>'defaultPriceListId', '')::uuid,
      metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb), updated_at = now()
    where id = target_id and workspace_id = workspace_value returning * into party_row;
    if not found then raise exception 'Party not found'; end if;
  end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, case when target_id is null then 'party_created' else 'party_updated' end, 'party', party_row.id, to_jsonb(party_row));
  return to_jsonb(party_row);
end;
$$;

create or replace function public.donaanna_upsert_warehouse(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  target_id uuid := nullif(p_payload->>'id', '')::uuid;
  warehouse_row inventory.warehouses%rowtype;
begin
  if nullif(trim(p_payload->>'code'), '') is null or nullif(trim(p_payload->>'name'), '') is null then
    raise exception 'Warehouse code and name are required';
  end if;
  if target_id is null then
    insert into inventory.warehouses (
      workspace_id, owner_organization_id, code, name, warehouse_type, country_code, status, address, metadata
    ) values (
      workspace_value, nullif(p_payload->>'ownerOrganizationId', '')::uuid,
      lower(trim(p_payload->>'code')), trim(p_payload->>'name'),
      coalesce(nullif(p_payload->>'warehouseType', ''), 'main'),
      nullif(upper(trim(p_payload->>'countryCode')), ''),
      coalesce(nullif(p_payload->>'status', ''), 'planned'),
      p_payload->'address', coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into warehouse_row;
  else
    update inventory.warehouses set
      owner_organization_id = nullif(p_payload->>'ownerOrganizationId', '')::uuid,
      code = lower(trim(p_payload->>'code')), name = trim(p_payload->>'name'),
      warehouse_type = coalesce(nullif(p_payload->>'warehouseType', ''), warehouse_type),
      country_code = nullif(upper(trim(p_payload->>'countryCode')), ''),
      status = coalesce(nullif(p_payload->>'status', ''), status),
      address = p_payload->'address', metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb),
      updated_at = now()
    where id = target_id and workspace_id = workspace_value returning * into warehouse_row;
    if not found then raise exception 'Warehouse not found'; end if;
  end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, case when target_id is null then 'warehouse_created' else 'warehouse_updated' end, 'warehouse', warehouse_row.id, to_jsonb(warehouse_row));
  return to_jsonb(warehouse_row);
end;
$$;

create or replace function public.donaanna_upsert_lot(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  target_id uuid := nullif(p_payload->>'id', '')::uuid;
  lot_row inventory.lots%rowtype;
begin
  if nullif(p_payload->>'productId', '') is null or nullif(trim(p_payload->>'lotNumber'), '') is null then
    raise exception 'Product and lot number are required';
  end if;
  perform 1 from commerce.products where id = (p_payload->>'productId')::uuid and workspace_id = workspace_value;
  if not found then raise exception 'Product not found in workspace'; end if;
  if target_id is null then
    insert into inventory.lots (
      workspace_id, product_id, owner_organization_id, lot_number, status, harvest_year,
      harvest_date, production_date, bottling_date, best_before_date, origin_country_code,
      olive_variety, organic_status, quality_data, metadata
    ) values (
      workspace_value, (p_payload->>'productId')::uuid, nullif(p_payload->>'ownerOrganizationId', '')::uuid,
      trim(p_payload->>'lotNumber'), coalesce(nullif(p_payload->>'status', ''), 'planned'),
      nullif(p_payload->>'harvestYear', '')::integer, nullif(p_payload->>'harvestDate', '')::date,
      nullif(p_payload->>'productionDate', '')::date, nullif(p_payload->>'bottlingDate', '')::date,
      nullif(p_payload->>'bestBeforeDate', '')::date, nullif(upper(trim(p_payload->>'originCountryCode')), ''),
      nullif(trim(p_payload->>'oliveVariety'), ''), nullif(trim(p_payload->>'organicStatus'), ''),
      coalesce(p_payload->'qualityData', '{}'::jsonb), coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into lot_row;
  else
    update inventory.lots set
      owner_organization_id = nullif(p_payload->>'ownerOrganizationId', '')::uuid,
      lot_number = trim(p_payload->>'lotNumber'), status = coalesce(nullif(p_payload->>'status', ''), status),
      harvest_year = nullif(p_payload->>'harvestYear', '')::integer,
      harvest_date = nullif(p_payload->>'harvestDate', '')::date,
      production_date = nullif(p_payload->>'productionDate', '')::date,
      bottling_date = nullif(p_payload->>'bottlingDate', '')::date,
      best_before_date = nullif(p_payload->>'bestBeforeDate', '')::date,
      origin_country_code = nullif(upper(trim(p_payload->>'originCountryCode')), ''),
      olive_variety = nullif(trim(p_payload->>'oliveVariety'), ''),
      organic_status = nullif(trim(p_payload->>'organicStatus'), ''),
      quality_data = coalesce(p_payload->'qualityData', quality_data),
      metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb), updated_at = now()
    where id = target_id and workspace_id = workspace_value returning * into lot_row;
    if not found then raise exception 'Lot not found'; end if;
  end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, case when target_id is null then 'lot_created' else 'lot_updated' end, 'lot', lot_row.id, to_jsonb(lot_row));
  return to_jsonb(lot_row);
end;
$$;

create or replace function public.donaanna_adjust_inventory(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  product_value uuid := nullif(p_payload->>'productId', '')::uuid;
  lot_value uuid := nullif(p_payload->>'lotId', '')::uuid;
  warehouse_value uuid := nullif(p_payload->>'warehouseId', '')::uuid;
  quantity_value numeric(18,4) := nullif(p_payload->>'quantity', '')::numeric;
  movement_kind text;
  movement_row inventory.movements%rowtype;
  available_value numeric(18,4);
begin
  if product_value is null or warehouse_value is null or quantity_value is null or quantity_value = 0 then
    raise exception 'Product, warehouse and a non-zero quantity are required';
  end if;
  perform 1 from commerce.products product
  join inventory.warehouses warehouse on warehouse.id = warehouse_value and warehouse.workspace_id = workspace_value
  where product.id = product_value and product.workspace_id = workspace_value;
  if not found then raise exception 'Product or warehouse not found in workspace'; end if;
  if lot_value is not null then
    perform 1 from inventory.lots where id = lot_value and product_id = product_value and workspace_id = workspace_value;
    if not found then raise exception 'Lot does not belong to product'; end if;
  end if;
  if quantity_value < 0 then
    perform pg_advisory_xact_lock(hashtextextended(warehouse_value::text || ':' || product_value::text || ':' || coalesce(lot_value::text, ''), 0));
    select coalesce(sum(available), 0) into available_value from inventory.available_stock
    where workspace_id = workspace_value and warehouse_id = warehouse_value
      and product_id = product_value and lot_id is not distinct from lot_value
      and (nullif(p_payload->>'ownerOrganizationId', '') is null
        or owner_organization_id = nullif(p_payload->>'ownerOrganizationId', '')::uuid);
    if available_value < abs(quantity_value) then
      raise exception 'Adjustment would create negative available stock: available %, requested %', available_value, abs(quantity_value);
    end if;
  end if;
  movement_kind := case when quantity_value > 0 then 'adjustment_in' else 'adjustment_out' end;
  insert into inventory.movements (
    workspace_id, owner_organization_id, product_id, lot_id, warehouse_id, movement_type,
    quantity, unit_cost, currency, source_type, idempotency_key, reason, created_by_email
  ) values (
    workspace_value, nullif(p_payload->>'ownerOrganizationId', '')::uuid,
    product_value, lot_value, warehouse_value, movement_kind, quantity_value,
    coalesce(nullif(p_payload->>'unitCost', '')::numeric, 0),
    upper(coalesce(nullif(p_payload->>'currency', ''), 'EUR')), 'manual_adjustment',
    nullif(p_payload->>'idempotencyKey', ''), coalesce(nullif(trim(p_payload->>'reason'), ''), 'Manuell lagerjustering'),
    p_actor_email
  ) returning * into movement_row;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'inventory_adjusted', 'inventory_movement', movement_row.id, to_jsonb(movement_row));
  return to_jsonb(movement_row);
end;
$$;

create or replace function public.donaanna_create_order(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, integrations, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  order_type_value text := coalesce(nullif(p_payload->>'orderType', ''), 'sale');
  seller_value uuid := nullif(p_payload->>'sellerOrganizationId', '')::uuid;
  buyer_value uuid := nullif(p_payload->>'buyerOrganizationId', '')::uuid;
  idempotency_value text := nullif(p_payload->>'idempotencyKey', '');
  line_payload jsonb;
  product_row commerce.products%rowtype;
  order_row commerce.orders%rowtype;
  existing_order commerce.orders%rowtype;
  line_position integer := 0;
  quantity_value numeric(18,4);
  unit_price_value numeric(18,4);
  unit_cost_value numeric(18,4);
  discount_value numeric(7,4);
  tax_value numeric(7,4);
  line_net_value numeric(18,2);
  line_tax_value numeric(18,2);
  subtotal_value numeric(18,2) := 0;
  discount_total_value numeric(18,2) := 0;
  tax_total_value numeric(18,2) := 0;
  total_value numeric(18,2) := 0;
  target_number text;
begin
  if workspace_value is null then raise exception 'Workspace not found'; end if;
  if order_type_value not in ('sale', 'purchase', 'intercompany_sale', 'intercompany_purchase', 'pos') then
    raise exception 'Unsupported order type';
  end if;
  if jsonb_typeof(coalesce(p_payload->'lines', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) = 0 then
    raise exception 'An order requires at least one line';
  end if;
  if idempotency_value is not null then
    select * into existing_order from commerce.orders
    where workspace_id = workspace_value and idempotency_key = idempotency_value;
    if found then return to_jsonb(existing_order); end if;
  end if;
  if nullif(p_payload->>'warehouseId', '') is not null then
    perform 1 from inventory.warehouses where id = (p_payload->>'warehouseId')::uuid and workspace_id = workspace_value;
    if not found then raise exception 'Warehouse does not belong to workspace'; end if;
  end if;
  target_number := commerce.next_order_number(
    workspace_value,
    case when order_type_value in ('purchase', 'intercompany_purchase') then buyer_value else seller_value end,
    order_type_value,
    coalesce(nullif(p_payload->>'orderedAt', '')::timestamptz, now())
  );
  insert into commerce.orders (
    workspace_id, brand_id, order_number, order_type, seller_organization_id,
    buyer_organization_id, party_id, sales_rep_party_id, billing_customer_id,
    warehouse_id, destination_warehouse_id, pos_session_id, related_order_id,
    intercompany_transaction_id, sales_channel, ordered_at, requested_delivery_date,
    currency, commission_rule_id, idempotency_key, notes, metadata, created_by_email
  ) values (
    workspace_value,
    coalesce(nullif(p_payload->>'brandId', '')::uuid, 'd0aa0000-0000-4000-8000-000000000002'::uuid),
    target_number, order_type_value, seller_value, buyer_value,
    nullif(p_payload->>'partyId', '')::uuid, nullif(p_payload->>'salesRepPartyId', '')::uuid,
    nullif(p_payload->>'billingCustomerId', '')::uuid, nullif(p_payload->>'warehouseId', '')::uuid,
    nullif(p_payload->>'destinationWarehouseId', '')::uuid, nullif(p_payload->>'posSessionId', '')::uuid,
    nullif(p_payload->>'relatedOrderId', '')::uuid, nullif(p_payload->>'intercompanyTransactionId', '')::uuid,
    coalesce(nullif(p_payload->>'salesChannel', ''), case when order_type_value = 'pos' then 'pos' else 'admin' end),
    coalesce(nullif(p_payload->>'orderedAt', '')::timestamptz, now()),
    nullif(p_payload->>'requestedDeliveryDate', '')::date,
    upper(coalesce(nullif(p_payload->>'currency', ''), 'EUR')),
    nullif(p_payload->>'commissionRuleId', '')::uuid, idempotency_value,
    nullif(trim(p_payload->>'notes'), ''), coalesce(p_payload->'metadata', '{}'::jsonb), p_actor_email
  ) returning * into order_row;

  for line_payload in select value from jsonb_array_elements(p_payload->'lines') loop
    line_position := line_position + 1;
    select * into product_row from commerce.products
    where id = nullif(line_payload->>'productId', '')::uuid and workspace_id = workspace_value and active;
    if not found then raise exception 'Product on line % was not found', line_position; end if;
    quantity_value := nullif(line_payload->>'quantity', '')::numeric;
    unit_price_value := coalesce(nullif(line_payload->>'unitPrice', '')::numeric, 0);
    unit_cost_value := coalesce(nullif(line_payload->>'unitCost', '')::numeric, 0);
    discount_value := coalesce(nullif(line_payload->>'discountPercent', '')::numeric, 0);
    tax_value := coalesce(nullif(line_payload->>'taxRate', '')::numeric, 0);
    if quantity_value is null or quantity_value <= 0 or unit_price_value < 0 or unit_cost_value < 0
      or discount_value not between 0 and 100 or tax_value not between 0 and 100 then
      raise exception 'Invalid values on order line %', line_position;
    end if;
    if nullif(line_payload->>'lotId', '') is not null then
      perform 1 from inventory.lots
      where id = (line_payload->>'lotId')::uuid and product_id = product_row.id and workspace_id = workspace_value;
      if not found then raise exception 'Lot on line % does not belong to product', line_position; end if;
    end if;
    line_net_value := round(quantity_value * unit_price_value * (1 - discount_value / 100), 2);
    line_tax_value := round(line_net_value * tax_value / 100, 2);
    subtotal_value := subtotal_value + round(quantity_value * unit_price_value, 2);
    discount_total_value := discount_total_value + round(quantity_value * unit_price_value, 2) - line_net_value;
    tax_total_value := tax_total_value + line_tax_value;
    total_value := total_value + line_net_value + line_tax_value;
    insert into commerce.order_lines (
      workspace_id, order_id, position, product_id, lot_id, description, quantity,
      unit, unit_price, unit_cost, discount_percent, tax_rate, line_net, line_tax, line_total
    ) values (
      workspace_value, order_row.id, line_position, product_row.id,
      nullif(line_payload->>'lotId', '')::uuid,
      coalesce(nullif(trim(line_payload->>'description'), ''), product_row.name), quantity_value,
      coalesce(nullif(line_payload->>'unit', ''), product_row.unit), unit_price_value, unit_cost_value,
      discount_value, tax_value, line_net_value, line_tax_value, line_net_value + line_tax_value
    );
  end loop;

  update commerce.orders set
    subtotal = subtotal_value, discount_total = discount_total_value,
    tax_total = tax_total_value, total = total_value, updated_at = now()
  where id = order_row.id returning * into order_row;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'order_created', 'order', order_row.id, to_jsonb(order_row));
  insert into integrations.outbox_events (workspace_id, aggregate_type, aggregate_id, event_type, payload)
  values (workspace_value, 'order', order_row.id, 'order.created', jsonb_build_object('orderId', order_row.id, 'orderNumber', order_row.order_number));
  return to_jsonb(order_row);
end;
$$;

create or replace function public.donaanna_order_action(
  p_order_id uuid,
  p_action text,
  p_payload jsonb,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, integrations, pg_temp
as $$
declare
  order_row commerce.orders%rowtype;
  line_row commerce.order_lines%rowtype;
  product_row commerce.products%rowtype;
  rule_row commerce.commission_rules%rowtype;
  available_value numeric(18,4);
  paid_value numeric(18,2);
  payment_amount numeric(18,2);
  movement_sign integer;
  movement_kind text;
  basis_value numeric(18,2);
  commission_value numeric(18,2);
begin
  select * into order_row from commerce.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  if p_action = 'confirm' then
    if order_row.status <> 'draft' then raise exception 'Only draft orders can be confirmed'; end if;
    if order_row.order_type in ('sale', 'intercompany_sale', 'pos') and order_row.seller_organization_id is null then
      raise exception 'A legal seller is required before confirmation';
    end if;
    if order_row.order_type in ('purchase', 'intercompany_purchase') and order_row.buyer_organization_id is null then
      raise exception 'A legal buyer is required before confirmation';
    end if;
    if order_row.order_type in ('intercompany_sale', 'intercompany_purchase')
      and (order_row.seller_organization_id is null or order_row.buyer_organization_id is null) then
      raise exception 'Intercompany orders require both legal seller and legal buyer';
    end if;
    if order_row.warehouse_id is null then raise exception 'A warehouse is required before confirmation'; end if;
    if order_row.order_type = 'pos' then
      perform 1 from commerce.pos_sessions where id = order_row.pos_session_id and status = 'open';
      if not found then raise exception 'An open POS session is required'; end if;
    end if;
    update commerce.orders set status = 'confirmed', updated_at = now() where id = order_row.id returning * into order_row;

  elsif p_action = 'reserve' then
    if order_row.order_type not in ('sale', 'intercompany_sale', 'pos') then raise exception 'Only outbound orders reserve stock'; end if;
    if order_row.status <> 'confirmed' then raise exception 'Order must be confirmed before reservation'; end if;
    for line_row in select * from commerce.order_lines where order_id = order_row.id order by position for update loop
      select * into product_row from commerce.products where id = line_row.product_id;
      if product_row.track_lots and line_row.lot_id is null then raise exception 'Lot is required for %', product_row.name; end if;
      perform pg_advisory_xact_lock(hashtextextended(order_row.warehouse_id::text || ':' || line_row.product_id::text || ':' || coalesce(line_row.lot_id::text, ''), 0));
      select coalesce(sum(available), 0) into available_value from inventory.available_stock
      where workspace_id = order_row.workspace_id and warehouse_id = order_row.warehouse_id
        and product_id = line_row.product_id and lot_id is not distinct from line_row.lot_id;
      if available_value < line_row.quantity then
        raise exception 'Insufficient available stock for %: available %, required %', product_row.name, available_value, line_row.quantity;
      end if;
      insert into inventory.reservations (
        workspace_id, order_id, order_line_id, product_id, lot_id, warehouse_id, quantity, expires_at
      ) values (
        order_row.workspace_id, order_row.id, line_row.id, line_row.product_id, line_row.lot_id,
        order_row.warehouse_id, line_row.quantity, now() + interval '7 days'
      ) on conflict (order_line_id, lot_id, warehouse_id) do update
        set quantity = excluded.quantity, status = 'active', expires_at = excluded.expires_at, updated_at = now();
    end loop;
    update commerce.orders set status = 'reserved', updated_at = now() where id = order_row.id returning * into order_row;

  elsif p_action = 'fulfill' then
    if order_row.order_type in ('sale', 'intercompany_sale') and order_row.status <> 'reserved' then
      raise exception 'Outbound order must be reserved before fulfillment';
    end if;
    if order_row.order_type = 'pos' and order_row.status not in ('confirmed', 'reserved') then
      raise exception 'POS order must be confirmed before fulfillment';
    end if;
    if order_row.order_type in ('purchase', 'intercompany_purchase') and order_row.status <> 'confirmed' then
      raise exception 'Purchase order must be confirmed before receipt';
    end if;
    movement_sign := case when order_row.order_type in ('purchase', 'intercompany_purchase') then 1 else -1 end;
    movement_kind := case when movement_sign = 1 then 'receipt' else 'shipment' end;
    for line_row in select * from commerce.order_lines where order_id = order_row.id order by position for update loop
      select * into product_row from commerce.products where id = line_row.product_id;
      if product_row.track_lots and line_row.lot_id is null then raise exception 'Lot is required for %', product_row.name; end if;
      if order_row.order_type = 'pos' and order_row.status = 'confirmed' then
        perform pg_advisory_xact_lock(hashtextextended(order_row.warehouse_id::text || ':' || line_row.product_id::text || ':' || coalesce(line_row.lot_id::text, ''), 0));
        select coalesce(sum(available), 0) into available_value from inventory.available_stock
        where workspace_id = order_row.workspace_id and warehouse_id = order_row.warehouse_id
          and product_id = line_row.product_id and lot_id is not distinct from line_row.lot_id;
        if available_value < line_row.quantity then raise exception 'Insufficient stock for %', product_row.name; end if;
      end if;
      insert into inventory.movements (
        workspace_id, owner_organization_id, product_id, lot_id, warehouse_id, movement_type,
        quantity, unit_cost, currency, source_type, source_id, idempotency_key, reason, created_by_email
      ) values (
        order_row.workspace_id,
        case when movement_sign = 1 then order_row.buyer_organization_id else order_row.seller_organization_id end,
        line_row.product_id, line_row.lot_id, order_row.warehouse_id, movement_kind,
        movement_sign * line_row.quantity, line_row.unit_cost, order_row.currency,
        'order', order_row.id, 'order-fulfill-' || line_row.id::text,
        case when movement_sign = 1 then 'Varemottak ' else 'Levering ' end || order_row.order_number,
        p_actor_email
      ) on conflict (workspace_id, idempotency_key) where idempotency_key is not null do nothing;
      update commerce.order_lines set fulfilled_quantity = quantity, updated_at = now() where id = line_row.id;
    end loop;
    update inventory.reservations set status = 'committed', updated_at = now()
    where order_id = order_row.id and status = 'active';
    update commerce.orders set status = 'fulfilled', updated_at = now() where id = order_row.id returning * into order_row;

    if order_row.commission_rule_id is not null and order_row.sales_rep_party_id is not null then
      select * into rule_row from commerce.commission_rules where id = order_row.commission_rule_id and active;
      if found then
        if rule_row.rule_type = 'fixed' then
          insert into commerce.commission_entries (
            workspace_id, order_id, beneficiary_party_id, rule_id, basis_amount, amount, currency, status, earned_at
          ) values (
            order_row.workspace_id, order_row.id, order_row.sales_rep_party_id, rule_row.id,
            order_row.total, coalesce(rule_row.fixed_amount, 0), order_row.currency,
            case when rule_row.payable_event = 'fulfilled' then 'earned' else 'pending' end,
            case when rule_row.payable_event = 'fulfilled' then now() else null end
          ) on conflict (order_id, order_line_id, beneficiary_party_id) do nothing;
        elsif rule_row.rule_type in ('revenue_percent', 'margin_percent') then
          for line_row in select * from commerce.order_lines where order_id = order_row.id loop
            basis_value := case when rule_row.rule_type = 'margin_percent'
              then greatest(line_row.line_net - round(line_row.quantity * line_row.unit_cost, 2), 0)
              else line_row.line_net end;
            commission_value := round(basis_value * coalesce(rule_row.percentage, 0) / 100, 2);
            insert into commerce.commission_entries (
              workspace_id, order_id, order_line_id, beneficiary_party_id, rule_id,
              basis_amount, amount, currency, status, earned_at
            ) values (
              order_row.workspace_id, order_row.id, line_row.id, order_row.sales_rep_party_id, rule_row.id,
              basis_value, commission_value, order_row.currency,
              case when rule_row.payable_event = 'fulfilled' then 'earned' else 'pending' end,
              case when rule_row.payable_event = 'fulfilled' then now() else null end
            ) on conflict (order_id, order_line_id, beneficiary_party_id) do nothing;
          end loop;
        end if;
      end if;
    end if;

  elsif p_action = 'payment' then
    payment_amount := nullif(p_payload->>'amount', '')::numeric;
    if payment_amount is null or payment_amount <= 0 then raise exception 'A positive payment amount is required'; end if;
    insert into commerce.order_payments (
      workspace_id, order_id, payment_date, amount, currency, method, reference,
      external_payment_id, status, metadata, created_by_email
    ) values (
      order_row.workspace_id, order_row.id, coalesce(nullif(p_payload->>'paymentDate', '')::timestamptz, now()),
      payment_amount, order_row.currency, coalesce(nullif(p_payload->>'method', ''), 'cash'),
      nullif(p_payload->>'reference', ''), nullif(p_payload->>'externalPaymentId', ''),
      'captured', coalesce(p_payload->'metadata', '{}'::jsonb), p_actor_email
    );
    select coalesce(sum(amount), 0) into paid_value from commerce.order_payments
    where order_id = order_row.id and status = 'captured';
    update commerce.orders set payment_status = case when paid_value >= total then 'paid' else 'partially_paid' end, updated_at = now()
    where id = order_row.id returning * into order_row;
    if order_row.payment_status = 'paid' then
      update commerce.commission_entries entry set status = 'earned', earned_at = coalesce(earned_at, now()), updated_at = now()
      from commerce.commission_rules rule
      where entry.order_id = order_row.id and entry.rule_id = rule.id and rule.payable_event = 'paid' and entry.status = 'pending';
    end if;

  elsif p_action = 'cancel' then
    if order_row.status in ('fulfilled', 'returned') then raise exception 'Fulfilled orders must be returned, not cancelled'; end if;
    update inventory.reservations set status = 'released', updated_at = now()
    where order_id = order_row.id and status = 'active';
    update commerce.orders set status = 'cancelled', updated_at = now() where id = order_row.id returning * into order_row;
  else
    raise exception 'Unsupported order action';
  end if;

  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (order_row.workspace_id, p_actor_email, 'order_' || p_action, 'order', order_row.id, to_jsonb(order_row));
  insert into integrations.outbox_events (workspace_id, aggregate_type, aggregate_id, event_type, payload)
  values (order_row.workspace_id, 'order', order_row.id, 'order.' || p_action, jsonb_build_object('orderId', order_row.id, 'status', order_row.status, 'paymentStatus', order_row.payment_status));
  return to_jsonb(order_row);
end;
$$;

create or replace function public.donaanna_pos_action(p_action text, p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  session_row commerce.pos_sessions%rowtype;
  expected_value numeric(18,2);
  actual_value numeric(18,2);
begin
  if p_action = 'open' then
    if nullif(p_payload->>'organizationId', '') is null or nullif(p_payload->>'warehouseId', '') is null then
      raise exception 'Legal seller and warehouse are required to open POS';
    end if;
    insert into commerce.pos_sessions (
      workspace_id, organization_id, warehouse_id, session_number, opened_by_email, opening_cash, notes
    ) values (
      workspace_value, (p_payload->>'organizationId')::uuid, (p_payload->>'warehouseId')::uuid,
      'POSSHIFT-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || left(gen_random_uuid()::text, 4),
      p_actor_email, coalesce(nullif(p_payload->>'openingCash', '')::numeric, 0), nullif(trim(p_payload->>'notes'), '')
    ) returning * into session_row;
  elsif p_action = 'close' then
    select * into session_row from commerce.pos_sessions
    where id = nullif(p_payload->>'sessionId', '')::uuid and workspace_id = workspace_value and status = 'open' for update;
    if not found then raise exception 'Open POS session not found'; end if;
    select session_row.opening_cash + coalesce(sum(payment.amount), 0) into expected_value
    from commerce.order_payments payment
    join commerce.orders orders on orders.id = payment.order_id
    where orders.pos_session_id = session_row.id and payment.method = 'cash' and payment.status = 'captured';
    actual_value := nullif(p_payload->>'actualCash', '')::numeric;
    if actual_value is null or actual_value < 0 then raise exception 'Actual cash is required'; end if;
    update commerce.pos_sessions set
      status = 'closed', closed_at = now(), closed_by_email = p_actor_email,
      expected_cash = expected_value, actual_cash = actual_value, difference = actual_value - expected_value,
      notes = coalesce(nullif(trim(p_payload->>'notes'), ''), notes), updated_at = now()
    where id = session_row.id returning * into session_row;
  else
    raise exception 'Unsupported POS action';
  end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'pos_' || p_action, 'pos_session', session_row.id, to_jsonb(session_row));
  return to_jsonb(session_row);
end;
$$;

create or replace function public.donaanna_upsert_commission_rule(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  target_id uuid := nullif(p_payload->>'id', '')::uuid;
  rule_row commerce.commission_rules%rowtype;
begin
  if nullif(trim(p_payload->>'name'), '') is null then raise exception 'Commission rule name is required'; end if;
  if target_id is null then
    insert into commerce.commission_rules (
      workspace_id, organization_id, name, rule_type, percentage, fixed_amount,
      currency, payable_event, applies_to_channel, metadata
    ) values (
      workspace_value, nullif(p_payload->>'organizationId', '')::uuid, trim(p_payload->>'name'),
      coalesce(nullif(p_payload->>'ruleType', ''), 'margin_percent'),
      nullif(p_payload->>'percentage', '')::numeric, nullif(p_payload->>'fixedAmount', '')::numeric,
      nullif(upper(p_payload->>'currency'), ''), coalesce(nullif(p_payload->>'payableEvent', ''), 'paid'),
      coalesce(nullif(p_payload->>'appliesToChannel', ''), 'all'), coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning * into rule_row;
  else
    update commerce.commission_rules set
      organization_id = nullif(p_payload->>'organizationId', '')::uuid,
      name = trim(p_payload->>'name'), rule_type = coalesce(nullif(p_payload->>'ruleType', ''), rule_type),
      percentage = nullif(p_payload->>'percentage', '')::numeric,
      fixed_amount = nullif(p_payload->>'fixedAmount', '')::numeric,
      currency = nullif(upper(p_payload->>'currency'), ''),
      payable_event = coalesce(nullif(p_payload->>'payableEvent', ''), payable_event),
      applies_to_channel = coalesce(nullif(p_payload->>'appliesToChannel', ''), applies_to_channel),
      metadata = metadata || coalesce(p_payload->'metadata', '{}'::jsonb), updated_at = now()
    where id = target_id and workspace_id = workspace_value returning * into rule_row;
    if not found then raise exception 'Commission rule not found'; end if;
  end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, case when target_id is null then 'commission_rule_created' else 'commission_rule_updated' end, 'commission_rule', rule_row.id, to_jsonb(rule_row));
  return to_jsonb(rule_row);
end;
$$;

create or replace function public.donaanna_create_return(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, integrations, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  return_row commerce.returns%rowtype;
  line_payload jsonb;
  line_row commerce.order_lines%rowtype;
  product_value uuid;
  lot_value uuid;
  quantity_value numeric(18,4);
  warehouse_value uuid := nullif(p_payload->>'warehouseId', '')::uuid;
  disposition_value text;
  return_line_value uuid;
  available_value numeric(18,4);
begin
  if nullif(trim(p_payload->>'reason'), '') is null or warehouse_value is null then
    raise exception 'Return reason and warehouse are required';
  end if;
  if jsonb_array_length(coalesce(p_payload->'lines', '[]'::jsonb)) = 0 then raise exception 'Return lines are required'; end if;
  insert into commerce.returns (
    workspace_id, order_id, return_number, return_type, status, reason,
    refund_amount, currency, received_warehouse_id, created_by_email
  ) values (
    workspace_value, nullif(p_payload->>'orderId', '')::uuid,
    'RET-' || to_char(now(), 'YYYYMMDD') || '-' || upper(left(gen_random_uuid()::text, 6)),
    coalesce(nullif(p_payload->>'returnType', ''), 'customer_return'), 'received', trim(p_payload->>'reason'),
    coalesce(nullif(p_payload->>'refundAmount', '')::numeric, 0), upper(coalesce(nullif(p_payload->>'currency', ''), 'EUR')),
    warehouse_value, p_actor_email
  ) returning * into return_row;
  for line_payload in select value from jsonb_array_elements(p_payload->'lines') loop
    if nullif(line_payload->>'orderLineId', '') is not null then
      select * into line_row from commerce.order_lines
      where id = (line_payload->>'orderLineId')::uuid and workspace_id = workspace_value;
      if not found then raise exception 'Return order line not found'; end if;
      product_value := line_row.product_id;
      lot_value := coalesce(nullif(line_payload->>'lotId', '')::uuid, line_row.lot_id);
    else
      product_value := nullif(line_payload->>'productId', '')::uuid;
      lot_value := nullif(line_payload->>'lotId', '')::uuid;
    end if;
    quantity_value := nullif(line_payload->>'quantity', '')::numeric;
    disposition_value := coalesce(nullif(line_payload->>'disposition', ''), 'quarantine');
    if product_value is null or quantity_value is null or quantity_value <= 0 then raise exception 'Invalid return line'; end if;
    insert into commerce.return_lines (
      workspace_id, return_id, order_line_id, product_id, lot_id, quantity, disposition
    ) values (
      workspace_value, return_row.id, nullif(line_payload->>'orderLineId', '')::uuid,
      product_value, lot_value, quantity_value, disposition_value
    ) returning id into return_line_value;
    if return_row.return_type = 'customer_return' and disposition_value in ('restock', 'quarantine') then
      insert into inventory.movements (
        workspace_id, product_id, lot_id, warehouse_id, movement_type, quantity,
        currency, source_type, source_id, idempotency_key, reason, created_by_email
      ) values (
        workspace_value, product_value, lot_value, warehouse_value, 'return_in', quantity_value,
        return_row.currency, 'return', return_row.id,
        'return-' || return_row.id::text || '-' || return_line_value::text,
        return_row.reason, p_actor_email
      ) on conflict (workspace_id, idempotency_key) where idempotency_key is not null do nothing;
      if disposition_value = 'quarantine' and lot_value is not null then
        update inventory.lots set status = 'quarantine', updated_at = now() where id = lot_value;
      end if;
    elsif return_row.return_type = 'supplier_return' then
      perform pg_advisory_xact_lock(hashtextextended(warehouse_value::text || ':' || product_value::text || ':' || coalesce(lot_value::text, ''), 0));
      select coalesce(sum(available), 0) into available_value from inventory.available_stock
      where workspace_id = workspace_value and warehouse_id = warehouse_value
        and product_id = product_value and lot_id is not distinct from lot_value;
      if available_value < quantity_value then raise exception 'Insufficient available stock for supplier return'; end if;
      insert into inventory.movements (
        workspace_id, product_id, lot_id, warehouse_id, movement_type, quantity,
        currency, source_type, source_id, idempotency_key, reason, created_by_email
      ) values (
        workspace_value, product_value, lot_value, warehouse_value, 'return_out', -quantity_value,
        return_row.currency, 'return', return_row.id,
        'return-' || return_row.id::text || '-' || return_line_value::text,
        return_row.reason, p_actor_email
      ) on conflict (workspace_id, idempotency_key) where idempotency_key is not null do nothing;
    end if;
  end loop;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'return_received', 'return', return_row.id, to_jsonb(return_row));
  insert into integrations.outbox_events (workspace_id, aggregate_type, aggregate_id, event_type, payload)
  values (workspace_value, 'return', return_row.id, 'return.received', to_jsonb(return_row));
  return to_jsonb(return_row);
end;
$$;

create or replace function public.donaanna_create_recall(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, integrations, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  lot_value uuid := nullif(p_payload->>'lotId', '')::uuid;
  recall_row inventory.recalls%rowtype;
begin
  perform 1 from inventory.lots where id = lot_value and workspace_id = workspace_value;
  if not found then raise exception 'Lot not found'; end if;
  if nullif(trim(p_payload->>'reason'), '') is null then raise exception 'Recall reason is required'; end if;
  insert into inventory.recalls (
    workspace_id, recall_number, lot_id, status, risk_level, reason, instructions, created_by_email, metadata
  ) values (
    workspace_value, 'RCL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(left(gen_random_uuid()::text, 6)),
    lot_value, coalesce(nullif(p_payload->>'status', ''), 'open'),
    coalesce(nullif(p_payload->>'riskLevel', ''), 'precautionary'), trim(p_payload->>'reason'),
    nullif(trim(p_payload->>'instructions'), ''), p_actor_email, coalesce(p_payload->'metadata', '{}'::jsonb)
  ) returning * into recall_row;
  update inventory.lots set status = 'recalled', updated_at = now() where id = lot_value;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'recall_opened', 'recall', recall_row.id, to_jsonb(recall_row));
  insert into integrations.outbox_events (workspace_id, aggregate_type, aggregate_id, event_type, payload)
  values (workspace_value, 'recall', recall_row.id, 'recall.opened', to_jsonb(recall_row));
  return to_jsonb(recall_row);
end;
$$;

create or replace function public.donaanna_record_landed_cost(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, inventory, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  order_value uuid := nullif(p_payload->>'purchaseOrderId', '')::uuid;
  cost_row inventory.landed_costs%rowtype;
  line_row commerce.order_lines%rowtype;
  total_basis numeric(18,4);
  line_basis numeric(18,4);
  allocated_value numeric(18,2);
begin
  perform 1 from commerce.orders where id = order_value and workspace_id = workspace_value
    and order_type in ('purchase', 'intercompany_purchase');
  if not found then raise exception 'Purchase order not found'; end if;
  if coalesce(nullif(p_payload->>'allocationMethod', ''), 'quantity') not in ('quantity', 'value') then
    raise exception 'Only quantity and value allocation are supported';
  end if;
  insert into inventory.landed_costs (
    workspace_id, purchase_order_id, cost_type, supplier_party_id, amount, currency,
    exchange_rate, allocation_method, document_reference, notes, created_by_email
  ) values (
    workspace_value, order_value, coalesce(nullif(p_payload->>'costType', ''), 'freight'),
    nullif(p_payload->>'supplierPartyId', '')::uuid, nullif(p_payload->>'amount', '')::numeric,
    upper(coalesce(nullif(p_payload->>'currency', ''), 'EUR')),
    coalesce(nullif(p_payload->>'exchangeRate', '')::numeric, 1),
    coalesce(nullif(p_payload->>'allocationMethod', ''), 'quantity'),
    nullif(trim(p_payload->>'documentReference'), ''), nullif(trim(p_payload->>'notes'), ''), p_actor_email
  ) returning * into cost_row;
  select sum(case cost_row.allocation_method when 'value' then line_net else quantity end)
  into total_basis from commerce.order_lines where order_id = order_value;
  if coalesce(total_basis, 0) <= 0 then raise exception 'Order has no allocation basis'; end if;
  for line_row in select * from commerce.order_lines where order_id = order_value order by position loop
    line_basis := case cost_row.allocation_method when 'value' then line_row.line_net else line_row.quantity end;
    allocated_value := round(cost_row.amount * line_basis / total_basis, 2);
    insert into inventory.landed_cost_allocations (
      workspace_id, landed_cost_id, order_line_id, product_id, lot_id, allocated_amount, allocated_unit_cost
    ) values (
      workspace_value, cost_row.id, line_row.id, line_row.product_id, line_row.lot_id,
      allocated_value, case when line_row.quantity > 0 then allocated_value / line_row.quantity else 0 end
    );
  end loop;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'landed_cost_recorded', 'landed_cost', cost_row.id, to_jsonb(cost_row));
  return to_jsonb(cost_row);
end;
$$;

create or replace function public.donaanna_link_organization(p_payload jsonb, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  workspace_value uuid := commerce.workspace_id(coalesce(nullif(p_payload->>'workspaceSlug', ''), 'dona-anna'));
  link_row commerce.brand_organization_links%rowtype;
begin
  insert into commerce.brand_organization_links (
    workspace_id, brand_id, organization_id, role, market_country_code, valid_from, valid_to
  ) values (
    workspace_value, coalesce(nullif(p_payload->>'brandId', '')::uuid, 'd0aa0000-0000-4000-8000-000000000002'::uuid),
    (p_payload->>'organizationId')::uuid, p_payload->>'role', nullif(upper(p_payload->>'marketCountryCode'), ''),
    coalesce(nullif(p_payload->>'validFrom', '')::date, current_date), nullif(p_payload->>'validTo', '')::date
  ) returning * into link_row;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, after_data)
  values (workspace_value, p_actor_email, 'organization_linked', 'brand_organization_link', link_row.id, to_jsonb(link_row));
  return to_jsonb(link_row);
end;
$$;

create or replace function public.donaanna_prepare_invoice(p_order_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  order_row commerce.orders%rowtype;
begin
  select * into order_row from commerce.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if order_row.order_type not in ('sale', 'intercompany_sale') then raise exception 'Only sales orders can be invoiced'; end if;
  if order_row.seller_organization_id is null or order_row.billing_customer_id is null then
    raise exception 'Legal seller and billing customer are required';
  end if;
  if order_row.billing_document_id is not null then
    return jsonb_build_object('order', to_jsonb(order_row), 'existingDocumentId', order_row.billing_document_id);
  end if;
  return jsonb_build_object(
    'order', to_jsonb(order_row),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', null,
        'description', line.description,
        'quantity', line.quantity::text,
        'unit', line.unit,
        'unitPrice', line.unit_price::text,
        'discountPercent', line.discount_percent::text,
        'taxRuleId', null,
        'taxRate', line.tax_rate::text,
        'taxLabel', case when line.tax_rate > 0 then line.tax_rate::text || ' %' else null end,
        'legalText', null
      ) order by line.position)
      from commerce.order_lines line where line.order_id = order_row.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.donaanna_attach_billing_document(p_order_id uuid, p_document_id uuid, p_actor_email text)
returns void
language plpgsql
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  workspace_value uuid;
begin
  update commerce.orders set billing_document_id = p_document_id, updated_at = now()
  where id = p_order_id and billing_document_id is null returning workspace_id into workspace_value;
  if workspace_value is null then raise exception 'Order was not found or already invoiced'; end if;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, metadata)
  values (workspace_value, p_actor_email, 'billing_document_attached', 'order', p_order_id, jsonb_build_object('documentId', p_document_id));
end;
$$;

create or replace function public.donaanna_create_invoice_draft(p_order_id uuid, p_actor_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public, commerce, pg_temp
as $$
declare
  order_row commerce.orders%rowtype;
  customer_row public.billing_customers%rowtype;
  organization_row public.billing_organizations%rowtype;
  lines_value jsonb;
  document_value uuid;
  due_value date;
begin
  select * into order_row from commerce.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if order_row.billing_document_id is not null then
    return jsonb_build_object('documentId', order_row.billing_document_id, 'existing', true);
  end if;
  if order_row.order_type not in ('sale', 'intercompany_sale') or order_row.status = 'draft' then
    raise exception 'A confirmed sales order is required';
  end if;
  if order_row.seller_organization_id is null or order_row.billing_customer_id is null then
    raise exception 'Legal seller and billing customer are required';
  end if;
  select * into organization_row from public.billing_organizations
  where id = order_row.seller_organization_id and active;
  if not found then raise exception 'Billing organization is not active'; end if;
  select * into customer_row from public.billing_customers
  where id = order_row.billing_customer_id and organization_id = order_row.seller_organization_id and active;
  if not found then raise exception 'Billing customer does not belong to seller'; end if;
  due_value := current_date + coalesce(customer_row.payment_terms_days, organization_row.payment_terms_days, 14);
  select jsonb_agg(jsonb_build_object(
    'productId', null,
    'description', line.description,
    'quantity', line.quantity::text,
    'unit', line.unit,
    'unitPrice', line.unit_price::text,
    'discountPercent', line.discount_percent::text,
    'taxRuleId', null,
    'taxRate', line.tax_rate::text,
    'taxLabel', case when line.tax_rate > 0 then line.tax_rate::text || ' %' else null end,
    'legalText', null
  ) order by line.position) into lines_value
  from commerce.order_lines line where line.order_id = order_row.id;

  document_value := public.billing_save_draft(
    null,
    order_row.seller_organization_id,
    'invoice',
    order_row.billing_customer_id,
    jsonb_build_object(
      'issueDate', current_date::text,
      'deliveryDate', current_date::text,
      'dueDate', due_value::text,
      'currency', order_row.currency,
      'accountingCurrency', organization_row.default_currency,
      'exchangeRate', '1',
      'orderReference', order_row.order_number,
      'paymentTerms', coalesce(customer_row.payment_terms_days, organization_row.payment_terms_days, 14)::text || ' dager',
      'notes', order_row.notes
    ),
    lines_value,
    p_actor_email
  );
  update commerce.orders set billing_document_id = document_value, updated_at = now() where id = order_row.id;
  insert into commerce.audit_events (workspace_id, actor_email, action, resource_type, resource_id, metadata)
  values (order_row.workspace_id, p_actor_email, 'billing_document_attached', 'order', order_row.id, jsonb_build_object('documentId', document_value));
  return jsonb_build_object('documentId', document_value, 'existing', false);
end;
$$;

-- Public RPCs are server-only. PostgreSQL grants EXECUTE to PUBLIC by default,
-- so every signature is revoked explicitly before granting service_role.
revoke execute on function public.donaanna_snapshot(text) from public, anon, authenticated;
revoke execute on function public.donaanna_upsert_product(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_upsert_price_list(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_set_price(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_upsert_party(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_upsert_warehouse(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_upsert_lot(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_adjust_inventory(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_create_order(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_order_action(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_pos_action(text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_upsert_commission_rule(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_create_return(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_create_recall(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_record_landed_cost(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_link_organization(jsonb, text) from public, anon, authenticated;
revoke execute on function public.donaanna_prepare_invoice(uuid) from public, anon, authenticated;
revoke execute on function public.donaanna_attach_billing_document(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.donaanna_create_invoice_draft(uuid, text) from public, anon, authenticated;

grant execute on function public.donaanna_snapshot(text) to service_role;
grant execute on function public.donaanna_upsert_product(jsonb, text) to service_role;
grant execute on function public.donaanna_upsert_price_list(jsonb, text) to service_role;
grant execute on function public.donaanna_set_price(jsonb, text) to service_role;
grant execute on function public.donaanna_upsert_party(jsonb, text) to service_role;
grant execute on function public.donaanna_upsert_warehouse(jsonb, text) to service_role;
grant execute on function public.donaanna_upsert_lot(jsonb, text) to service_role;
grant execute on function public.donaanna_adjust_inventory(jsonb, text) to service_role;
grant execute on function public.donaanna_create_order(jsonb, text) to service_role;
grant execute on function public.donaanna_order_action(uuid, text, jsonb, text) to service_role;
grant execute on function public.donaanna_pos_action(text, jsonb, text) to service_role;
grant execute on function public.donaanna_upsert_commission_rule(jsonb, text) to service_role;
grant execute on function public.donaanna_create_return(jsonb, text) to service_role;
grant execute on function public.donaanna_create_recall(jsonb, text) to service_role;
grant execute on function public.donaanna_record_landed_cost(jsonb, text) to service_role;
grant execute on function public.donaanna_link_organization(jsonb, text) to service_role;
grant execute on function public.donaanna_prepare_invoice(uuid) to service_role;
grant execute on function public.donaanna_attach_billing_document(uuid, uuid, text) to service_role;
grant execute on function public.donaanna_create_invoice_draft(uuid, text) to service_role;

notify pgrst, 'reload schema';
