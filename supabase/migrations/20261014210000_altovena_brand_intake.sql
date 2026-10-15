-- Altovena intake foundation. Additive; does not activate any member or expose any public lead endpoint.
-- Forms, CRM, newsletters, social and sales orchestration are managed by RealtyFlow.
insert into core.tenants (slug,name,status,plan,metadata)
values ('altovena','Altovena','active','pro','{"source":"altovena_brand_setup","ownership":"RealtyFlow"}'::jsonb)
on conflict (slug) do nothing;

insert into core.brands (tenant_id,brand_key,display_name,app_slug,metadata)
select t.id,'altovena','Altovena','realtyflow',
  '{"source":"altovena_brand_setup","url":"https://altovena.com","customer_data_owner":"realtyflow"}'::jsonb
from core.tenants t where t.slug='altovena'
on conflict (brand_key) do nothing;

-- Idempotency receipts only: personal messages are stored in the canonical CRM,
-- never duplicated in a new marketing/lead table.
create table if not exists public.altovena_intake_receipts (
  submission_id uuid primary key,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  work_item_id uuid not null references public.work_items(id) on delete restrict,
  received_at timestamptz not null default now()
);
create index if not exists altovena_intake_receipts_contact_idx
  on public.altovena_intake_receipts(contact_id);
alter table public.altovena_intake_receipts enable row level security;
revoke all on public.altovena_intake_receipts from public, anon, authenticated;
grant select, insert on public.altovena_intake_receipts to service_role;

-- Service-role RPC, executed atomically: CRM contact + new interaction + work item
-- either ALL succeed or are rolled back. No website token can access this function.
create or replace function public.altovena_receive_lead(
  p_submission_id uuid,
  p_name text,
  p_email text,
  p_company text,
  p_message text,
  p_product text
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_name text := btrim(coalesce(p_name,''));
  v_company text := btrim(coalesce(p_company,''));
  v_message text := btrim(coalesce(p_message,''));
  v_contact_id uuid;
  v_work_id uuid;
  v_time timestamptz := now();
  v_activity jsonb;
begin
  if p_submission_id is null
    or length(v_name) not between 1 and 120
    or length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$'
    or length(v_company)>160
    or length(v_message) not between 1 and 2500
    or p_product is null
    or p_product not in ('offer','visibility','realtyflow','olivia','other')
    then raise exception 'Invalid Altovena enquiry';
  end if;

  if not exists (select 1 from core.brands where brand_key='altovena') then
    raise exception 'Altovena brand not configured';
  end if;

  -- Serialize same submission and same-brand address to prevent duplicate records.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('altovena:submission:'||p_submission_id::text,0));
  select contact_id,work_item_id into v_contact_id,v_work_id
    from public.altovena_intake_receipts where submission_id=p_submission_id;
  if v_contact_id is not null and v_work_id is not null then
    return jsonb_build_object('ok',true,'accepted',true,
      'leadId',v_contact_id::text,'workItemId',v_work_id::text,'duplicate',true);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('altovena:email:'||v_email,0));
  v_activity := jsonb_build_object(
    'id',p_submission_id::text,'type','note','direction','in','date',v_time,
    'brand_id','altovena','content','Website request: '||v_message,
    'metadata',jsonb_build_object('source','altovena.com/contact','product',p_product,
      'submitted_name',v_name,'submitted_company',v_company,
      'marketing_opt_in',false,'human_follow_up',true,'identity_verified',false)
  );

  select id into v_contact_id from public.contacts
  where brand_id='altovena' and brand='altovena' and lower(btrim(email))=v_email
  order by created_at asc limit 1 for update;

  if v_contact_id is null then
    insert into public.contacts (
      name,email,company,type,source,brand,brand_id,pipeline_status,pipeline_value,
      notes,interactions,ai_auto_followup,nurture_status,created_at,updated_at,next_followup
    ) values (
      v_name,v_email,v_company,'other','altovena.com/contact','altovena','altovena',
      'NEW',0,'Altovena website request: '||v_message,jsonb_build_array(v_activity),
      false,'stopped',v_time,v_time,v_time+interval '1 day'
    ) returning id into v_contact_id;
  else
    -- Public submissions are NOT identity verification: never overwrite the
    -- canonical name/company of an existing contact simply from a matching email.
    update public.contacts
       set interactions=coalesce(interactions,'[]'::jsonb)||jsonb_build_array(v_activity),
           -- Keep any independently-established prior subscription preferences intact;
           -- this request adds no new marketing consent or auto-follow-up.
           notes=concat_ws(E'\n',nullif(notes,''),'Altovena website request: '||v_message),
           updated_at=v_time,
           next_followup=case when next_followup is null or next_followup>v_time+interval '1 day'
             then v_time+interval '1 day' else next_followup end
     where id=v_contact_id and brand_id='altovena' and brand='altovena';
    if not found then raise exception 'Brand-scoped contact update failed'; end if;
  end if;

  insert into public.work_items (
    title,description,status,priority,due_date,brand_id,source_type,source_id,
    assigned_agent,next_action,ai_score,metadata
  ) values (
    'Ny Altovena-henvendelse: '||v_name,
    'Produkt: '||p_product||' · Kontakt må følges opp personlig.',
    'TO_DO','HIGH',current_date,'altovena','website_lead',v_contact_id::text,
    'sales','Se henvendelsen i Altovena CRM, vurder behov og kontakt kunden personlig.',
    0,jsonb_build_object('submission_id',p_submission_id::text,'brand_id','altovena',
      'product',p_product,'marketing_opt_in',false,'source','altovena.com/contact')
  ) returning id into v_work_id;

  insert into public.altovena_intake_receipts(submission_id,contact_id,work_item_id)
  values (p_submission_id,v_contact_id,v_work_id);

  return jsonb_build_object('ok',true,'accepted',true,
    'leadId',v_contact_id::text,'workItemId',v_work_id::text,'duplicate',false);
