-- Book OS phase 5.2: controlled, reversible sales experiments.
-- Planning and decisions are internal. No function changes retailer metadata or publishes externally.

create table public.publishing_sales_experiments (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.publishing_catalog_works(id) on delete restrict,
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete restrict,
  revision_id uuid not null references public.publishing_catalog_revisions(id) on delete restrict,
  channel text not null check (length(trim(channel)) between 1 and 80),
  marketplace text not null default 'global' check (length(trim(marketplace)) between 1 and 80),
  hypothesis text not null check (length(trim(hypothesis)) between 10 and 1000),
  success_metric text not null check (success_metric in ('orders','units','pages_read','gross_sales','royalties','ad_sales')),
  currency text,
  change_field text not null check (change_field in ('title','subtitle','description','keywords','categories','price','cover','advertising')),
  baseline_value jsonb not null check (jsonb_typeof(baseline_value) in ('object','array','string','number','boolean')),
  proposed_value jsonb not null check (jsonb_typeof(proposed_value) in ('object','array','string','number','boolean')),
  rollback_value jsonb not null check (jsonb_typeof(rollback_value) in ('object','array','string','number','boolean')),
  measurement_start date not null,
  measurement_end date not null check (measurement_end > measurement_start),
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','running','completed','inconclusive','cancelled','stale')),
  proposed_by text not null check (length(trim(proposed_by)) between 1 and 160),
  proposed_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  applied_by text,
  applied_at timestamptz,
  application_evidence jsonb,
  evaluated_by text,
  evaluated_at timestamptz,
  baseline_metric numeric,
  experiment_metric numeric,
  relative_lift numeric,
  evidence_level text check (evidence_level in ('insufficient','directional')),
  result_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (proposed_value <> baseline_value),
  check (rollback_value = baseline_value),
  check ((decided_by is null and decided_at is null) or (decided_by is not null and decided_at is not null)),
  check (currency is null or currency ~ '^[A-Z]{3}$')
);

create unique index publishing_sales_experiments_one_active_change
  on public.publishing_sales_experiments (edition_id,channel,marketplace,change_field)
  where status in ('proposed','approved','running');
create index publishing_sales_experiments_work_idx on public.publishing_sales_experiments (work_id,created_at desc);
create index publishing_sales_experiments_edition_fk_idx on public.publishing_sales_experiments (edition_id);
create index publishing_sales_experiments_revision_fk_idx on public.publishing_sales_experiments (revision_id);

alter table public.publishing_sales_experiments enable row level security;
revoke all on table public.publishing_sales_experiments from public,anon,authenticated,service_role;
grant select on table public.publishing_sales_experiments to service_role;
create policy "publishing_sales_experiments_deny_direct" on public.publishing_sales_experiments
for all to anon,authenticated using (false) with check (false);

