-- Sync Family Mondeo payments -> RealtyFlow business_financial_events ledger.
--
-- Mirror of the existing KPI sync (sync_family_mondeo_kpi_to_business_event).
-- The payment trigger was missing, so RealtyFlow showed "0 betalinger" and fell
-- back to the contract model. Each Family Mondeo payment is booked as interest
-- income, so we mirror it as stream='mondeo_payment' / direction='income', which
-- is exactly what src/lib/mondeo.ts (isMondeoLedgerPaymentEvent) reads.
--
-- SECURITY DEFINER so the trigger bypasses the deny-all RLS on
-- business_financial_events (family app writes only to family.* and relies on
-- these triggers to reach the shared ledger).
--
-- NOTE: the original check constraints did not include the family-mondeo values
-- (source_type 'family_mondeo', streams 'kpi_adjustment'/'mondeo_payment'). The
-- KPI trigger never fired (no KPI rows existed) so this went unnoticed. Extend
-- the constraints first.

alter table public.business_financial_events drop constraint if exists business_financial_events_source_type_check;
alter table public.business_financial_events add constraint business_financial_events_source_type_check
  check (source_type in ('crm','kdp','saas','olivia','manual','family_mondeo'));

alter table public.business_financial_events drop constraint if exists business_financial_events_stream_check;
alter table public.business_financial_events add constraint business_financial_events_stream_check
  check (stream in ('commission','sale_value','kdp_royalty','saas_revenue','saas_mrr',
    'olive_harvest','olive_subsidy','olive_expense','manual_adjustment','kpi_adjustment','mondeo_payment'));

create or replace function public.sync_family_mondeo_payment_to_business_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'family'
as $function$
declare
  payment_date date;
begin
  if TG_OP = 'DELETE' then
    delete from public.business_financial_events
    where source_type = 'family_mondeo'
      and source_id = OLD.id
      and stream = 'mondeo_payment';
    return OLD;
  end if;

  begin
    payment_date := NEW.date::date;
  exception when others then
    payment_date := current_date;
  end;

  insert into public.business_financial_events (
    brand_id, source_type, source_id, stream, direction, status,
    amount, currency, event_date, description, metadata, updated_at
  ) values (
    'mondeo',
    'family_mondeo',
    NEW.id,
    'mondeo_payment',
    'income',
    'recognized',
    coalesce(NEW.amount, 0),
    'NOK',
    payment_date,
    coalesce(NEW.note, 'Innbetaling registrert i Family (renteinntekt Mondeo)'),
    jsonb_build_object(
      'family_table', 'family.mondeo_loan_payments',
      'family_id', NEW.id,
      'user_id', NEW.user_id,
      'amount', NEW.amount,
      'date', NEW.date,
      'note', NEW.note,
      'posted_transaction_id', NEW.posted_transaction_id,
      'created_at', NEW.created_at
    ),
    now()
  )
  on conflict (source_type, source_id, stream)
  do update set
    brand_id = excluded.brand_id,
    direction = excluded.direction,
    status = excluded.status,
    amount = excluded.amount,
    currency = excluded.currency,
    event_date = excluded.event_date,
    description = excluded.description,
    metadata = excluded.metadata,
    updated_at = now();

  return NEW;
end;
$function$;

revoke execute on function public.sync_family_mondeo_payment_to_business_event() from public, anon, authenticated;
grant execute on function public.sync_family_mondeo_payment_to_business_event() to service_role;

drop trigger if exists trg_sync_family_mondeo_payment_to_business_event on family.mondeo_loan_payments;
create trigger trg_sync_family_mondeo_payment_to_business_event
  after insert or update or delete on family.mondeo_loan_payments
  for each row execute function public.sync_family_mondeo_payment_to_business_event();

-- Backfill existing payments into the ledger (idempotent via ON CONFLICT).
insert into public.business_financial_events (
  brand_id, source_type, source_id, stream, direction, status,
  amount, currency, event_date, description, metadata, updated_at
)
select
  'mondeo', 'family_mondeo', p.id, 'mondeo_payment', 'income', 'recognized',
  coalesce(p.amount, 0), 'NOK',
  case when p.date ~ '^\d{4}-\d{2}-\d{2}' then p.date::date else current_date end,
  coalesce(p.note, 'Innbetaling registrert i Family (renteinntekt Mondeo)'),
  jsonb_build_object(
    'family_table', 'family.mondeo_loan_payments',
    'family_id', p.id, 'user_id', p.user_id, 'amount', p.amount,
    'date', p.date, 'note', p.note,
    'posted_transaction_id', p.posted_transaction_id, 'created_at', p.created_at
  ),
  now()
from family.mondeo_loan_payments p
on conflict (source_type, source_id, stream)
do update set
  amount = excluded.amount, event_date = excluded.event_date,
  description = excluded.description, metadata = excluded.metadata,
  status = excluded.status, direction = excluded.direction, updated_at = now();
