-- Explicit credit-note allocations, refunds, and one authoritative settlement
-- calculation. Monetary columns on legal documents remain positive magnitudes;
-- signed generated columns make their accounting direction unambiguous.

alter table public.billing_documents
  drop constraint if exists billing_documents_status_check;

alter table public.billing_documents
  add constraint billing_documents_status_check check (status in (
    'draft', 'ready', 'issued', 'sent', 'opened', 'partially_paid', 'paid',
    'overdue', 'partially_credited', 'fully_credited', 'credited', 'replaced'
  ));

alter table public.billing_documents
  add column amount_credited numeric(18,2) not null default 0 check (amount_credited >= 0),
  add column amount_refunded numeric(18,2) not null default 0 check (amount_refunded >= 0),
  add column refund_due numeric(18,2) not null default 0 check (refund_due >= 0),
  add column signed_total numeric(18,2) generated always as (
    case when document_type = 'credit_note' then -total else total end
  ) stored,
  add column signed_tax_total numeric(18,2) generated always as (
    case when document_type = 'credit_note' then -tax_total else tax_total end
  ) stored,
  add column signed_accounting_total numeric(18,2) generated always as (
    case when document_type = 'credit_note' then -accounting_total else accounting_total end
  ) stored;

create table public.billing_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  credit_note_id uuid not null unique references public.billing_documents(id) on delete restrict,
  original_invoice_id uuid not null references public.billing_documents(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  accounting_amount numeric(18,2) not null check (accounting_amount > 0),
  created_by_email text not null,
  created_at timestamptz not null default now(),
  check (credit_note_id <> original_invoice_id)
);

create index billing_credit_allocations_organization_idx
  on public.billing_credit_allocations (organization_id, created_at desc);
create index billing_credit_allocations_original_invoice_idx
  on public.billing_credit_allocations (original_invoice_id, created_at desc);

create table public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  customer_id uuid not null references public.billing_customers(id) on delete restrict,
  refund_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(18,2) not null check (amount > 0),
  exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'card', 'cash', 'other')),
  reference text,
  notes text,
  external_refund_id text,
  created_by_email text not null,
  created_at timestamptz not null default now()
);

create index billing_refunds_organization_date_idx
  on public.billing_refunds (organization_id, refund_date desc, created_at desc);
create index billing_refunds_customer_idx
  on public.billing_refunds (customer_id, created_at desc);
create unique index billing_refunds_external_refund_key
  on public.billing_refunds (organization_id, external_refund_id)
  where external_refund_id is not null;

create table public.billing_refund_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.billing_organizations(id) on delete cascade,
  refund_id uuid not null references public.billing_refunds(id) on delete restrict,
  original_invoice_id uuid not null references public.billing_documents(id) on delete restrict,
  credit_note_id uuid references public.billing_documents(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  accounting_amount numeric(18,2) not null check (accounting_amount > 0),
  created_at timestamptz not null default now(),
  unique (refund_id, original_invoice_id)
);

create index billing_refund_allocations_organization_idx
  on public.billing_refund_allocations (organization_id, created_at desc);
create index billing_refund_allocations_original_invoice_idx
  on public.billing_refund_allocations (original_invoice_id, created_at desc);
create index billing_refund_allocations_credit_note_idx
  on public.billing_refund_allocations (credit_note_id)
  where credit_note_id is not null;

-- Existing payment allocation foreign keys are part of the same settlement
-- queries and need explicit indexes in PostgreSQL.
create index if not exists billing_payment_allocations_payment_idx
  on public.billing_payment_allocations (payment_id);
create index if not exists billing_payment_allocations_document_idx
  on public.billing_payment_allocations (document_id, created_at desc);

create or replace function public.billing_deny_settlement_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Billing settlement events are append-only' using errcode = '55000';
end;
$$;

create trigger trg_billing_credit_allocations_append_only
before update or delete on public.billing_credit_allocations
for each row execute function public.billing_deny_settlement_mutation();

create trigger trg_billing_refunds_append_only
before update or delete on public.billing_refunds
for each row execute function public.billing_deny_settlement_mutation();