create or replace function public.publishing_stage_sales_experiment(
  p_edition_id uuid,p_channel text,p_marketplace text,p_hypothesis text,p_success_metric text,
  p_currency text,p_change_field text,p_baseline_value jsonb,p_proposed_value jsonb,
  p_measurement_start date,p_measurement_end date,p_actor text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare selected_edition public.publishing_catalog_editions%rowtype; selected_revision_id uuid; result_id uuid;
begin
  if nullif(trim(p_actor),'') is null then raise exception 'Experiment actor is required'; end if;
  if nullif(trim(p_channel),'') is null or nullif(trim(p_hypothesis),'') is null then raise exception 'Channel and hypothesis are required'; end if;
  if length(trim(p_hypothesis)) < 10 then raise exception 'Hypothesis is too short'; end if;
  if p_success_metric not in ('orders','units','pages_read','gross_sales','royalties','ad_sales') then raise exception 'Unsupported success metric'; end if;
  if p_change_field not in ('title','subtitle','description','keywords','categories','price','cover','advertising') then raise exception 'Unsupported controlled change'; end if;
  if p_baseline_value is null or p_proposed_value is null or p_baseline_value=p_proposed_value then raise exception 'One changed value and its baseline are required'; end if;
  if p_measurement_end <= p_measurement_start then raise exception 'Measurement window must have a positive duration'; end if;
  if p_currency is not null and upper(trim(p_currency)) !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter code'; end if;
  select * into selected_edition from public.publishing_catalog_editions where id=p_edition_id;
  if not found or selected_edition.status='retired' then raise exception 'Active canonical edition is required'; end if;
  select id into selected_revision_id from public.publishing_catalog_revisions where edition_id=selected_edition.id and is_canonical;
  if selected_revision_id is null then raise exception 'Exact canonical revision is required'; end if;
  insert into public.publishing_sales_experiments (
    work_id,edition_id,revision_id,channel,marketplace,hypothesis,success_metric,currency,
    change_field,baseline_value,proposed_value,rollback_value,measurement_start,measurement_end,proposed_by
  ) values (
    selected_edition.work_id,selected_edition.id,selected_revision_id,trim(p_channel),coalesce(nullif(trim(p_marketplace),''),'global'),
    trim(p_hypothesis),p_success_metric,case when p_currency is null then null else upper(trim(p_currency)) end,
    p_change_field,p_baseline_value,p_proposed_value,p_baseline_value,p_measurement_start,p_measurement_end,trim(p_actor)
  ) returning id into result_id;
  return jsonb_build_object('experiment_id',result_id,'status','proposed','controlled_changes',1,'external_changes_created',false);
end $$;

create or replace function public.publishing_decide_sales_experiment(
  p_experiment_id uuid,p_decision text,p_actor text,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare experiment public.publishing_sales_experiments%rowtype; current_revision_id uuid;
begin
  if p_decision not in ('approve','reject') or nullif(trim(p_actor),'') is null then raise exception 'Valid decision and actor are required'; end if;
  if p_decision='reject' and nullif(trim(p_note),'') is null then raise exception 'Rejection requires a note'; end if;
  select * into experiment from public.publishing_sales_experiments where id=p_experiment_id for update;
  if not found or experiment.status<>'proposed' then raise exception 'Proposed experiment is required'; end if;
  if p_decision='reject' then
    update public.publishing_sales_experiments set status='rejected',decided_by=trim(p_actor),decided_at=now(),decision_note=trim(p_note),updated_at=now() where id=experiment.id;
    return jsonb_build_object('experiment_id',experiment.id,'status','rejected','external_changes_created',false);
  end if;
  select id into current_revision_id from public.publishing_catalog_revisions where edition_id=experiment.edition_id and is_canonical;
  if current_revision_id is distinct from experiment.revision_id then
    update public.publishing_sales_experiments set status='stale',decided_by=trim(p_actor),decided_at=now(),decision_note='Canonical revision changed',updated_at=now() where id=experiment.id;
    return jsonb_build_object('experiment_id',experiment.id,'status','stale','external_changes_created',false);
  end if;
  update public.publishing_sales_experiments set status='approved',decided_by=trim(p_actor),decided_at=now(),decision_note=nullif(trim(p_note),''),updated_at=now() where id=experiment.id;
  return jsonb_build_object('experiment_id',experiment.id,'status','approved','external_changes_created',false);
end $$;

create or replace function public.publishing_start_sales_experiment(
  p_experiment_id uuid,p_actor text,p_application_evidence jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare experiment public.publishing_sales_experiments%rowtype; current_revision_id uuid;
begin
  if nullif(trim(p_actor),'') is null or p_application_evidence is null or jsonb_typeof(p_application_evidence)<>'object' or p_application_evidence='{}'::jsonb then raise exception 'Actor and application evidence are required'; end if;
  select * into experiment from public.publishing_sales_experiments where id=p_experiment_id for update;
  if not found or experiment.status<>'approved' then raise exception 'Approved experiment is required'; end if;
  select id into current_revision_id from public.publishing_catalog_revisions where edition_id=experiment.edition_id and is_canonical;
  if current_revision_id is distinct from experiment.revision_id then raise exception 'Canonical revision changed; create a new experiment'; end if;
  update public.publishing_sales_experiments set status='running',applied_by=trim(p_actor),applied_at=now(),application_evidence=p_application_evidence,updated_at=now() where id=experiment.id;
  return jsonb_build_object('experiment_id',experiment.id,'status','running','rollback_value',experiment.rollback_value,'external_changes_created',false);
end $$;

create or replace function public.publishing_evaluate_sales_experiment(p_experiment_id uuid,p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare experiment public.publishing_sales_experiments%rowtype; baseline_start date; window_days integer;
  baseline_total numeric:=0; test_total numeric:=0; baseline_days integer:=0; test_days integer:=0;
  lift numeric; evidence text; final_status text;
begin
  if nullif(trim(p_actor),'') is null then raise exception 'Evaluation actor is required'; end if;
  select * into experiment from public.publishing_sales_experiments where id=p_experiment_id for update;
  if not found or experiment.status<>'running' then raise exception 'Running experiment is required'; end if;
  if current_date <= experiment.measurement_end then raise exception 'Measurement window is not complete'; end if;
  window_days:=experiment.measurement_end-experiment.measurement_start; baseline_start:=experiment.measurement_start-window_days;
  select coalesce(sum(case experiment.success_metric when 'orders' then f.orders when 'units' then f.units when 'pages_read' then f.pages_read when 'gross_sales' then f.gross_sales when 'royalties' then f.royalties when 'ad_sales' then f.ad_sales end),0),count(distinct f.metric_date)
    into baseline_total,baseline_days from public.publishing_sales_facts f
    where f.edition_id=experiment.edition_id and f.channel=experiment.channel and f.marketplace=experiment.marketplace
      and f.metric_date>=baseline_start and f.metric_date<experiment.measurement_start
      and (experiment.currency is null or f.currency=experiment.currency);
  select coalesce(sum(case experiment.success_metric when 'orders' then f.orders when 'units' then f.units when 'pages_read' then f.pages_read when 'gross_sales' then f.gross_sales when 'royalties' then f.royalties when 'ad_sales' then f.ad_sales end),0),count(distinct f.metric_date)
    into test_total,test_days from public.publishing_sales_facts f
    where f.edition_id=experiment.edition_id and f.channel=experiment.channel and f.marketplace=experiment.marketplace
      and f.metric_date>=experiment.measurement_start and f.metric_date<=experiment.measurement_end
      and (experiment.currency is null or f.currency=experiment.currency);
  evidence:=case when baseline_days>=7 and test_days>=7 then 'directional' else 'insufficient' end;
  lift:=case when baseline_total>0 then round((test_total-baseline_total)/baseline_total,4) else null end;
  final_status:=case when evidence='insufficient' then 'inconclusive' else 'completed' end;
  update public.publishing_sales_experiments set status=final_status,evaluated_by=trim(p_actor),evaluated_at=now(),baseline_metric=baseline_total,
    experiment_metric=test_total,relative_lift=lift,evidence_level=evidence,
    result_snapshot=jsonb_build_object('baseline_start',baseline_start,'baseline_end',experiment.measurement_start-1,'baseline_days',baseline_days,'test_days',test_days,'single_experiment_not_learning_rule',true),updated_at=now()
    where id=experiment.id;
  return jsonb_build_object('experiment_id',experiment.id,'status',final_status,'baseline_metric',baseline_total,'experiment_metric',test_total,'relative_lift',lift,'evidence_level',evidence,'learning_rule_created',false,'external_changes_created',false);
end $$;

revoke all on function public.publishing_stage_sales_experiment(uuid,text,text,text,text,text,text,jsonb,jsonb,date,date,text) from public,anon,authenticated;
revoke all on function public.publishing_decide_sales_experiment(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.publishing_start_sales_experiment(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.publishing_evaluate_sales_experiment(uuid,text) from public,anon,authenticated;
grant execute on function public.publishing_stage_sales_experiment(uuid,text,text,text,text,text,text,jsonb,jsonb,date,date,text) to service_role;
grant execute on function public.publishing_decide_sales_experiment(uuid,text,text,text) to service_role;
grant execute on function public.publishing_start_sales_experiment(uuid,text,jsonb) to service_role;
grant execute on function public.publishing_evaluate_sales_experiment(uuid,text) to service_role;

notify pgrst,'reload schema';
