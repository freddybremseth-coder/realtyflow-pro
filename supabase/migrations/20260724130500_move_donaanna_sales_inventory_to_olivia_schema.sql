-- Move DonaAnna sales/inventory tables into the Olivia schema and lock legacy public copies.

create extension if not exists pgcrypto;
create schema if not exists olivia;
create schema if not exists olivia_private;

create or replace function olivia.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function olivia_private.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from olivia.user_profiles p
    where p.id = (select auth.uid())
      and p.role in ('farmer', 'super_admin')
  );
$$;

revoke all on function olivia_private.is_internal_user() from public, anon, authenticated;
grant execute on function olivia_private.is_internal_user() to authenticated, service_role;

create table if not exists olivia.donaanna_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  type text not null check (type in ('evoo_250', 'evoo_500', 'evoo_750', 'table_olives', 'gift_pack')),
  batch_code text,
  qr_slug text,
  unit_size text not null,
  units_in_stock integer not null default 0,
  reserved_units integer not null default 0,
  unit_cost_eur numeric not null default 0,
  retail_price_eur numeric not null default 0,
  wholesale_price_eur numeric not null default 0,
  reorder_level integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists olivia.donaanna_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'private' check (type in ('private', 'restaurant', 'shop', 'distributor', 'market')),
  contact text,
  email text,
  phone text,
  city text,
  country text default 'Spain',
  tax_id text,
  billing_address text,
  shipping_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists olivia.donaanna_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid references olivia.donaanna_customers(id) on delete set null,
  customer_name text not null,
  channel text not null default 'market' check (channel in ('market', 'b2b', 'online', 'restaurant', 'farm_direct', 'event')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'delivered', 'paid', 'cancelled')),
  order_date date not null default current_date,
  subtotal_eur numeric not null default 0,
  paid_amount_eur numeric not null default 0,
  payment_method text,
  delivery_method text,
  delivery_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists olivia.donaanna_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references olivia.donaanna_orders(id) on delete cascade,
  product_id uuid references olivia.donaanna_products(id) on delete set null,
  product_sku text,
  product_name text not null,
  batch_code text,
  quantity integer not null check (quantity > 0),
  unit_price_eur numeric not null default 0,
  unit_cost_eur numeric not null default 0,
  line_total_eur numeric generated always as (quantity * unit_price_eur) stored,
  gross_margin_eur numeric generated always as (quantity * (unit_price_eur - unit_cost_eur)) stored,
  created_at timestamptz not null default now()
);

create index if not exists olivia_donaanna_products_sku_idx on olivia.donaanna_products (sku);
create index if not exists olivia_donaanna_products_batch_code_idx on olivia.donaanna_products (batch_code);
create index if not exists olivia_donaanna_customers_type_idx on olivia.donaanna_customers (type);
create index if not exists olivia_donaanna_orders_order_date_idx on olivia.donaanna_orders (order_date desc);
create index if not exists olivia_donaanna_orders_status_idx on olivia.donaanna_orders (status);
create index if not exists olivia_donaanna_order_lines_order_id_idx on olivia.donaanna_order_lines (order_id);
create index if not exists olivia_donaanna_order_lines_product_id_idx on olivia.donaanna_order_lines (product_id);