end $$;
revoke execute on function public.altovena_receive_lead(uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.altovena_receive_lead(uuid,text,text,text,text,text) to service_role;
comment on function public.altovena_receive_lead(uuid,text,text,text,text,text) is
  'Atomic Altovena-only contact/work-item intake. Only service_role may call. No cross-brand merges.';

-- Authenticated staff mutations go through the existing verified brand-workspace
-- middleware and this service-role-only RPC, recording an internal audit event.
-- Do NOT expose this RPC directly to browser authentication roles.
create or replace function public.altovena_mark_lead_task(
  p_task_id uuid,
  p_status text,
  p_actor_email text
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_actor text := lower(btrim(coalesce(p_actor_email,'')));
  v_id uuid;
  v_status text;
begin
  if p_task_id is null
    or p_status is null
    or p_status not in ('IN_PROGRESS','DONE')
    or v_actor !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then raise exception 'Invalid Altovena task mutation'; end if;

  update public.work_items
    set status=p_status,
        updated_at=now(),
        metadata=jsonb_set(
          coalesce(metadata,'{}'::jsonb),
          '{status_history}',
          (case when jsonb_typeof(metadata->'status_history')='array'
                 then metadata->'status_history' else '[]'::jsonb end)
          || jsonb_build_array(jsonb_build_object(
             'at',now(),
             'status',p_status,
             'actor',v_actor,
             'source','verified_altovena_workspace'
          )),
          true
        )
    where id=p_task_id
      and brand_id='altovena'
      and source_type='website_lead'
      and status in ('TO_DO','IN_PROGRESS','REVIEW')
    returning id,status into v_id,v_status;

  if v_id is null then
    return jsonb_build_object('ok',false,'error','TASK_NOT_FOUND_OR_ALREADY_HANDLED');
  end if;
  return jsonb_build_object('ok',true,'brand','altovena',
    'task',jsonb_build_object('id',v_id::text,'status',v_status));
end $$;
revoke execute on function public.altovena_mark_lead_task(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.altovena_mark_lead_task(uuid,text,text) to service_role;
comment on function public.altovena_mark_lead_task(uuid,text,text) is
  'Verified staff-only, brand-scoped lead task transitions with append-only metadata history.';
