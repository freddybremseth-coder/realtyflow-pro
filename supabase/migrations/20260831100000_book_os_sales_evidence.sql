-- Book OS phase 5.0: canonical, append-only sales evidence.
-- Legacy metrics remain unchanged and are reconciled non-destructively.

create table public.publishing_sales_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (length(trim(source)) between 1 and 120),
  status text not null default 'running' check (status in ('running','completed','failed')),
  scanned_rows integer not null default 0 check (scanned_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  unmatched_rows integer not null default 0 check (unmatched_rows >= 0),
  requested_by text not null check (length(trim(requested_by)) between 1 and 160),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.publishing_sales_facts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.publishing_sales_import_batches(id) on delete restrict,
  source_metric_id uuid not null unique references public.book_growth_metrics(id) on delete restrict,
  work_id uuid not null references public.publishing_catalog_works(id) on delete restrict,
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete restrict,
  revision_id uuid references public.publishing_catalog_revisions(id) on delete restrict,
  attribution_status text not null check (attribution_status in ('exact_revision','edition_only')),
  channel text not null,
  marketplace text not null,
  format text not null,
  metric_date date not null,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  orders numeric not null default 0,
  units numeric not null default 0,
  pages_read bigint not null default 0,
  gross_sales numeric not null default 0,
  royalties numeric not null default 0,
  ad_spend numeric not null default 0,
  ad_sales numeric not null default 0,
  ad_orders numeric not null default 0,
  currency text,
  source text not null,
  correlation_id text,
  evidence_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_snapshot) = 'object'),
  imported_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index publishing_sales_facts_edition_date_idx on public.publishing_sales_facts (edition_id, metric_date desc);
create index publishing_sales_facts_work_date_idx on public.publishing_sales_facts (work_id, metric_date desc);
create index publishing_sales_facts_revision_fk_idx on public.publishing_sales_facts (revision_id);
create index publishing_sales_facts_batch_fk_idx on public.publishing_sales_facts (batch_id);
create index publishing_sales_facts_channel_date_idx on public.publishing_sales_facts (channel, metric_date desc);

