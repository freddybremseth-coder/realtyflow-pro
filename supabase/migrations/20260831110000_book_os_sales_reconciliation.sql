-- Book OS phase 5.1: explicit human resolution of unmatched sales evidence.
-- A proposal never creates a sales fact; approval applies one exact, audited mapping.

create table public.publishing_sales_reconciliation_resolutions (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.publishing_sales_reconciliation_exceptions(id) on delete restrict,
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete restrict,
  revision_id uuid references public.publishing_catalog_revisions(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','applied','rejected','stale')),
  proposed_by text not null check (length(trim(proposed_by)) between 1 and 160),
  proposed_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  sales_fact_id uuid references public.publishing_sales_facts(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((decided_by is null and decided_at is null) or (decided_by is not null and decided_at is not null))
);
create unique index publishing_sales_one_pending_resolution
  on public.publishing_sales_reconciliation_resolutions (exception_id) where status='pending';
create index publishing_sales_resolutions_edition_fk_idx on public.publishing_sales_reconciliation_resolutions (edition_id);
create index publishing_sales_resolutions_revision_fk_idx on public.publishing_sales_reconciliation_resolutions (revision_id);
create index publishing_sales_resolutions_fact_fk_idx on public.publishing_sales_reconciliation_resolutions (sales_fact_id);

alter table public.publishing_sales_reconciliation_resolutions enable row level security;
revoke all on table public.publishing_sales_reconciliation_resolutions from public,anon,authenticated,service_role;
grant select on table public.publishing_sales_reconciliation_resolutions to service_role;
create policy "publishing_sales_resolutions_deny_direct" on public.publishing_sales_reconciliation_resolutions
for all to anon,authenticated using (false) with check (false);

create or replace function public.publishing_stage_sales_exception_resolution(p_exception_id uuid,p_edition_id uuid,p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_exception public.publishing_sales_reconciliation_exceptions%rowtype;
  selected_edition public.publishing_catalog_editions%rowtype; selected_revision_id uuid; result_id uuid;
begin
  if nullif(trim(p_actor),'') is null then raise exception 'Resolution actor is required'; end if;
  select * into selected_exception from public.publishing_sales_reconciliation_exceptions where id=p_exception_id for update;
  if not found or selected_exception.resolved_at is not null then raise exception 'Open sales exception is required'; end if;
  if exists(select 1 from public.publishing_sales_facts where source_metric_id=selected_exception.source_metric_id) then raise exception 'Sales metric is already canonical'; end if;
  select * into selected_edition from public.publishing_catalog_editions where id=p_edition_id;
  if not found or selected_edition.status='retired' then raise exception 'Active canonical edition is required'; end if;
  select id into selected_revision_id from public.publishing_catalog_revisions where edition_id=selected_edition.id and is_canonical;
  insert into public.publishing_sales_reconciliation_resolutions (exception_id,edition_id,revision_id,proposed_by)
  values (selected_exception.id,selected_edition.id,selected_revision_id,trim(p_actor)) returning id into result_id;
  return jsonb_build_object('resolution_id',result_id,'status','pending','sales_fact_created',false,'external_changes_created',false);
end $$;

create or replace function public.publishing_decide_sales_exception_resolution(
  p_resolution_id uuid,p_decision text,p_actor text,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare resolution public.publishing_sales_reconciliation_resolutions%rowtype;
  selected_exception public.publishing_sales_reconciliation_exceptions%rowtype;
  metric public.book_growth_metrics%rowtype; edition public.publishing_catalog_editions%rowtype;
  current_revision_id uuid; result_fact_id uuid; result_batch_id uuid;
begin
  if p_decision not in ('approve','reject') or nullif(trim(p_actor),'') is null then raise exception 'Valid decision and actor are required'; end if;
  if p_decision='reject' and nullif(trim(p_note),'') is null then raise exception 'Rejection requires a note'; end if;
  select * into resolution from public.publishing_sales_reconciliation_resolutions where id=p_resolution_id for update;
  if not found or resolution.status<>'pending' then raise exception 'Pending resolution is required'; end if;
  if p_decision='reject' then
    update public.publishing_sales_reconciliation_resolutions set status='rejected',decided_by=trim(p_actor),decided_at=now(),decision_note=trim(p_note),updated_at=now() where id=resolution.id;
    return jsonb_build_object('resolution_id',resolution.id,'status','rejected','sales_fact_created',false,'external_changes_created',false);
  end if;
  select * into selected_exception from public.publishing_sales_reconciliation_exceptions where id=resolution.exception_id for update;
  if not found or selected_exception.resolved_at is not null then raise exception 'Resolution exception is no longer open'; end if;
  select * into metric from public.book_growth_metrics where id=selected_exception.source_metric_id;
  select * into edition from public.publishing_catalog_editions where id=resolution.edition_id;
  if not found or edition.status='retired' then raise exception 'Selected edition is no longer active'; end if;
  select id into current_revision_id from public.publishing_catalog_revisions where edition_id=edition.id and is_canonical;
  if current_revision_id is distinct from resolution.revision_id then
    update public.publishing_sales_reconciliation_resolutions set status='stale',decided_by=trim(p_actor),decided_at=now(),decision_note='Canonical revision changed',updated_at=now() where id=resolution.id;
    return jsonb_build_object('resolution_id',resolution.id,'status','stale','reason','canonical_revision_changed','sales_fact_created',false,'external_changes_created',false);
  end if;
  insert into public.publishing_sales_import_batches (source,status,scanned_rows,imported_rows,unmatched_rows,requested_by,completed_at)
  values ('manual_exception_resolution','completed',1,1,0,trim(p_actor),now()) returning id into result_batch_id;
  insert into public.publishing_sales_facts (
    batch_id,source_metric_id,work_id,edition_id,revision_id,attribution_status,channel,marketplace,format,metric_date,
    impressions,clicks,orders,units,pages_read,gross_sales,royalties,ad_spend,ad_sales,ad_orders,currency,source,
    correlation_id,evidence_snapshot,imported_at
  ) values (
    result_batch_id,metric.id,edition.work_id,edition.id,current_revision_id,case when current_revision_id is null then 'edition_only' else 'exact_revision' end,
    metric.channel,metric.marketplace,metric.format,metric.metric_date,metric.impressions,metric.clicks,metric.orders,metric.units,
    metric.pages_read,metric.gross_sales,metric.royalties,metric.ad_spend,metric.ad_sales,metric.ad_orders,metric.currency,metric.source,
    metric.correlation_id,jsonb_build_object('legacy_metrics',metric.metrics,'legacy_book_id',metric.book_id,'manual_resolution_id',resolution.id,'resolved_at',now()),metric.imported_at
  ) returning id into result_fact_id;
  update public.publishing_sales_reconciliation_exceptions set resolved_at=now(),last_seen_at=now() where id=selected_exception.id;
  update public.publishing_sales_reconciliation_resolutions set status='applied',decided_by=trim(p_actor),decided_at=now(),decision_note=nullif(trim(p_note),''),sales_fact_id=result_fact_id,updated_at=now() where id=resolution.id;
  return jsonb_build_object('resolution_id',resolution.id,'status','applied','sales_fact_id',result_fact_id,'sales_fact_created',true,'external_changes_created',false);
end $$;

revoke all on function public.publishing_stage_sales_exception_resolution(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.publishing_decide_sales_exception_resolution(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.publishing_stage_sales_exception_resolution(uuid,uuid,text) to service_role;
grant execute on function public.publishing_decide_sales_exception_resolution(uuid,text,text,text) to service_role;

notify pgrst,'reload schema';