create trigger trg_billing_refund_allocations_append_only
before update or delete on public.billing_refund_allocations
for each row execute function public.billing_deny_settlement_mutation();

create or replace function public.billing_validate_credit_allocation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  credit_row public.billing_documents%rowtype;
  invoice_row public.billing_documents%rowtype;
  already_credited numeric(18,2);
begin
  select * into credit_row
  from public.billing_documents
  where id = new.credit_note_id;

  select * into invoice_row
  from public.billing_documents
  where id = new.original_invoice_id
  for update;

  if credit_row.id is null or invoice_row.id is null then
    raise exception 'Credit note and original invoice are required';
  end if;
  if credit_row.document_type <> 'credit_note' or credit_row.locked_at is null then
    raise exception 'Only issued credit notes can be allocated';
  end if;
  if invoice_row.document_type <> 'invoice' or invoice_row.locked_at is null then
    raise exception 'Credit notes can only be allocated to issued invoices';
  end if;
  if credit_row.original_document_id <> invoice_row.id then
    raise exception 'Credit note does not reference the selected original invoice';
  end if;
  if credit_row.organization_id <> invoice_row.organization_id
     or new.organization_id <> invoice_row.organization_id
     or credit_row.customer_id <> invoice_row.customer_id
     or credit_row.currency <> invoice_row.currency
     or credit_row.accounting_currency <> invoice_row.accounting_currency then
    raise exception 'Credit note and invoice must share organization, customer, and currencies';
  end if;
  if new.amount <> credit_row.total or new.accounting_amount <> credit_row.accounting_total then
    raise exception 'Credit allocation must equal the issued credit note total';
  end if;

  select coalesce(sum(amount), 0) into already_credited
  from public.billing_credit_allocations
  where original_invoice_id = invoice_row.id;

  if new.amount > invoice_row.total - already_credited then
    raise exception 'Credit note exceeds the remaining creditable invoice amount';
  end if;
  return new;
end;
$$;

create trigger trg_billing_credit_allocations_validate
before insert on public.billing_credit_allocations
for each row execute function public.billing_validate_credit_allocation();

create or replace function public.billing_validate_refund_allocation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  refund_row public.billing_refunds%rowtype;
  invoice_row public.billing_documents%rowtype;
begin
  select * into refund_row
  from public.billing_refunds
  where id = new.refund_id;

  select * into invoice_row
  from public.billing_documents
  where id = new.original_invoice_id
  for update;

  if refund_row.id is null or invoice_row.id is null then
    raise exception 'Refund and original invoice are required';
  end if;
  if invoice_row.document_type <> 'invoice' or invoice_row.locked_at is null then
    raise exception 'Refunds can only be allocated to issued invoices';
  end if;
  if refund_row.organization_id <> invoice_row.organization_id
     or new.organization_id <> invoice_row.organization_id
     or refund_row.customer_id <> invoice_row.customer_id
     or refund_row.currency <> invoice_row.currency then
    raise exception 'Refund and invoice must share organization, customer, and currency';
  end if;
  if new.amount <> refund_row.amount
     or new.accounting_amount <> round(new.amount * invoice_row.exchange_rate, 2) then
    raise exception 'Refund allocation must equal the refund amount';
  end if;
  if new.amount > invoice_row.refund_due then
    raise exception 'Refund allocation exceeds the refundable invoice amount';
  end if;
  if new.credit_note_id is not null and not exists (
    select 1
    from public.billing_credit_allocations credit_allocation
    where credit_allocation.credit_note_id = new.credit_note_id
      and credit_allocation.original_invoice_id = invoice_row.id
  ) then
    raise exception 'Refund credit note is not allocated to the invoice';
  end if;
  return new;
end;
$$;

create trigger trg_billing_refund_allocations_validate
before insert on public.billing_refund_allocations
for each row execute function public.billing_validate_refund_allocation();