do $migration$
begin
  if to_regclass('public.donaanna_products') is not null then
    insert into olivia.donaanna_products (
      id, sku, name, type, batch_code, qr_slug, unit_size,
      units_in_stock, reserved_units, unit_cost_eur, retail_price_eur,
      wholesale_price_eur, reorder_level, is_active, notes, created_at, updated_at
    )
    select
      id, sku, name, type, batch_code, qr_slug, unit_size,
      units_in_stock, reserved_units, unit_cost_eur, retail_price_eur,
      wholesale_price_eur, reorder_level, is_active, notes, created_at, updated_at
    from public.donaanna_products
    on conflict (id) do update
    set
      sku = excluded.sku,
      name = excluded.name,
      type = excluded.type,
      batch_code = excluded.batch_code,
      qr_slug = excluded.qr_slug,
      unit_size = excluded.unit_size,
      units_in_stock = excluded.units_in_stock,
      reserved_units = excluded.reserved_units,
      unit_cost_eur = excluded.unit_cost_eur,
      retail_price_eur = excluded.retail_price_eur,
      wholesale_price_eur = excluded.wholesale_price_eur,
      reorder_level = excluded.reorder_level,
      is_active = excluded.is_active,
      notes = excluded.notes,
      updated_at = excluded.updated_at;
  end if;

  if to_regclass('public.donaanna_customers') is not null then
    insert into olivia.donaanna_customers (
      id, name, type, contact, email, phone, city, country, tax_id,
      billing_address, shipping_address, notes, created_at, updated_at
    )
    select
      id, name, type, contact, email, phone, city, country, tax_id,
      billing_address, shipping_address, notes, created_at, updated_at
    from public.donaanna_customers
    on conflict (id) do update
    set
      name = excluded.name,
      type = excluded.type,
      contact = excluded.contact,
      email = excluded.email,
      phone = excluded.phone,
      city = excluded.city,
      country = excluded.country,
      tax_id = excluded.tax_id,
      billing_address = excluded.billing_address,
      shipping_address = excluded.shipping_address,
      notes = excluded.notes,
      updated_at = excluded.updated_at;
  end if;

  if to_regclass('public.donaanna_orders') is not null then
    insert into olivia.donaanna_orders (
      id, order_no, customer_id, customer_name, channel, status, order_date,
      subtotal_eur, paid_amount_eur, payment_method, delivery_method,
      delivery_date, notes, created_at, updated_at
    )
    select
      id, order_no, customer_id, customer_name, channel, status, order_date,
      subtotal_eur, paid_amount_eur, payment_method, delivery_method,
      delivery_date, notes, created_at, updated_at
    from public.donaanna_orders
    on conflict (id) do update
    set
      order_no = excluded.order_no,
      customer_id = excluded.customer_id,
      customer_name = excluded.customer_name,
      channel = excluded.channel,
      status = excluded.status,
      order_date = excluded.order_date,
      subtotal_eur = excluded.subtotal_eur,
      paid_amount_eur = excluded.paid_amount_eur,
      payment_method = excluded.payment_method,
      delivery_method = excluded.delivery_method,
      delivery_date = excluded.delivery_date,
      notes = excluded.notes,
      updated_at = excluded.updated_at;
  end if;

  if to_regclass('public.donaanna_order_lines') is not null then
    insert into olivia.donaanna_order_lines (
      id, order_id, product_id, product_sku, product_name, batch_code,
      quantity, unit_price_eur, unit_cost_eur, created_at
    )
    select
      id, order_id, product_id, product_sku, product_name, batch_code,
      quantity, unit_price_eur, unit_cost_eur, created_at
    from public.donaanna_order_lines
    on conflict (id) do update
    set
      order_id = excluded.order_id,
      product_id = excluded.product_id,
      product_sku = excluded.product_sku,
      product_name = excluded.product_name,
      batch_code = excluded.batch_code,
      quantity = excluded.quantity,
      unit_price_eur = excluded.unit_price_eur,
      unit_cost_eur = excluded.unit_cost_eur;
  end if;
end;
$migration$;

