-- RealtyFlow Billing Core
--
-- Multi-company sales documents with immutable issuance, atomic number series,
-- decimal server-side calculations, snapshots, payments and an audit trail.
-- All browser-facing access is protected by RLS. Privileged workflows are
-- exposed only to the server-side service role.

create extension if not exists pgcrypto;

create table public.billing_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  legal_name text not null,
  trading_name text,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  registration_number text,
  vat_number text,
  address_line_1 text,
  address_line_2 text,
  postal_code text,
  city text,
  region text,
  default_currency text not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  default_language text not null default 'no' check (default_language in ('no', 'en', 'es')),
  email text,
  phone text,
  website text,
  logo_path text,
  iban text,
  bic text,
  payment_terms_days integer not null default 14 check (payment_terms_days between 0 and 365),
  invoice_footer text,
  active boolean not null default true,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null,
  role text not null default 'viewer' check (role in ('owner', 'administrator', 'invoicing', 'accountant', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index billing_organization_users_email_key
  on public.billing_organization_users (organization_id, lower(user_email));
create unique index billing_organization_users_user_key
  on public.billing_organization_users (organization_id, user_id)
  where user_id is not null;

create table public.billing_organization_settings (
  organization_id uuid primary key references public.billing_organizations(id) on delete cascade,
  quote_validity_days integer not null default 30 check (quote_validity_days between 1 and 365),
  default_notes text,
  default_terms text,
  legal_texts jsonb not null default '{}'::jsonb,
  invoice_template text not null default 'classic',
  template_version integer not null default 1 check (template_version > 0),
  rounding_mode text not null default 'half_up' check (rounding_mode = 'half_up'),
  updated_at timestamptz not null default now()
);

create table public.billing_invoice_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_type text not null check (document_type in ('quote', 'proforma', 'invoice', 'credit_note')),
  fiscal_year integer not null check (fiscal_year between 2000 and 2200),
  prefix text not null,
  padding integer not null default 5 check (padding between 3 and 12),
  next_number bigint not null default 1 check (next_number > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_type, fiscal_year)
);

create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  name text not null,
  customer_type text not null default 'business' check (customer_type in ('private', 'business', 'public')),
  organization_number text,
  vat_number text,
  billing_address_line_1 text,
  billing_address_line_2 text,
  billing_postal_code text,
  billing_city text,
  billing_region text,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  delivery_address jsonb,
  language text not null default 'no' check (language in ('no', 'en', 'es')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  email text,
  phone text,
  contact_person text,
  payment_terms_days integer check (payment_terms_days between 0 and 365),
  notes text,
  vies_status text not null default 'unchecked' check (vies_status in ('unchecked', 'valid', 'invalid', 'unavailable')),
  vies_checked_at timestamptz,
  vies_response jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_customers_organization_name_idx
  on public.billing_customers (organization_id, lower(name));

create table public.billing_customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  customer_id uuid not null references public.billing_customers(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  supply_type text not null default 'service' check (supply_type in ('goods', 'service')),
  unit text not null default 'stk',
  unit_price numeric(18,4) not null default 0 check (unit_price >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  default_tax_rule_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index billing_products_sku_key
  on public.billing_products (organization_id, lower(sku)) where sku is not null;

create table public.billing_tax_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  name text not null,
  seller_country_code text not null check (seller_country_code ~ '^[A-Z]{2}$'),
  customer_country_code text check (customer_country_code is null or customer_country_code ~ '^[A-Z]{2}$'),
  customer_region text not null default 'any' check (customer_region in ('any', 'domestic', 'eu', 'outside_eu')),
  customer_type text not null default 'any' check (customer_type in ('any', 'private', 'business', 'public')),
  supply_type text not null default 'any' check (supply_type in ('any', 'goods', 'service')),
  rate numeric(7,4) not null check (rate between 0 and 100),
  reverse_charge boolean not null default false,
  exempt boolean not null default false,
  exemption_reason text,
  legal_texts jsonb not null default '{}'::jsonb,
  reporting_code text,
  requires_vat_validation boolean not null default false,
  priority integer not null default 100,
  valid_from date not null default current_date,
  valid_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check (not reverse_charge or rate = 0),
  check (not exempt or rate = 0)
);

alter table public.billing_products
  add constraint billing_products_default_tax_rule_fk
  foreign key (default_tax_rule_id) references public.billing_tax_rules(id) on delete set null;

create table public.billing_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_type text not null check (document_type in ('quote', 'proforma', 'invoice', 'credit_note')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'issued', 'sent', 'opened', 'partially_paid', 'paid', 'overdue', 'credited', 'replaced')),
  document_number text,
  series_id uuid references public.billing_invoice_series(id) on delete restrict,
  customer_id uuid not null references public.billing_customers(id) on delete restrict,
  original_document_id uuid references public.billing_documents(id) on delete restrict,
  issue_date date,
  delivery_date date,
  due_date date,
  valid_until date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  accounting_currency text not null check (accounting_currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  exchange_rate_date date,
  exchange_rate_source text,
  customer_reference text,
  project_reference text,
  order_reference text,
  contract_reference text,
  payment_terms text,
  notes text,
  rectification_reason text,
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  accounting_total numeric(18,2) not null default 0,
  amount_paid numeric(18,2) not null default 0,
  balance numeric(18,2) not null default 0,
  snapshot_hash text,
  locked_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  paid_at timestamptz,
  created_by_email text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (document_type <> 'credit_note' or original_document_id is not null),
  check (amount_paid >= 0),
  check (balance >= 0)
);

create unique index billing_documents_number_key
  on public.billing_documents (organization_id, document_number)
  where document_number is not null;
create index billing_documents_org_status_due_idx
  on public.billing_documents (organization_id, status, due_date desc);
create index billing_documents_customer_idx
  on public.billing_documents (organization_id, customer_id, created_at desc);

create table public.billing_document_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_id uuid not null references public.billing_documents(id) on delete cascade,
  position integer not null check (position > 0),
  product_id uuid references public.billing_products(id) on delete set null,
  description text not null,
  quantity numeric(18,4) not null check (quantity > 0),
  unit text not null default 'stk',
  unit_price numeric(18,4) not null check (unit_price >= 0),
  discount_percent numeric(7,4) not null default 0 check (discount_percent between 0 and 100),
  tax_rule_id uuid references public.billing_tax_rules(id) on delete restrict,
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 100),
  tax_label text,
  legal_text text,
  line_subtotal numeric(18,2) not null,
  line_discount numeric(18,2) not null,
  line_net numeric(18,2) not null,
  line_tax numeric(18,2) not null,
  line_total numeric(18,2) not null,
  created_at timestamptz not null default now(),
  unique (document_id, position)
);

