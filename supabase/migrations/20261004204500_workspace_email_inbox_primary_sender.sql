-- Workspace customer inbox + deterministic outbound sender selection.
-- Keeps employee inbox visibility inside the same brand/CRM scope as workspace CRM.

alter table public.brand_email_configs
  add column if not exists is_primary_sender boolean not null default false,
  add column if not exists reply_to_address text;

alter table public.brand_email_configs
  drop constraint if exists brand_email_configs_reply_to_address_check;
alter table public.brand_email_configs
  add constraint brand_email_configs_reply_to_address_check
  check (
    reply_to_address is null
    or lower(btrim(reply_to_address)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  );

create unique index if not exists brand_email_configs_one_primary_sender_per_brand_idx
  on public.brand_email_configs (brand_id)
  where is_active = true and is_primary_sender = true;

-- Explicit current workspace sender policy.
update public.brand_email_configs
set is_primary_sender = case
  when brand_id='pinosoecolife' and lower(email_address)='post@pinosoecolife.com' then true
  when brand_id='zeneco' and lower(email_address)='freddy@zenecohomes.com' then true
  else false
end
where brand_id in ('pinosoecolife','zeneco');

create or replace function public.workspace_brand_email_inbox_snapshot(
  p_brand_key text,p_user_id uuid,p_email text,p_search text default ''
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_email_inbox_snapshot$
declare
  v_brand_id uuid;
  v_permissions text[];
  v_search text := lower(btrim(coalesce(p_search,'')));
  v_messages jsonb := '[]'::jsonb;
  v_unread integer := 0;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_email is null or p_email<>lower(btrim(p_email))
    or length(v_search)>80
  then return null; end if;

  select b.id,m.permissions into v_brand_id,v_permissions
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['email.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  if p_brand_key='zeneco' then
    if not ('crm.joint.read'=any(v_permissions)) then return jsonb_build_object('messages','[]'::jsonb,'unreadCount',0); end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'messageId',x.message_id,'threadId',x.thread_id,
      'fromAddress',x.from_address,'fromName',x.from_name,
      'subject',x.subject,'bodyText',x.body_text,
      'receivedAt',x.received_at,'isRead',x.is_read,'repliedAt',x.replied_at,
      'crmContactId',x.crm_contact_id,'contactName',x.contact_name,
      'aiSummary',x.ai_summary,'aiIntent',x.ai_intent,'aiUrgency',x.ai_urgency,
      'aiSuggestedAction',x.ai_suggested_action
    ) order by x.received_at desc nulls last,x.id),'[]'::jsonb),
    count(*) filter (where coalesce(x.is_read,false)=false)::integer
    into v_messages,v_unread
    from (
      select e.id,e.message_id,e.thread_id,e.from_address,e.from_name,
        coalesce(nullif(e.subject,''),'(Uten emne)') as subject,
        left(coalesce(e.body_text,''),20000) as body_text,e.received_at,
        coalesce(e.is_read,false) as is_read,e.replied_at,e.crm_contact_id,
        c.name as contact_name,e.ai_summary,e.ai_intent,e.ai_urgency,e.ai_suggested_action
      from public.email_messages e
      join public.contacts c on c.id=e.crm_contact_id
      join core.zeneco_joint_lead_cohort j on j.contact_id=c.id and j.brand_id=v_brand_id
      where e.brand_id='zeneco' and e.direction='inbound' and coalesce(e.is_archived,false)=false
        and c.brand_id='zeneco' and c.brand='zeneco'
        and j.eligibility='approved'
        and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
        and length(btrim(coalesce(j.evidence_reference,''))) >= 8
        and j.reviewed_at is not null
        and (v_search='' or position(v_search in lower(
          coalesce(e.from_name,'')||' '||coalesce(e.from_address,'')||' '||
          coalesce(e.subject,'')||' '||coalesce(c.name,'')
        ))>0)
      order by e.received_at desc nulls last,e.id
      limit 100
    ) x;
  else
    if not ('crm.read'=any(v_permissions)) then return jsonb_build_object('messages','[]'::jsonb,'unreadCount',0); end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'messageId',x.message_id,'threadId',x.thread_id,
      'fromAddress',x.from_address,'fromName',x.from_name,
      'subject',x.subject,'bodyText',x.body_text,
      'receivedAt',x.received_at,'isRead',x.is_read,'repliedAt',x.replied_at,
      'crmContactId',x.crm_contact_id,'contactName',x.contact_name,
      'aiSummary',x.ai_summary,'aiIntent',x.ai_intent,'aiUrgency',x.ai_urgency,
      'aiSuggestedAction',x.ai_suggested_action
    ) order by x.received_at desc nulls last,x.id),'[]'::jsonb),
    count(*) filter (where coalesce(x.is_read,false)=false)::integer
    into v_messages,v_unread
    from (
      select e.id,e.message_id,e.thread_id,e.from_address,e.from_name,
        coalesce(nullif(e.subject,''),'(Uten emne)') as subject,
        left(coalesce(e.body_text,''),20000) as body_text,e.received_at,
        coalesce(e.is_read,false) as is_read,e.replied_at,e.crm_contact_id,
        c.name as contact_name,e.ai_summary,e.ai_intent,e.ai_urgency,e.ai_suggested_action
      from public.email_messages e
      join public.contacts c on c.id=e.crm_contact_id
      where e.brand_id=p_brand_key and e.direction='inbound' and coalesce(e.is_archived,false)=false
        and c.brand_id=p_brand_key and c.brand=p_brand_key
        and (v_search='' or position(v_search in lower(
          coalesce(e.from_name,'')||' '||coalesce(e.from_address,'')||' '||
          coalesce(e.subject,'')||' '||coalesce(c.name,'')
        ))>0)
      order by e.received_at desc nulls last,e.id
      limit 100
    ) x;
  end if;

  return jsonb_build_object('messages',v_messages,'unreadCount',coalesce(v_unread,0));