create or replace function public.billing_recalculate_invoice_settlement(
  p_document_id uuid
)
returns public.billing_documents
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_row public.billing_documents%rowtype;
  gross_paid numeric(18,2);
  credited numeric(18,2);
  refunded numeric(18,2);
  open_balance numeric(18,2);
  amount_to_refund numeric(18,2);
  next_status text;
begin
  select * into document_row
  from public.billing_documents
  where id = p_document_id
  for update;

  if not found then raise exception 'Billing document not found'; end if;
  if document_row.document_type not in ('invoice', 'proforma') or document_row.locked_at is null then
    raise exception 'Settlement can only be calculated for issued invoices or proformas';
  end if;

  select coalesce(sum(allocation.amount), 0) into gross_paid
  from public.billing_payment_allocations allocation
  where allocation.document_id = p_document_id;

  select coalesce(sum(allocation.amount), 0) into credited
  from public.billing_credit_allocations allocation
  where allocation.original_invoice_id = p_document_id;

  select coalesce(sum(allocation.amount), 0) into refunded
  from public.billing_refund_allocations allocation
  where allocation.original_invoice_id = p_document_id;

  -- Authoritative formula:
  -- invoice total - payments - credits + refunds = open balance.
  open_balance := greatest(round(document_row.total - gross_paid - credited + refunded, 2), 0);
  amount_to_refund := greatest(round(gross_paid + credited - refunded - document_row.total, 2), 0);

  next_status := case
    when document_row.document_type = 'invoice' and credited >= document_row.total and document_row.total > 0
      then 'fully_credited'
    when document_row.document_type = 'invoice' and credited > 0
      then 'partially_credited'
    when open_balance = 0 then 'paid'
    when gross_paid - refunded > 0 then 'partially_paid'
    when document_row.status in ('sent', 'opened', 'overdue') then document_row.status
    else 'issued'
  end;

  update public.billing_documents set
    amount_paid = gross_paid,
    amount_credited = credited,
    amount_refunded = refunded,
    balance = open_balance,
    refund_due = amount_to_refund,
    status = next_status,
    paid_at = case
      when open_balance > 0 then null
      when gross_paid > 0 then coalesce(paid_at, now())
      else paid_at
    end,
    updated_at = now()
  where id = p_document_id
  returning * into document_row;

  return document_row;
end;
$$;

-- Keep locked legal content immutable while allowing derived settlement fields.
-- The old `credited` status is mapped for compatibility with the original
-- issuance function and any older clients.
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

  if old.locked_at is not null and new.status = 'credited' then
    new.status := case
      when new.amount_credited >= new.total and new.total > 0 then 'fully_credited'
      when new.amount_credited > 0 then 'partially_credited'
      else old.status
    end;
  end if;

  if old.locked_at is not null and
     (to_jsonb(new) - array[
       'status', 'amount_paid', 'amount_credited', 'amount_refunded', 'balance',
       'refund_due', 'signed_total', 'signed_tax_total', 'signed_accounting_total',
       'sent_at', 'opened_at', 'paid_at', 'updated_at'
     ]::text[])
       is distinct from
     (to_jsonb(old) - array[
       'status', 'amount_paid', 'amount_credited', 'amount_refunded', 'balance',
       'refund_due', 'signed_total', 'signed_tax_total', 'signed_accounting_total',
       'sent_at', 'opened_at', 'paid_at', 'updated_at'
     ]::text[]) then
    raise exception 'Issued billing document content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.billing_apply_issued_credit_note()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  settled_invoice public.billing_documents%rowtype;
begin
  if old.locked_at is not null or new.locked_at is null or new.document_type <> 'credit_note' then
    return new;
  end if;

  insert into public.billing_credit_allocations (
    organization_id, credit_note_id, original_invoice_id, amount,
    accounting_amount, created_by_email
  ) values (
    new.organization_id, new.id, new.original_document_id, new.total,
    new.accounting_total, new.created_by_email
  );

  settled_invoice := public.billing_recalculate_invoice_settlement(new.original_document_id);

  update public.billing_documents set
    balance = 0,
    refund_due = 0,
    updated_at = now()
  where id = new.id;

  insert into public.billing_audit_events (
    organization_id, actor_email, action, resource_type, resource_id, metadata
  ) values (
    new.organization_id, new.created_by_email, 'credit_note_allocated',
    'billing_document', new.original_document_id,
    jsonb_build_object(
      'creditNoteId', new.id,
      'amount', new.total,
      'balance', settled_invoice.balance,
      'refundDue', settled_invoice.refund_due,
      'status', settled_invoice.status
    )
  );
  return new;