create table public.billing_document_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_id uuid not null unique references public.billing_documents(id) on delete restrict,
  snapshot jsonb not null,
  content_hash text not null,
  template_version integer not null,
  pdf_storage_path text,
  pdf_hash text,
  pdf_generated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  customer_id uuid references public.billing_customers(id) on delete restrict,
  payment_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(18,2) not null check (amount > 0),
  exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'card', 'cash', 'other')),
  reference text,
  notes text,
  created_by_email text not null,
  created_at timestamptz not null default now()
);

create table public.billing_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  payment_id uuid not null references public.billing_payments(id) on delete restrict,
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, document_id)
);

create table public.billing_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_id uuid references public.billing_documents(id) on delete restrict,
  customer_id uuid references public.billing_customers(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  content_hash text,
  created_by_email text not null,
  created_at timestamptz not null default now(),
  check (document_id is not null or customer_id is not null)
);

create table public.billing_email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  event_type text not null check (event_type in ('queued', 'sent', 'delivered', 'bounced', 'opened', 'reminder_sent', 'failed')),
  provider_message_id text,
  recipient text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table public.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  actor_email text not null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index billing_audit_events_org_created_idx
  on public.billing_audit_events (organization_id, created_at desc);

create table public.billing_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate numeric(20,10) not null check (rate > 0),
  rate_date date not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, base_currency, quote_currency, rate_date, source)
);