end; $workspace_email_inbox_snapshot$;

revoke execute on function public.workspace_brand_email_inbox_snapshot(text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_inbox_snapshot(text,uuid,text,text)
  to service_role;

create or replace function public.workspace_brand_email_message_resolve(
  p_brand_key text,p_user_id uuid,p_email text,p_message_row_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $workspace_email_message_resolve$
declare
  v_brand_id uuid;
  v_permissions text[];
  v_row record;
begin
  if p_brand_key is null or p_brand_key !~ '^[a-z0-9][a-z0-9-]{1,62}$'
    or p_user_id is null or p_email is null or p_email<>lower(btrim(p_email))
    or p_message_row_id is null
  then return null; end if;

  select b.id,m.permissions into v_brand_id,v_permissions
  from core.brand_workspace_memberships m
  join core.brands b on b.id=m.brand_id and b.brand_key=p_brand_key
  where m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['email.read']::text[]
  for share of m;
  if v_brand_id is null then return null; end if;

  if p_brand_key='zeneco' then
    if not ('crm.joint.read'=any(v_permissions)) then return null; end if;
    select e.*,c.name as contact_name into v_row
    from public.email_messages e
    join public.contacts c on c.id=e.crm_contact_id
    join core.zeneco_joint_lead_cohort j on j.contact_id=c.id and j.brand_id=v_brand_id
    where e.id=p_message_row_id and e.brand_id='zeneco' and e.direction='inbound'
      and c.brand_id='zeneco' and c.brand='zeneco'
      and j.eligibility='approved'
      and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
      and length(btrim(coalesce(j.evidence_reference,''))) >= 8
      and j.reviewed_at is not null;
  else
    if not ('crm.read'=any(v_permissions)) then return null; end if;
    select e.*,c.name as contact_name into v_row
    from public.email_messages e
    join public.contacts c on c.id=e.crm_contact_id
    where e.id=p_message_row_id and e.brand_id=p_brand_key and e.direction='inbound'
      and c.brand_id=p_brand_key and c.brand=p_brand_key;
  end if;

  if v_row.id is null then return null; end if;
  return jsonb_build_object(
    'id',v_row.id,'messageId',v_row.message_id,'threadId',v_row.thread_id,
    'fromAddress',lower(btrim(v_row.from_address)),'fromName',v_row.from_name,
    'subject',coalesce(nullif(v_row.subject,''),'(Uten emne)'),'bodyText',coalesce(v_row.body_text,''),
    'receivedAt',v_row.received_at,'isRead',coalesce(v_row.is_read,false),'repliedAt',v_row.replied_at,
    'crmContactId',v_row.crm_contact_id,'contactName',v_row.contact_name
  );
end; $workspace_email_message_resolve$;

revoke execute on function public.workspace_brand_email_message_resolve(text,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_message_resolve(text,uuid,text,uuid)
  to service_role;

create or replace function public.workspace_brand_email_mark_read(
  p_brand_key text,p_user_id uuid,p_email text,p_message_row_id uuid
) returns boolean language plpgsql security invoker set search_path='' as $workspace_email_mark_read$
declare
  v_message jsonb;
begin
  v_message := public.workspace_brand_email_message_resolve(
    p_brand_key,p_user_id,p_email,p_message_row_id
  );
  if v_message is null then return false; end if;

  update public.email_messages
  set is_read=true
  where id=p_message_row_id and direction='inbound' and brand_id=p_brand_key;
  return found;
end; $workspace_email_mark_read$;

revoke execute on function public.workspace_brand_email_mark_read(text,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.workspace_brand_email_mark_read(text,uuid,text,uuid)
  to service_role;

comment on function public.workspace_brand_email_inbox_snapshot(text,uuid,text,text) is
  'Brand-scoped employee customer inbox. Zen is limited to approved joint leads; other brands require CRM read.';
comment on function public.workspace_brand_email_message_resolve(text,uuid,text,uuid) is
  'Resolves one inbound workspace email only when the verified member may see the linked CRM contact.';
