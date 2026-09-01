-- Book OS phase 5.3: evidence-based learning and next-book proposals.
-- Approval records intent only. It never applies metadata or starts production.

create table public.publishing_learning_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_type text not null check (proposal_type in ('improvement','next_book')),
  proposal_key text not null unique check (length(proposal_key) between 10 and 240),
  work_id uuid references public.publishing_catalog_works(id) on delete restrict,
  edition_id uuid references public.publishing_catalog_editions(id) on delete restrict,
  revision_id uuid references public.publishing_catalog_revisions(id) on delete restrict,
  series_name text,
  proposed_title text,
  dimension text not null check (length(trim(dimension)) between 1 and 80),
  success_metric text,
  rationale text not null check (length(trim(rationale)) between 20 and 2000),
  proposed_action jsonb not null check (jsonb_typeof(proposed_action)='object'),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot)='object'),
  evidence_count integer not null check (evidence_count >= 1),
  evidence_level text not null check (evidence_level in ('directional','moderate','strong')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','stale')),
  proposed_by text not null check (length(trim(proposed_by)) between 1 and 160),
  proposed_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((proposal_type='improvement' and work_id is not null and edition_id is not null and revision_id is not null)
      or (proposal_type='next_book' and nullif(trim(series_name),'') is not null and nullif(trim(proposed_title),'') is not null)),
  check ((decided_by is null and decided_at is null) or (decided_by is not null and decided_at is not null))
);

create table public.publishing_learning_proposal_evidence (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.publishing_learning_proposals(id) on delete restrict,
  experiment_id uuid references public.publishing_sales_experiments(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('controlled_experiment','catalog_gap','author_fit','market_evidence')),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default now(),
  unique nulls not distinct (proposal_id,experiment_id,evidence_type)
);

create table public.publishing_learning_proposal_decisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.publishing_learning_proposals(id) on delete restrict,
  decision text not null check (decision in ('approve','reject','stale')),
  actor text not null check (length(trim(actor)) between 1 and 160),
  note text,
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot)='object'),
  decided_at timestamptz not null default now()
);

create index publishing_learning_proposals_status_idx on public.publishing_learning_proposals (status,proposed_at desc);
create index publishing_learning_proposals_work_fk_idx on public.publishing_learning_proposals (work_id) where work_id is not null;
create index publishing_learning_proposals_edition_fk_idx on public.publishing_learning_proposals (edition_id) where edition_id is not null;
create index publishing_learning_proposals_revision_fk_idx on public.publishing_learning_proposals (revision_id) where revision_id is not null;
create index publishing_learning_evidence_proposal_fk_idx on public.publishing_learning_proposal_evidence (proposal_id);
create index publishing_learning_evidence_experiment_fk_idx on public.publishing_learning_proposal_evidence (experiment_id) where experiment_id is not null;
create index publishing_learning_decisions_proposal_fk_idx on public.publishing_learning_proposal_decisions (proposal_id,decided_at desc);

alter table public.publishing_learning_proposals enable row level security;
alter table public.publishing_learning_proposal_evidence enable row level security;
alter table public.publishing_learning_proposal_decisions enable row level security;
revoke all on table public.publishing_learning_proposals from public,anon,authenticated,service_role;
revoke all on table public.publishing_learning_proposal_evidence from public,anon,authenticated,service_role;
revoke all on table public.publishing_learning_proposal_decisions from public,anon,authenticated,service_role;
grant select on table public.publishing_learning_proposals to service_role;
grant select on table public.publishing_learning_proposal_evidence to service_role;
grant select on table public.publishing_learning_proposal_decisions to service_role;
create policy "publishing_learning_proposals_deny_direct" on public.publishing_learning_proposals for all to anon,authenticated using (false) with check (false);
create policy "publishing_learning_evidence_deny_direct" on public.publishing_learning_proposal_evidence for all to anon,authenticated using (false) with check (false);
create policy "publishing_learning_decisions_deny_direct" on public.publishing_learning_proposal_decisions for all to anon,authenticated using (false) with check (false);