end;
$$;

create trigger trg_billing_apply_issued_credit_note
after update of locked_at on public.billing_documents
for each row execute function public.billing_apply_issued_credit_note();

-- Upgrade any credit notes issued before this migration to explicit
-- allocations, then recalculate their source invoices.
insert into public.billing_credit_allocations (
  organization_id, credit_note_id, original_invoice_id, amount,
  accounting_amount, created_by_email, created_at
)
select
  credit.organization_id, credit.id, credit.original_document_id, credit.total,
  credit.accounting_total, credit.created_by_email, credit.locked_at
from public.billing_documents credit
where credit.document_type = 'credit_note'
  and credit.locked_at is not null
on conflict (credit_note_id) do nothing;

do $$
declare
  source_invoice record;
begin
  for source_invoice in
    select distinct original_invoice_id
    from public.billing_credit_allocations
    order by original_invoice_id
  loop
    perform public.billing_recalculate_invoice_settlement(source_invoice.original_invoice_id);
  end loop;
end $$;

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
  settled_document public.billing_documents%rowtype;
  payment_id uuid;
begin
  select * into document_row
  from public.billing_documents
  where id = p_document_id
  for update;

  if not found then raise exception 'Billing document not found'; end if;
  if document_row.locked_at is null or document_row.document_type not in ('invoice', 'proforma') then
    raise exception 'Payments can only be allocated to issued invoices or proformas';
  end if;
  if p_amount <= 0 or round(p_amount, 2) > document_row.balance then
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

  insert into public.billing_payment_allocations (
    organization_id, payment_id, document_id, amount
  ) values (
    document_row.organization_id, payment_id, p_document_id, round(p_amount, 2)
  );

  settled_document := public.billing_recalculate_invoice_settlement(p_document_id);

  insert into public.billing_audit_events (
    organization_id, actor_email, action, resource_type, resource_id, metadata
  ) values (
    document_row.organization_id, p_actor_email, 'payment_recorded', 'billing_document',
    p_document_id, jsonb_build_object(
      'paymentId', payment_id,
      'amount', round(p_amount, 2),
      'balance', settled_document.balance,
      'refundDue', settled_document.refund_due
    )
  );
  return payment_id;
end;
$$;

