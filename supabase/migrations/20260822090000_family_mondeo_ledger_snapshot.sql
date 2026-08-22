-- Family er master for Mondeo-ledgeren (daglig akkrual, forsinkelsesrente,
-- tillegg, terminlogikk). RealtyFlow skal VISE family sine tall, ikke regne
-- på nytt (to modeller drev fra hverandre: 4 875 727 vs 4 796 940).
--
-- Family-appen skriver sin autoritative tilstand til family.mondeo_ledger_snapshot.
-- Denne trigger-en (SECURITY DEFINER, forbi deny-all RLS) speiler snapshot til
-- public.business_financial_events som:
--   * stream='mondeo_balance'  (direction='metric')  -> restgjeld
--   * stream='mondeo_interest' (direction='income')  -> kapitalisert (ubetalt)
--     renteinntekt. Sammen med mondeo_payment (cash-renteinntekt) gir dette full
--     bokført renteinntekt uten dobbelttelling.

create table if not exists family.mondeo_ledger_snapshot (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  as_of_date      text,
  current_balance numeric not null default 0,
  total_interest  numeric not null default 0,
  total_charges   numeric not null default 0,
  total_late_fee  numeric not null default 0,
  total_paid      numeric not null default 0,
  arrears_total   numeric not null default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table family.mondeo_ledger_snapshot enable row level security;
drop policy if exists "family_mondeo_snapshot_owner_all" on family.mondeo_ledger_snapshot;
create policy "family_mondeo_snapshot_owner_all" on family.mondeo_ledger_snapshot
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Utvid stream-constrainten med de nye Mondeo-strømmene
alter table public.business_financial_events drop constraint if exists business_financial_events_stream_check;
alter table public.business_financial_events add constraint business_financial_events_stream_check
  check (stream in ('commission','sale_value','kdp_royalty','saas_revenue','saas_mrr',
    'olive_harvest','olive_subsidy','olive_expense','manual_adjustment','kpi_adjustment',
    'mondeo_payment','mondeo_balance','mondeo_interest'));

create or replace function public.sync_family_mondeo_snapshot_to_business_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'family'
as $function$
declare
  snap_date date;
  capitalized numeric;
begin
  if TG_OP = 'DELETE' then
    delete from public.business_financial_events
    where source_type = 'family_mondeo'
      and source_id in (OLD.user_id::text || ':balance', OLD.user_id::text || ':interest');
    return OLD;
  end if;

  begin snap_date := NEW.as_of_date::date; exception when others then snap_date := current_date; end;
  capitalized := greatest(0, coalesce(NEW.total_interest, 0) - coalesce(NEW.total_paid, 0));

  -- Restgjeld (metric, ikke inntekt)
  insert into public.business_financial_events
    (brand_id, source_type, source_id, stream, direction, status, amount, currency, event_date, description, metadata, updated_at)
  values ('mondeo','family_mondeo', NEW.user_id::text || ':balance','mondeo_balance','metric','recognized',
    coalesce(NEW.current_balance,0),'NOK',snap_date,'Restgjeld (family autoritativ)',
    jsonb_build_object('total_interest',NEW.total_interest,'total_charges',NEW.total_charges,
      'total_late_fee',NEW.total_late_fee,'total_paid',NEW.total_paid,
      'arrears_total',NEW.arrears_total,'as_of',NEW.as_of_date), now())
  on conflict (source_type, source_id, stream) do update set
    amount=excluded.amount, event_date=excluded.event_date, metadata=excluded.metadata,
    status=excluded.status, direction=excluded.direction, updated_at=now();

  -- Kapitalisert (ubetalt) renteinntekt (income). mondeo_payment dekker cash-delen.
  insert into public.business_financial_events
    (brand_id, source_type, source_id, stream, direction, status, amount, currency, event_date, description, metadata, updated_at)
  values ('mondeo','family_mondeo', NEW.user_id::text || ':interest','mondeo_interest','income','recognized',
    capitalized,'NOK',snap_date,'Kapitalisert renteinntekt Mondeo (ubetalt)',
    jsonb_build_object('total_interest',NEW.total_interest,'total_paid',NEW.total_paid,'as_of',NEW.as_of_date), now())
  on conflict (source_type, source_id, stream) do update set
    amount=excluded.amount, event_date=excluded.event_date, metadata=excluded.metadata,
    status=excluded.status, direction=excluded.direction, updated_at=now();

  return NEW;
end;
$function$;

revoke execute on function public.sync_family_mondeo_snapshot_to_business_event() from public, anon, authenticated;
grant execute on function public.sync_family_mondeo_snapshot_to_business_event() to service_role;

drop trigger if exists trg_sync_family_mondeo_snapshot_to_business_event on family.mondeo_ledger_snapshot;
create trigger trg_sync_family_mondeo_snapshot_to_business_event
  after insert or update or delete on family.mondeo_ledger_snapshot
  for each row execute function public.sync_family_mondeo_snapshot_to_business_event();
