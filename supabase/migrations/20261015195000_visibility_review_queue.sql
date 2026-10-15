-- Visibility proposals share the existing Nexus work_items ledger.
-- Advisory transaction lock serializes concurrent proposals for the same finding.
-- Revoke public EXECUTE: only trusted service-role calls should use this function.
create or replace function public.enqueue_visibility_review(
 p_brand_id text, p_finding_id text, p_title text, p_description text,
 p_next_action text, p_priority text, p_evidence_at timestamptz,
 p_evidence_age text, p_category text, p_target_url text
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_source text; v_id uuid;
begin
 if p_brand_id !~ '^[a-z0-9_-]{1,64}$'
    or p_finding_id !~ '^[A-Za-z0-9_.:-]{1,180}$'
    or length(coalesce(p_title,'')) not between 1 and 240
    or length(coalesce(p_description,'')) > 4000
    or length(coalesce(p_next_action,'')) > 2000
    or p_priority not in ('HIGH','MEDIUM','LOW')
    or p_evidence_age not in ('RECENT','AGED','UNKNOWN')
    or p_category not in ('technical','publishing','missing-data')
    or (p_target_url is not null and (length(p_target_url)>2048 or p_target_url !~ '^https://'))
 then raise exception 'Invalid visibility finding'; end if;
 v_source := 'visibility:' || p_brand_id || ':' || p_finding_id;
 perform pg_advisory_xact_lock(hashtextextended('ai_agent:'||v_source,0));
 select id into v_id from public.work_items
 where source_type = 'ai_agent' and source_id = v_source
 order by created_at limit 1;
 if v_id is not null then return v_id; end if;
 insert into public.work_items(
 title,description,status,priority,brand_id,source_type,source_id,
 assigned_agent,next_action,ai_score,metadata
 ) values (
 p_title,p_description,'TO_DO',p_priority,p_brand_id,'ai_agent',v_source,
 'sam',p_next_action,0,
 jsonb_build_object(
 'product','altovena_visibility','origin','visibility_finding',
 'finding_id',p_finding_id,'evidence_at',p_evidence_at,'evidence_age',p_evidence_age,
 'category',p_category,'target_url',p_target_url,
 'execution_state','PROPOSED','publication_authorized',false,
 'verification_required',true,'source_verified',false
 )
 ) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.enqueue_visibility_review(text,text,text,text,text,text,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_visibility_review(text,text,text,text,text,text,timestamptz,text,text,text) to service_role;