create table public.publishing_sales_reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  source_metric_id uuid not null unique references public.book_growth_metrics(id) on delete restrict,
  source_book_id uuid,
  reason text not null check (reason in ('book_missing','canonical_edition_missing')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index publishing_sales_exceptions_open_idx on public.publishing_sales_reconciliation_exceptions (reason, last_seen_at desc) where resolved_at is null;

alter table public.publishing_sales_import_batches enable row level security;
alter table public.publishing_sales_facts enable row level security;
alter table public.publishing_sales_reconciliation_exceptions enable row level security;
revoke all on table public.publishing_sales_import_batches from public, anon, authenticated, service_role;
revoke all on table public.publishing_sales_facts from public, anon, authenticated, service_role;
revoke all on table public.publishing_sales_reconciliation_exceptions from public, anon, authenticated, service_role;
grant select on table public.publishing_sales_import_batches to service_role;
grant select on table public.publishing_sales_facts to service_role;
grant select on table public.publishing_sales_reconciliation_exceptions to service_role;
create policy "publishing_sales_batches_deny_direct" on public.publishing_sales_import_batches for all to anon, authenticated using (false) with check (false);
create policy "publishing_sales_facts_deny_direct" on public.publishing_sales_facts for all to anon, authenticated using (false) with check (false);
create policy "publishing_sales_exceptions_deny_direct" on public.publishing_sales_reconciliation_exceptions for all to anon, authenticated using (false) with check (false);

create or replace function public.publishing_sales_facts_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Canonical sales facts are append-only';
end $$;
create trigger publishing_sales_facts_append_only before update or delete on public.publishing_sales_facts
for each row execute function public.publishing_sales_facts_append_only();

create or replace function public.publishing_reconcile_legacy_sales_metrics(p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare batch_id uuid; scanned integer := 0; imported integer := 0; unmatched integer := 0;
begin
  if nullif(trim(p_actor),'') is null then raise exception 'Sales reconciliation actor is required'; end if;
  insert into public.publishing_sales_import_batches (source,requested_by) values ('legacy_book_growth_metrics',trim(p_actor)) returning id into batch_id;

  select count(*) into scanned from public.book_growth_metrics m
  where not exists (select 1 from public.publishing_sales_facts f where f.source_metric_id=m.id);

  insert into public.publishing_sales_facts (
    batch_id,source_metric_id,work_id,edition_id,revision_id,attribution_status,channel,marketplace,format,metric_date,
    impressions,clicks,orders,units,pages_read,gross_sales,royalties,ad_spend,ad_sales,ad_orders,currency,source,
    correlation_id,evidence_snapshot,imported_at
  )
  select batch_id,m.id,e.work_id,e.id,r.id,case when r.id is null then 'edition_only' else 'exact_revision' end,
    m.channel,m.marketplace,m.format,m.metric_date,m.impressions,m.clicks,m.orders,m.units,m.pages_read,m.gross_sales,
    m.royalties,m.ad_spend,m.ad_sales,m.ad_orders,m.currency,m.source,m.correlation_id,
    jsonb_build_object('legacy_metrics',m.metrics,'legacy_book_id',m.book_id,'reconciled_at',now()),m.imported_at
  from public.book_growth_metrics m
  join public.book_titles b on b.id=m.book_id
  join public.publishing_catalog_editions e on e.id=b.catalog_edition_id
  left join public.publishing_catalog_revisions r on r.edition_id=e.id and r.is_canonical
  where not exists (select 1 from public.publishing_sales_facts f where f.source_metric_id=m.id)
  on conflict (source_metric_id) do nothing;
  get diagnostics imported = row_count;

  insert into public.publishing_sales_reconciliation_exceptions (source_metric_id,source_book_id,reason,evidence)
  select m.id,m.book_id,
    case when b.id is null then 'book_missing' else 'canonical_edition_missing' end,
    jsonb_build_object('channel',m.channel,'marketplace',m.marketplace,'format',m.format,'metric_date',m.metric_date,'source',m.source,'correlation_id',m.correlation_id)
  from public.book_growth_metrics m
  left join public.book_titles b on b.id=m.book_id
  left join public.publishing_catalog_editions e on e.id=b.catalog_edition_id
  where e.id is null and not exists (select 1 from public.publishing_sales_facts f where f.source_metric_id=m.id)
  on conflict (source_metric_id) do update set reason=excluded.reason,evidence=excluded.evidence,last_seen_at=now(),resolved_at=null;

  update public.publishing_sales_reconciliation_exceptions x set resolved_at=now(),last_seen_at=now()
  where resolved_at is null and exists (select 1 from public.publishing_sales_facts f where f.source_metric_id=x.source_metric_id);
  select count(*) into unmatched from public.publishing_sales_reconciliation_exceptions where resolved_at is null;
  update public.publishing_sales_import_batches set status='completed',scanned_rows=scanned,imported_rows=imported,
    unmatched_rows=unmatched,completed_at=now() where id=batch_id;
  return jsonb_build_object('batch_id',batch_id,'status','completed','scanned_rows',scanned,'imported_rows',imported,
    'open_unmatched_rows',unmatched,'external_changes_created',false);
exception when others then
  if batch_id is not null then update public.publishing_sales_import_batches set status='failed',error_message=sqlerrm,completed_at=now() where id=batch_id; end if;
  raise;
end $$;

revoke all on function public.publishing_sales_facts_append_only() from public,anon,authenticated;
revoke all on function public.publishing_reconcile_legacy_sales_metrics(text) from public,anon,authenticated;
grant execute on function public.publishing_reconcile_legacy_sales_metrics(text) to service_role;

notify pgrst, 'reload schema';
