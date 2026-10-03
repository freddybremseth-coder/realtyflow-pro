-- Care quotes: explicit commercial stage between Care lead qualification and active contract.
-- Admin/service-role only. Public visitors cannot read or mutate quote rows directly.

create table if not exists care.kh_quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references care.orgs(id) on delete cascade,
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  property_id uuid null references care.kh_properties(id) on delete set null,
  plan_id uuid null references care.kh_plans(id) on delete set null,
  reference text not null,
  service_intent text not null default 'keyholding',
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','declined','expired','cancelled')),
  plan_snapshot jsonb not null default '{}'::jsonb,
  monthly_price_cents bigint not null default 0 check (monthly_price_cents >= 0),
  currency char(3) not null default 'EUR',
  valid_until date null,
  follow_up_on date null,
  notes text null,
  sent_at timestamptz null,
  accepted_at timestamptz null,
  declined_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference),
  unique (work_item_id)
);

create index if not exists kh_quotes_org_status_idx
  on care.kh_quotes(org_id, status, created_at desc);

create index if not exists kh_quotes_contact_idx
  on care.kh_quotes(contact_id, created_at desc);

create index if not exists kh_quotes_property_idx
  on care.kh_quotes(property_id, created_at desc)
  where property_id is not null;

alter table care.kh_quotes enable row level security;

revoke all on table care.kh_quotes from anon, authenticated;
grant select, insert, update, delete on table care.kh_quotes to service_role;

create or replace function public.care_dashboard_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, care
as $function$
  select jsonb_build_object(
    'orgs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.orgs limit 120) x), '[]'::jsonb),
    'org_members', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.org_members limit 120) x), '[]'::jsonb),
    'kh_plans', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_plans limit 120) x), '[]'::jsonb),
    'kh_checklist_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_checklist_items limit 200) x), '[]'::jsonb),
    'kh_properties', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_properties order by created_at desc limit 120) x), '[]'::jsonb),
    'kh_contracts', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_contracts order by created_at desc limit 120) x), '[]'::jsonb),
    'kh_quotes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_quotes order by created_at desc limit 200) x), '[]'::jsonb),
    'kh_inspections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_inspections order by started_at desc limit 120) x), '[]'::jsonb),
    'kh_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_reports order by created_at desc limit 120) x), '[]'::jsonb),
    'kh_report_deliveries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_report_deliveries order by sent_at desc limit 120) x), '[]'::jsonb),
    'kh_photos', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_photos order by taken_at desc limit 120) x), '[]'::jsonb),
    'kh_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_documents order by created_at desc limit 120) x), '[]'::jsonb),
    'kh_invoices', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_invoices order by created_at desc limit 120) x), '[]'::jsonb),
    'kh_invoice_lines', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_invoice_lines limit 120) x), '[]'::jsonb),
    'kh_charges', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_charges order by created_at desc limit 120) x), '[]'::jsonb),
    'kh_keys', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_keys order by created_at desc limit 120) x), '[]'::jsonb),
    'kh_key_events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_key_events order by at desc limit 120) x), '[]'::jsonb),
    'kh_calendar_events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_calendar_events order by starts_at desc limit 120) x), '[]'::jsonb),
    'kh_issues', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_issues order by opened_at desc limit 120) x), '[]'::jsonb),
    'kh_work_orders', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care.kh_work_orders order by created_at desc limit 120) x), '[]'::jsonb)
  );
$function$;