create or replace function public.billing_record_refund(
  p_document_id uuid,
  p_amount numeric,
  p_refund_date date,
  p_currency text,
  p_method text,
  p_reference text,
  p_notes text,
  p_actor_email text,
  p_credit_note_id uuid default null,
  p_external_refund_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_row public.billing_documents%rowtype;
  credit_row public.billing_documents%rowtype;
  settled_document public.billing_documents%rowtype;
  refund_id uuid;
  existing_refund_id uuid;
  existing_invoice_id uuid;
  existing_amount numeric(18,2);
begin
  select * into document_row
  from public.billing_documents
  where id = p_document_id
  for update;

  if not found then raise exception 'Billing document not found'; end if;
  if document_row.locked_at is null or document_row.document_type <> 'invoice' then
    raise exception 'Refunds can only be allocated to issued invoices';
  end if;
  if p_amount <= 0 then raise exception 'Refund must be positive'; end if;
  if upper(p_currency) <> document_row.currency then
    raise exception 'Refund currency must match the invoice currency';
  end if;

  if nullif(p_external_refund_id, '') is not null then
    select refund.id, allocation.original_invoice_id, refund.amount
    into existing_refund_id, existing_invoice_id, existing_amount
    from public.billing_refunds refund
    left join public.billing_refund_allocations allocation on allocation.refund_id = refund.id
    where refund.organization_id = document_row.organization_id
      and refund.external_refund_id = nullif(p_external_refund_id, '');

    if existing_refund_id is not null then
      if existing_invoice_id = document_row.id and existing_amount = round(p_amount, 2) then
        return existing_refund_id;
      end if;
      raise exception 'External refund ID is already used for another refund';
    end if;
  end if;

  if round(p_amount, 2) > document_row.refund_due then
    raise exception 'Refund cannot exceed the refundable amount';
  end if;

  if p_credit_note_id is not null then
    select credit.* into credit_row
    from public.billing_documents credit
    join public.billing_credit_allocations allocation
      on allocation.credit_note_id = credit.id
     and allocation.original_invoice_id = document_row.id
    where credit.id = p_credit_note_id;
    if not found then
      raise exception 'Refund credit note is not allocated to the invoice';
    end if;
  end if;

  insert into public.billing_refunds (
    organization_id, customer_id, refund_date, currency, amount, exchange_rate,
    method, reference, notes, external_refund_id, created_by_email
  ) values (
    document_row.organization_id, document_row.customer_id, p_refund_date,
    upper(p_currency), round(p_amount, 2), document_row.exchange_rate,
    p_method, nullif(p_reference, ''), nullif(p_notes, ''),
    nullif(p_external_refund_id, ''), p_actor_email
  ) returning id into refund_id;

  insert into public.billing_refund_allocations (
    organization_id, refund_id, original_invoice_id, credit_note_id,
    amount, accounting_amount
  ) values (
    document_row.organization_id, refund_id, document_row.id, p_credit_note_id,
    round(p_amount, 2), round(p_amount * document_row.exchange_rate, 2)
  );

  settled_document := public.billing_recalculate_invoice_settlement(p_document_id);

  insert into public.billing_audit_events (
    organization_id, actor_email, action, resource_type, resource_id, metadata
  ) values (
    document_row.organization_id, p_actor_email, 'refund_recorded', 'billing_document',
    p_document_id, jsonb_build_object(
      'refundId', refund_id,
      'creditNoteId', p_credit_note_id,
      'amount', round(p_amount, 2),
      'balance', settled_document.balance,
      'refundDue', settled_document.refund_due
    )
  );
  return refund_id;
end;
$$;

alter table public.billing_credit_allocations enable row level security;
alter table public.billing_refunds enable row level security;
alter table public.billing_refund_allocations enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'billing_credit_allocations', 'billing_refunds', 'billing_refund_allocations'
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
  public.billing_credit_allocations,
  public.billing_refunds,
  public.billing_refund_allocations
from public, anon, authenticated;

grant select on
  public.billing_credit_allocations,
  public.billing_refunds,
  public.billing_refund_allocations
to authenticated;

grant select, insert on
  public.billing_credit_allocations,
  public.billing_refunds,
  public.billing_refund_allocations
to service_role;

revoke all on function public.billing_deny_settlement_mutation() from public, anon, authenticated;
revoke all on function public.billing_validate_credit_allocation() from public, anon, authenticated;
revoke all on function public.billing_validate_refund_allocation() from public, anon, authenticated;
revoke all on function public.billing_recalculate_invoice_settlement(uuid) from public, anon, authenticated;
revoke all on function public.billing_apply_issued_credit_note() from public, anon, authenticated;
revoke all on function public.billing_record_refund(uuid, numeric, date, text, text, text, text, text, uuid, text) from public, anon, authenticated;

grant execute on function public.billing_recalculate_invoice_settlement(uuid) to service_role;
grant execute on function public.billing_record_refund(uuid, numeric, date, text, text, text, text, text, uuid, text) to service_role;

comment on table public.billing_credit_allocations is
  'Immutable application of an issued credit note to its original invoice.';
comment on table public.billing_refunds is
  'Immutable outgoing cash refunds; allocation rows connect each refund to its invoice and optional credit note.';
comment on function public.billing_recalculate_invoice_settlement(uuid) is
  'Authoritative invoice settlement: total minus payments minus credits plus refunds, with a separate refundable amount.';