create or replace function olivia_private.recalculate_donaanna_order_totals(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update olivia.donaanna_orders
  set subtotal_eur = coalesce((
    select sum(line_total_eur)
    from olivia.donaanna_order_lines
    where order_id = target_order_id
  ), 0)
  where id = target_order_id;
end;
$$;

create or replace function olivia_private.recalculate_donaanna_order_totals_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform olivia_private.recalculate_donaanna_order_totals(old.order_id);
    return old;
  end if;
  perform olivia_private.recalculate_donaanna_order_totals(new.order_id);
  return new;
end;
$$;

revoke all on function olivia_private.recalculate_donaanna_order_totals(uuid) from public, anon, authenticated;
revoke all on function olivia_private.recalculate_donaanna_order_totals_trigger() from public, anon, authenticated;

drop trigger if exists trg_donaanna_products_updated_at on olivia.donaanna_products;
create trigger trg_donaanna_products_updated_at
before update on olivia.donaanna_products
for each row execute function olivia.set_updated_at();

drop trigger if exists trg_donaanna_customers_updated_at on olivia.donaanna_customers;
create trigger trg_donaanna_customers_updated_at
before update on olivia.donaanna_customers
for each row execute function olivia.set_updated_at();

drop trigger if exists trg_donaanna_orders_updated_at on olivia.donaanna_orders;
create trigger trg_donaanna_orders_updated_at
before update on olivia.donaanna_orders
for each row execute function olivia.set_updated_at();

drop trigger if exists trg_donaanna_order_lines_totals_insert on olivia.donaanna_order_lines;
create trigger trg_donaanna_order_lines_totals_insert
after insert or update on olivia.donaanna_order_lines
for each row execute function olivia_private.recalculate_donaanna_order_totals_trigger();

drop trigger if exists trg_donaanna_order_lines_totals_delete on olivia.donaanna_order_lines;
create trigger trg_donaanna_order_lines_totals_delete
after delete on olivia.donaanna_order_lines
for each row execute function olivia_private.recalculate_donaanna_order_totals_trigger();

alter table olivia.donaanna_products enable row level security;
alter table olivia.donaanna_customers enable row level security;
alter table olivia.donaanna_orders enable row level security;
alter table olivia.donaanna_order_lines enable row level security;

revoke all on olivia.donaanna_products from anon, authenticated;
revoke all on olivia.donaanna_customers from anon, authenticated;
revoke all on olivia.donaanna_orders from anon, authenticated;
revoke all on olivia.donaanna_order_lines from anon, authenticated;

grant select, insert, update, delete on olivia.donaanna_products to authenticated, service_role;
grant select, insert, update, delete on olivia.donaanna_customers to authenticated, service_role;
grant select, insert, update, delete on olivia.donaanna_orders to authenticated, service_role;
grant select, insert, update, delete on olivia.donaanna_order_lines to authenticated, service_role;

drop policy if exists olivia_donaanna_products_internal_all on olivia.donaanna_products;
create policy olivia_donaanna_products_internal_all
on olivia.donaanna_products
for all
to authenticated
using (olivia_private.is_internal_user())
with check (olivia_private.is_internal_user());

drop policy if exists olivia_donaanna_customers_internal_all on olivia.donaanna_customers;
create policy olivia_donaanna_customers_internal_all
on olivia.donaanna_customers
for all
to authenticated
using (olivia_private.is_internal_user())
with check (olivia_private.is_internal_user());

drop policy if exists olivia_donaanna_orders_internal_all on olivia.donaanna_orders;
create policy olivia_donaanna_orders_internal_all
on olivia.donaanna_orders
for all
to authenticated
using (olivia_private.is_internal_user())
with check (olivia_private.is_internal_user());

drop policy if exists olivia_donaanna_order_lines_internal_all on olivia.donaanna_order_lines;
create policy olivia_donaanna_order_lines_internal_all
on olivia.donaanna_order_lines
for all
to authenticated
using (olivia_private.is_internal_user())
with check (olivia_private.is_internal_user());

do $migration$
begin
  if to_regclass('public.donaanna_products') is not null then
    execute 'alter table public.donaanna_products enable row level security';
    execute 'drop policy if exists "Authenticated can manage DonaAnna products" on public.donaanna_products';
    execute 'drop policy if exists "Deny direct API access to legacy DonaAnna products" on public.donaanna_products';
    execute 'create policy "Deny direct API access to legacy DonaAnna products" on public.donaanna_products for all to anon, authenticated using (false) with check (false)';
  end if;

  if to_regclass('public.donaanna_customers') is not null then
    execute 'alter table public.donaanna_customers enable row level security';
    execute 'drop policy if exists "Authenticated can manage DonaAnna customers" on public.donaanna_customers';
    execute 'drop policy if exists "Deny direct API access to legacy DonaAnna customers" on public.donaanna_customers';
    execute 'create policy "Deny direct API access to legacy DonaAnna customers" on public.donaanna_customers for all to anon, authenticated using (false) with check (false)';
  end if;

  if to_regclass('public.donaanna_orders') is not null then
    execute 'alter table public.donaanna_orders enable row level security';
    execute 'drop policy if exists "Authenticated can manage DonaAnna orders" on public.donaanna_orders';
    execute 'drop policy if exists "Deny direct API access to legacy DonaAnna orders" on public.donaanna_orders';
    execute 'create policy "Deny direct API access to legacy DonaAnna orders" on public.donaanna_orders for all to anon, authenticated using (false) with check (false)';
  end if;

  if to_regclass('public.donaanna_order_lines') is not null then
    execute 'alter table public.donaanna_order_lines enable row level security';
    execute 'drop policy if exists "Authenticated can manage DonaAnna order lines" on public.donaanna_order_lines';
    execute 'drop policy if exists "Deny direct API access to legacy DonaAnna order lines" on public.donaanna_order_lines';
    execute 'create policy "Deny direct API access to legacy DonaAnna order lines" on public.donaanna_order_lines for all to anon, authenticated using (false) with check (false)';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