create table public.billing_verifactu_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_id uuid not null unique references public.billing_documents(id) on delete restrict,
  event_type text not null default 'registration' check (event_type in ('registration', 'rectification', 'cancellation')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'accepted', 'rejected', 'retry')),
  previous_hash text,
  record_hash text not null unique,
  payload jsonb not null,
  aeat_response jsonb,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_electronic_invoice_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  format text not null check (format in ('ubl', 'facturae', 'cii', 'edifact', 'ehf')),
  version text,
  status text not null default 'pending' check (status in ('pending', 'generated', 'sent', 'accepted', 'rejected', 'failed')),
  storage_path text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, format)
);

create table public.billing_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  job_type text not null check (job_type in ('generate_pdf', 'send_email', 'submit_verifactu', 'generate_xml')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'retry')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_delivery_jobs_queue_idx
  on public.billing_delivery_jobs (status, available_at) where status in ('pending', 'retry');

insert into storage.buckets (id, name, public)
values ('billing-documents', 'billing-documents', false)
on conflict (id) do update set public = false;

create or replace function public.billing_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'billing_organizations', 'billing_organization_users', 'billing_organization_settings',
    'billing_invoice_series', 'billing_customers', 'billing_customer_contacts',
    'billing_products', 'billing_tax_rules', 'billing_documents',
    'billing_verifactu_records', 'billing_electronic_invoice_exports', 'billing_delivery_jobs'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.billing_touch_updated_at()',
      'trg_' || table_name || '_updated_at', table_name
    );
  end loop;
end $$;

create or replace function public.billing_protect_document()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.locked_at is not null then
      raise exception 'Issued billing documents cannot be deleted' using errcode = '55000';
    end if;
    return old;
  end if;

  if old.locked_at is not null and
     (to_jsonb(new) - array['status','amount_paid','balance','sent_at','opened_at','paid_at','updated_at']::text[])
       is distinct from
     (to_jsonb(old) - array['status','amount_paid','balance','sent_at','opened_at','paid_at','updated_at']::text[]) then
    raise exception 'Issued billing document content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger trg_billing_documents_protect
before update or delete on public.billing_documents
for each row execute function public.billing_protect_document();

create or replace function public.billing_protect_document_line()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_document_id uuid;
  is_locked boolean;
begin
  target_document_id := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
  select (locked_at is not null) into is_locked
  from public.billing_documents
  where id = target_document_id;

  if coalesce(is_locked, false) then
    raise exception 'Lines on an issued billing document are immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_billing_document_lines_protect
before insert or update or delete on public.billing_document_lines
for each row execute function public.billing_protect_document_line();