create or replace function public.publishing_learning_audit_append_only()
returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Learning evidence and decisions are append-only'; end $$;
create trigger publishing_learning_evidence_append_only before update or delete on public.publishing_learning_proposal_evidence for each row execute function public.publishing_learning_audit_append_only();
create trigger publishing_learning_decisions_append_only before update or delete on public.publishing_learning_proposal_decisions for each row execute function public.publishing_learning_audit_append_only();

create or replace function public.publishing_generate_learning_proposals(p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare group_row record; result_id uuid; generated integer:=0; linked integer:=0; linked_total integer:=0; evidence_ids uuid[]; fingerprint text;
begin
  if nullif(trim(p_actor),'') is null then raise exception 'Proposal actor is required'; end if;
  perform pg_advisory_xact_lock(hashtext('publishing_generate_learning_proposals'));
  for group_row in
    select e.work_id,e.edition_id,e.revision_id,e.channel,e.marketplace,e.change_field,e.success_metric,e.proposed_value,count(*)::integer sample,
      avg(e.relative_lift) average_lift,array_agg(e.id order by e.id) experiment_ids
    from public.publishing_sales_experiments e
    join public.publishing_catalog_revisions r on r.id=e.revision_id and r.is_canonical
    where e.status='completed' and e.evidence_level='directional' and e.relative_lift is not null
    group by e.work_id,e.edition_id,e.revision_id,e.channel,e.marketplace,e.change_field,e.success_metric,e.proposed_value
    having count(*)>=3
  loop
    evidence_ids:=group_row.experiment_ids;
    fingerprint:='improvement:'||md5(array_to_string(evidence_ids,',')||':'||group_row.channel||':'||group_row.marketplace||':'||group_row.change_field||':'||group_row.success_metric||':'||group_row.proposed_value::text);
    if not exists(select 1 from public.publishing_learning_proposals p where p.proposal_key=fingerprint)
      and not exists(select 1 from public.publishing_learning_proposals p where p.status='pending' and p.proposal_type='improvement' and p.edition_id=group_row.edition_id and p.dimension=group_row.change_field and p.success_metric=group_row.success_metric) then
      insert into public.publishing_learning_proposals (
        proposal_type,proposal_key,work_id,edition_id,revision_id,dimension,success_metric,rationale,proposed_action,
        evidence_snapshot,evidence_count,evidence_level,proposed_by
      ) values (
        'improvement',fingerprint,group_row.work_id,group_row.edition_id,group_row.revision_id,group_row.change_field,group_row.success_metric,
        case when group_row.average_lift>=0.05 then 'Repeated controlled experiments support testing this improvement as a catalogue action.'
             when group_row.average_lift<=-0.05 then 'Repeated controlled experiments support avoiding or reversing this change.'
             else 'Repeated results are mixed; retain the baseline and request further review.' end,
        jsonb_build_object('action',case when group_row.average_lift>=0.05 then 'consider_adoption' when group_row.average_lift<=-0.05 then 'avoid_or_rollback' else 'continue_testing' end,'dimension',group_row.change_field,'tested_value',group_row.proposed_value,'channel',group_row.channel,'marketplace',group_row.marketplace,'average_relative_lift',round(group_row.average_lift,4)),
        jsonb_build_object('experiment_ids',evidence_ids,'sample',group_row.sample,'tested_value',group_row.proposed_value,'channel',group_row.channel,'marketplace',group_row.marketplace,'average_relative_lift',round(group_row.average_lift,4),'one_experiment_never_generalized',true),
        group_row.sample,case when group_row.sample>=8 then 'strong' else 'moderate' end,trim(p_actor)
      ) returning id into result_id;
      insert into public.publishing_learning_proposal_evidence (proposal_id,experiment_id,evidence_type,evidence)
      select result_id,e.id,'controlled_experiment',jsonb_build_object('relative_lift',e.relative_lift,'metric',e.success_metric,'measurement_start',e.measurement_start,'measurement_end',e.measurement_end)
      from public.publishing_sales_experiments e where e.id=any(evidence_ids);
      get diagnostics linked=row_count; linked_total:=linked_total+linked; generated:=generated+1;
    end if;
  end loop;
  return jsonb_build_object('generated',generated,'linked_evidence_rows',linked_total,'minimum_experiments',3,'learning_rules_created',false,'metadata_changed',false,'production_started',false);
end $$;

create or replace function public.publishing_stage_next_book_proposal(
  p_series_name text,p_title text,p_rationale text,p_evidence jsonb,p_actor text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result_id uuid; fingerprint text;
begin
  if nullif(trim(p_actor),'') is null or nullif(trim(p_series_name),'') is null or nullif(trim(p_title),'') is null then raise exception 'Actor, series and title are required'; end if;
  if length(trim(p_rationale))<20 then raise exception 'A detailed rationale is required'; end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or not (p_evidence ?& array['catalog_gap','author_fit','market_evidence'])
    or nullif(trim(p_evidence->>'catalog_gap'),'') is null or nullif(trim(p_evidence->>'author_fit'),'') is null or nullif(trim(p_evidence->>'market_evidence'),'') is null
    then raise exception 'Catalog gap, author fit and market evidence are required'; end if;
  fingerprint:='next_book:'||md5(lower(trim(p_series_name))||':'||lower(trim(p_title))||':'||p_evidence::text);
  insert into public.publishing_learning_proposals (proposal_type,proposal_key,series_name,proposed_title,dimension,rationale,proposed_action,evidence_snapshot,evidence_count,evidence_level,proposed_by)
  values ('next_book',fingerprint,trim(p_series_name),trim(p_title),'next_book',trim(p_rationale),jsonb_build_object('action','consider_book','series',trim(p_series_name),'title',trim(p_title)),p_evidence,3,'directional',trim(p_actor))
  returning id into result_id;
  insert into public.publishing_learning_proposal_evidence (proposal_id,evidence_type,evidence) values
    (result_id,'catalog_gap',jsonb_build_object('summary',p_evidence->'catalog_gap')),
    (result_id,'author_fit',jsonb_build_object('summary',p_evidence->'author_fit')),
    (result_id,'market_evidence',jsonb_build_object('summary',p_evidence->'market_evidence'));
  return jsonb_build_object('proposal_id',result_id,'status','pending','production_started',false,'metadata_changed',false);
end $$;

create or replace function public.publishing_decide_learning_proposal(p_proposal_id uuid,p_decision text,p_actor text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare proposal public.publishing_learning_proposals%rowtype; current_revision_id uuid; final_status text;
begin
  if p_decision not in ('approve','reject') or nullif(trim(p_actor),'') is null then raise exception 'Valid decision and actor are required'; end if;
  if p_decision='reject' and nullif(trim(p_note),'') is null then raise exception 'Rejection requires a note'; end if;
  select * into proposal from public.publishing_learning_proposals where id=p_proposal_id for update;
  if not found or proposal.status<>'pending' then raise exception 'Pending learning proposal is required'; end if;
  final_status:=case when p_decision='approve' then 'approved' else 'rejected' end;
  if proposal.proposal_type='improvement' then
    select id into current_revision_id from public.publishing_catalog_revisions where edition_id=proposal.edition_id and is_canonical;
    if current_revision_id is distinct from proposal.revision_id then final_status:='stale'; end if;
  end if;
  insert into public.publishing_learning_proposal_decisions (proposal_id,decision,actor,note,evidence_snapshot)
  values (proposal.id,case when final_status='stale' then 'stale' else p_decision end,trim(p_actor),case when final_status='stale' then 'Canonical revision changed' else nullif(trim(p_note),'') end,proposal.evidence_snapshot);
  update public.publishing_learning_proposals set status=final_status,decided_by=trim(p_actor),decided_at=now(),decision_note=case when final_status='stale' then 'Canonical revision changed' else nullif(trim(p_note),'') end,updated_at=now() where id=proposal.id;
  return jsonb_build_object('proposal_id',proposal.id,'status',final_status,'learning_rule_created',false,'metadata_changed',false,'production_started',false,'external_changes_created',false);
end $$;

revoke all on function public.publishing_learning_audit_append_only() from public,anon,authenticated;
revoke all on function public.publishing_generate_learning_proposals(text) from public,anon,authenticated;
revoke all on function public.publishing_stage_next_book_proposal(text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.publishing_decide_learning_proposal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.publishing_generate_learning_proposals(text) to service_role;
grant execute on function public.publishing_stage_next_book_proposal(text,text,text,jsonb,text) to service_role;
grant execute on function public.publishing_decide_learning_proposal(uuid,text,text,text) to service_role;

notify pgrst,'reload schema';