create or replace function public.billing_save_draft(
  p_document_id uuid,
  p_organization_id uuid,
  p_document_type text,
  p_customer_id uuid,
  p_payload jsonb,
  p_lines jsonb,
  p_actor_email text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_id uuid;
  current_document public.billing_documents%rowtype;
  line jsonb;
  line_position integer := 0;
  quantity_value numeric(18,4);
  unit_price_value numeric(18,4);
  discount_value numeric(7,4);
  tax_rate_value numeric(7,4);
  subtotal_value numeric(18,2);
  discount_amount numeric(18,2);
  net_value numeric(18,2);
  tax_value numeric(18,2);
  total_value numeric(18,2);
begin
  if p_document_type not in ('quote', 'proforma', 'invoice', 'credit_note') then
    raise exception 'Unsupported document type';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Lines must be a JSON array';
  end if;

  perform 1 from public.billing_customers
  where id = p_customer_id and organization_id = p_organization_id and active;
  if not found then raise exception 'Customer does not belong to the organization'; end if;

  if p_document_id is null then
    insert into public.billing_documents (
      organization_id, document_type, customer_id, original_document_id,
      issue_date, delivery_date, due_date, valid_until, currency, accounting_currency,
      exchange_rate, exchange_rate_date, exchange_rate_source, customer_reference,
      project_reference, order_reference, contract_reference, payment_terms, notes,
      rectification_reason, created_by_email
    ) values (
      p_organization_id, p_document_type, p_customer_id,
      nullif(p_payload->>'originalDocumentId', '')::uuid,
      nullif(p_payload->>'issueDate', '')::date,
      nullif(p_payload->>'deliveryDate', '')::date,
      nullif(p_payload->>'dueDate', '')::date,
      nullif(p_payload->>'validUntil', '')::date,
      upper(coalesce(nullif(p_payload->>'currency', ''), 'EUR')),
      upper(coalesce(nullif(p_payload->>'accountingCurrency', ''), nullif(p_payload->>'currency', ''), 'EUR')),
      coalesce(nullif(p_payload->>'exchangeRate', '')::numeric, 1),
      nullif(p_payload->>'exchangeRateDate', '')::date,
      nullif(p_payload->>'exchangeRateSource', ''),
      nullif(p_payload->>'customerReference', ''),
      nullif(p_payload->>'projectReference', ''),
      nullif(p_payload->>'orderReference', ''),
      nullif(p_payload->>'contractReference', ''),
      nullif(p_payload->>'paymentTerms', ''),
      nullif(p_payload->>'notes', ''),
      nullif(p_payload->>'rectificationReason', ''),
      p_actor_email
    ) returning id into target_id;
  else
    select * into current_document from public.billing_documents
    where id = p_document_id and organization_id = p_organization_id
    for update;
    if not found then raise exception 'Billing document not found'; end if;
    if current_document.locked_at is not null then raise exception 'Issued billing documents are immutable'; end if;

    target_id := p_document_id;
    update public.billing_documents set
      document_type = p_document_type,
      customer_id = p_customer_id,
      original_document_id = nullif(p_payload->>'originalDocumentId', '')::uuid,
      issue_date = nullif(p_payload->>'issueDate', '')::date,
      delivery_date = nullif(p_payload->>'deliveryDate', '')::date,
      due_date = nullif(p_payload->>'dueDate', '')::date,
      valid_until = nullif(p_payload->>'validUntil', '')::date,
      currency = upper(coalesce(nullif(p_payload->>'currency', ''), currency)),
      accounting_currency = upper(coalesce(nullif(p_payload->>'accountingCurrency', ''), accounting_currency)),
      exchange_rate = coalesce(nullif(p_payload->>'exchangeRate', '')::numeric, exchange_rate),
      exchange_rate_date = nullif(p_payload->>'exchangeRateDate', '')::date,
      exchange_rate_source = nullif(p_payload->>'exchangeRateSource', ''),
      customer_reference = nullif(p_payload->>'customerReference', ''),
      project_reference = nullif(p_payload->>'projectReference', ''),
      order_reference = nullif(p_payload->>'orderReference', ''),
      contract_reference = nullif(p_payload->>'contractReference', ''),
      payment_terms = nullif(p_payload->>'paymentTerms', ''),
      notes = nullif(p_payload->>'notes', ''),
      rectification_reason = nullif(p_payload->>'rectificationReason', ''),
      version = version + 1,
      updated_at = now()
    where id = target_id;
    delete from public.billing_document_lines where document_id = target_id;
  end if;

  for line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    line_position := line_position + 1;
    quantity_value := (line->>'quantity')::numeric;
    unit_price_value := (line->>'unitPrice')::numeric;
    discount_value := coalesce(nullif(line->>'discountPercent', '')::numeric, 0);
    tax_rate_value := coalesce(nullif(line->>'taxRate', '')::numeric, 0);
    if quantity_value <= 0 or unit_price_value < 0 or discount_value not between 0 and 100 or tax_rate_value not between 0 and 100 then
      raise exception 'Invalid amount on document line %', line_position;
    end if;
    subtotal_value := round(quantity_value * unit_price_value, 2);
    discount_amount := round(subtotal_value * discount_value / 100, 2);
    net_value := subtotal_value - discount_amount;
    tax_value := round(net_value * tax_rate_value / 100, 2);
    total_value := net_value + tax_value;

    insert into public.billing_document_lines (
      organization_id, document_id, position, product_id, description, quantity,
      unit, unit_price, discount_percent, tax_rule_id, tax_rate, tax_label,
      legal_text, line_subtotal, line_discount, line_net, line_tax, line_total
    ) values (
      p_organization_id, target_id, line_position, nullif(line->>'productId', '')::uuid,
      line->>'description', quantity_value, coalesce(nullif(line->>'unit', ''), 'stk'),
      unit_price_value, discount_value, nullif(line->>'taxRuleId', '')::uuid,
      tax_rate_value, nullif(line->>'taxLabel', ''), nullif(line->>'legalText', ''),
      subtotal_value, discount_amount, net_value, tax_value, total_value
    );
  end loop;

  select
    coalesce(sum(line_subtotal), 0), coalesce(sum(line_discount), 0),
    coalesce(sum(line_net), 0), coalesce(sum(line_tax), 0), coalesce(sum(line_total), 0)
  into subtotal_value, discount_amount, net_value, tax_value, total_value
  from public.billing_document_lines where document_id = target_id;

  update public.billing_documents set
    subtotal = net_value,
    discount_total = discount_amount,
    tax_total = tax_value,
    total = total_value,
    accounting_total = round(total_value * exchange_rate, 2),
    balance = greatest(total_value - amount_paid, 0),
    updated_at = now()
  where id = target_id;

  insert into public.billing_audit_events (
    organization_id, actor_email, action, resource_type, resource_id, metadata
  ) values (
    p_organization_id, p_actor_email,
    case when p_document_id is null then 'document_draft_created' else 'document_draft_saved' end,
    'billing_document', target_id,
    jsonb_build_object('documentType', p_document_type, 'lineCount', line_position)
  );
  return target_id;
end;
$$;

create or replace function public.billing_issue_document(
  p_document_id uuid,
  p_actor_email text,
  p_issue_date date default current_date,
  p_expected_version integer default null
)
returns table (document_id uuid, document_number text, content_hash text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_row public.billing_documents%rowtype;
  organization_row public.billing_organizations%rowtype;
  customer_row public.billing_customers%rowtype;
  settings_row public.billing_organization_settings%rowtype;
  series_row public.billing_invoice_series%rowtype;
  snapshot_value jsonb;
  hash_value text;
  number_value text;
  prefix_value text;
  previous_record_hash text;
  verifactu_payload jsonb;
  verifactu_hash text;
  default_prefix text;
  line_count integer;
begin
  select * into document_row from public.billing_documents where id = p_document_id for update;
  if not found then raise exception 'Billing document not found'; end if;
  if document_row.locked_at is not null then raise exception 'Billing document is already issued'; end if;
  if p_expected_version is not null and document_row.version <> p_expected_version then
    raise exception 'Billing document was changed by another user';
  end if;
  select count(*) into line_count from public.billing_document_lines where document_id = p_document_id;
  if line_count = 0 then raise exception 'A billing document requires at least one line'; end if;
  if document_row.total <= 0 then raise exception 'A billing document total must be greater than zero'; end if;

  select * into organization_row from public.billing_organizations
  where id = document_row.organization_id and active for update;
  if not found then raise exception 'Billing organization is not active'; end if;
  select * into customer_row from public.billing_customers where id = document_row.customer_id;
  if not found then raise exception 'Billing customer not found'; end if;
  select * into settings_row from public.billing_organization_settings
  where organization_id = document_row.organization_id;

  if document_row.document_type = 'credit_note' then
    if document_row.original_document_id is null or nullif(document_row.rectification_reason, '') is null then
      raise exception 'A credit note requires an original document and rectification reason';
    end if;
  end if;

  default_prefix := case document_row.document_type
    when 'quote' then 'QUO-' || extract(year from p_issue_date)::integer || '-'
    when 'proforma' then 'PRO-' || extract(year from p_issue_date)::integer || '-'
    when 'credit_note' then organization_row.country_code || '-R-' || extract(year from p_issue_date)::integer || '-'
    else organization_row.country_code || '-' || extract(year from p_issue_date)::integer || '-'
  end;

  insert into public.billing_invoice_series (
    organization_id, document_type, fiscal_year, prefix, padding, next_number
  ) values (
    document_row.organization_id, document_row.document_type,
    extract(year from p_issue_date)::integer, default_prefix, 5, 1
  ) on conflict (organization_id, document_type, fiscal_year) do nothing;

  select * into series_row from public.billing_invoice_series
  where organization_id = document_row.organization_id
    and document_type = document_row.document_type
    and fiscal_year = extract(year from p_issue_date)::integer
    and active
  for update;
  if not found then raise exception 'No active number series is configured'; end if;

  prefix_value := replace(series_row.prefix, '{YYYY}', extract(year from p_issue_date)::integer::text);
  number_value := prefix_value || lpad(series_row.next_number::text, series_row.padding, '0');
  update public.billing_invoice_series
  set next_number = next_number + 1, updated_at = now()
  where id = series_row.id;

  snapshot_value := jsonb_build_object(
    'schemaVersion', 1,
    'document', to_jsonb(document_row) || jsonb_build_object(
      'document_number', number_value,
      'issue_date', p_issue_date,
      'due_date', coalesce(document_row.due_date, p_issue_date + organization_row.payment_terms_days),
      'status', 'issued',
      'balance', document_row.total
    ),
    'seller', to_jsonb(organization_row),
    'customer', to_jsonb(customer_row),
    'settings', coalesce(to_jsonb(settings_row), '{}'::jsonb),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(line_row) order by line_row.position)
      from public.billing_document_lines line_row where line_row.document_id = p_document_id
    ), '[]'::jsonb),
    'issuedAt', now(),
    'issuedBy', p_actor_email
  );
  hash_value := encode(digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.billing_document_snapshots (
    organization_id, document_id, snapshot, content_hash, template_version
  ) values (
    document_row.organization_id, p_document_id, snapshot_value, hash_value,
    coalesce(settings_row.template_version, 1)
  );

  update public.billing_documents set
    document_number = number_value,
    series_id = series_row.id,
    issue_date = p_issue_date,
    due_date = coalesce(due_date, p_issue_date + organization_row.payment_terms_days),
    valid_until = case when document_type = 'quote' then coalesce(valid_until, p_issue_date + coalesce(settings_row.quote_validity_days, 30)) else valid_until end,
    status = 'issued',
    balance = total,
    snapshot_hash = hash_value,
    locked_at = now(),
    updated_at = now()
  where id = p_document_id;

  insert into public.billing_audit_events (
    organization_id, actor_email, action, resource_type, resource_id, after_data, metadata
  ) values (
    document_row.organization_id, p_actor_email, 'document_issued', 'billing_document',
    p_document_id, jsonb_build_object('status', 'issued', 'documentNumber', number_value),
    jsonb_build_object('snapshotHash', hash_value, 'seriesId', series_row.id)
  );

  insert into public.billing_delivery_jobs (organization_id, document_id, job_type)
  values (document_row.organization_id, p_document_id, 'generate_pdf');

  if organization_row.country_code = 'ES' and document_row.document_type in ('invoice', 'credit_note') then
    perform pg_advisory_xact_lock(hashtextextended(document_row.organization_id::text || ':verifactu', 0));
    select record_hash into previous_record_hash
    from public.billing_verifactu_records
    where organization_id = document_row.organization_id
    order by created_at desc, id desc limit 1;
    verifactu_payload := jsonb_build_object(
      'documentId', p_document_id,
      'documentNumber', number_value,
      'issueDate', p_issue_date,
      'sellerVatNumber', organization_row.vat_number,
      'customerVatNumber', customer_row.vat_number,
      'total', document_row.total,
      'taxTotal', document_row.tax_total,
      'currency', document_row.currency,
      'snapshotHash', hash_value,
      'previousHash', previous_record_hash,
      'software', jsonb_build_object('name', 'RealtyFlow Pro', 'schemaVersion', 1)
    );
    verifactu_hash := encode(digest(convert_to(coalesce(previous_record_hash, '') || verifactu_payload::text, 'UTF8'), 'sha256'), 'hex');
    insert into public.billing_verifactu_records (
      organization_id, document_id, event_type, previous_hash, record_hash, payload
    ) values (
      document_row.organization_id, p_document_id,
      case when document_row.document_type = 'credit_note' then 'rectification' else 'registration' end,
      previous_record_hash, verifactu_hash, verifactu_payload
    );
    insert into public.billing_delivery_jobs (organization_id, document_id, job_type)
    values (document_row.organization_id, p_document_id, 'submit_verifactu');
  end if;

  if document_row.document_type = 'credit_note' then
    update public.billing_documents set status = 'credited', updated_at = now()
    where id = document_row.original_document_id and locked_at is not null;
  end if;

  return query select p_document_id, number_value, hash_value;
end;
$$;

create or replace function public.billing_record_payment(
  p_document_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_currency text,
  p_method text,
  p_reference text,
  p_notes text,
  p_actor_email text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_row public.billing_documents%rowtype;
  payment_id uuid;
  new_paid numeric(18,2);
  new_balance numeric(18,2);
begin
  select * into document_row from public.billing_documents where id = p_document_id for update;
  if not found then raise exception 'Billing document not found'; end if;
  if document_row.locked_at is null or document_row.document_type not in ('invoice', 'proforma') then
    raise exception 'Payments can only be allocated to issued invoices or proformas';
  end if;
  if p_amount <= 0 or p_amount > document_row.balance then
    raise exception 'Payment must be positive and cannot exceed the outstanding balance';
  end if;
  if upper(p_currency) <> document_row.currency then
    raise exception 'Payment currency must match the document currency';
  end if;

  insert into public.billing_payments (
    organization_id, customer_id, payment_date, currency, amount, method,
    reference, notes, created_by_email
  ) values (
    document_row.organization_id, document_row.customer_id, p_payment_date,
    upper(p_currency), round(p_amount, 2), p_method, nullif(p_reference, ''),
    nullif(p_notes, ''), p_actor_email
  ) returning id into payment_id;
  insert into public.billing_payment_allocations (organization_id, payment_id, document_id, amount)
  values (document_row.organization_id, payment_id, p_document_id, round(p_amount, 2));

  new_paid := document_row.amount_paid + round(p_amount, 2);
  new_balance := greatest(document_row.total - new_paid, 0);
  update public.billing_documents set
    amount_paid = new_paid,
    balance = new_balance,
    status = case when new_balance = 0 then 'paid' else 'partially_paid' end,
    paid_at = case when new_balance = 0 then now() else paid_at end,
    updated_at = now()
  where id = p_document_id;

  insert into public.billing_audit_events (
    organization_id, actor_email, action, resource_type, resource_id, metadata
  ) values (
    document_row.organization_id, p_actor_email, 'payment_recorded', 'billing_document',
    p_document_id, jsonb_build_object('paymentId', payment_id, 'amount', round(p_amount, 2), 'balance', new_balance)
  );
  return payment_id;
end;
$$;

-- RLS is defense in depth. The application currently performs all writes via
-- authenticated server routes and the service role. Authenticated browser
-- clients receive read-only grants; all mutations pass through server routes.
alter table public.billing_organizations enable row level security;
alter table public.billing_organization_users enable row level security;
alter table public.billing_organization_settings enable row level security;
alter table public.billing_invoice_series enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_customer_contacts enable row level security;
alter table public.billing_products enable row level security;
alter table public.billing_tax_rules enable row level security;
alter table public.billing_documents enable row level security;
alter table public.billing_document_lines enable row level security;
alter table public.billing_document_snapshots enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_payment_allocations enable row level security;
alter table public.billing_attachments enable row level security;
alter table public.billing_email_events enable row level security;
alter table public.billing_audit_events enable row level security;
alter table public.billing_exchange_rates enable row level security;
alter table public.billing_verifactu_records enable row level security;
alter table public.billing_electronic_invoice_exports enable row level security;
alter table public.billing_delivery_jobs enable row level security;

create policy billing_users_read_self on public.billing_organization_users
for select to authenticated
using (
  active and (
    user_id = (select auth.uid()) or
    lower(user_email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
);

create policy billing_members_read_organizations on public.billing_organizations
for select to authenticated
using (exists (
  select 1 from public.billing_organization_users member
  where member.organization_id = billing_organizations.id and member.active and (
    member.user_id = (select auth.uid()) or
    lower(member.user_email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'billing_organization_settings', 'billing_invoice_series', 'billing_customers',
    'billing_customer_contacts', 'billing_products', 'billing_tax_rules',
    'billing_documents', 'billing_document_lines', 'billing_document_snapshots',
    'billing_payments', 'billing_payment_allocations', 'billing_attachments',
    'billing_email_events', 'billing_audit_events', 'billing_exchange_rates',
    'billing_verifactu_records', 'billing_electronic_invoice_exports', 'billing_delivery_jobs'
  ] loop
    execute format(
      'create policy billing_members_read on public.%I for select to authenticated using (exists (
        select 1 from public.billing_organization_users member
        where member.organization_id = %I.organization_id and member.active and (
          member.user_id = (select auth.uid()) or
          lower(member.user_email) = lower(coalesce(((select auth.jwt()) ->> ''email''), ''''))
        )
      ))', table_name, table_name
    );
  end loop;
end $$;

revoke all on
  public.billing_organizations,
  public.billing_organization_users,
  public.billing_organization_settings,
  public.billing_invoice_series,
  public.billing_customers,
  public.billing_customer_contacts,
  public.billing_products,
  public.billing_tax_rules,
  public.billing_documents,
  public.billing_document_lines,
  public.billing_document_snapshots,
  public.billing_payments,
  public.billing_payment_allocations,
  public.billing_attachments,
  public.billing_email_events,
  public.billing_audit_events,
  public.billing_exchange_rates,
  public.billing_verifactu_records,
  public.billing_electronic_invoice_exports,
  public.billing_delivery_jobs
from anon;
grant select on
  public.billing_organizations,
  public.billing_organization_users,
  public.billing_organization_settings,
  public.billing_invoice_series,
  public.billing_customers,
  public.billing_customer_contacts,
  public.billing_products,
  public.billing_tax_rules,
  public.billing_documents,
  public.billing_document_lines,
  public.billing_document_snapshots,
  public.billing_payments,
  public.billing_payment_allocations,
  public.billing_attachments,
  public.billing_email_events,
  public.billing_audit_events,
  public.billing_exchange_rates,
  public.billing_verifactu_records,
  public.billing_electronic_invoice_exports,
  public.billing_delivery_jobs
to authenticated;

grant all on
  public.billing_organizations,
  public.billing_organization_users,
  public.billing_organization_settings,
  public.billing_invoice_series,
  public.billing_customers,
  public.billing_customer_contacts,
  public.billing_products,
  public.billing_tax_rules,
  public.billing_documents,
  public.billing_document_lines,
  public.billing_document_snapshots,
  public.billing_payments,
  public.billing_payment_allocations,
  public.billing_attachments,
  public.billing_email_events,
  public.billing_audit_events,
  public.billing_exchange_rates,
  public.billing_verifactu_records,
  public.billing_electronic_invoice_exports,
  public.billing_delivery_jobs
to service_role;

revoke all on function public.billing_save_draft(uuid, uuid, text, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.billing_issue_document(uuid, text, date, integer) from public, anon, authenticated;
revoke all on function public.billing_record_payment(uuid, numeric, date, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_save_draft(uuid, uuid, text, uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.billing_issue_document(uuid, text, date, integer) to service_role;
grant execute on function public.billing_record_payment(uuid, numeric, date, text, text, text, text, text) to service_role;

comment on function public.billing_issue_document(uuid, text, date, integer) is
  'Atomically locks a number series, assigns a number, snapshots and hashes a sales document, creates audit/outbox records, and starts a Spanish VeriFactu chain when applicable.';
comment on table public.billing_document_snapshots is
  'Immutable legal copy of seller, buyer, lines, tax and terms as they were when the document was issued.';
comment on table public.billing_verifactu_records is
  'Hash-chained VeriFactu-ready registration records. AEAT transport remains an explicit integration step.';
