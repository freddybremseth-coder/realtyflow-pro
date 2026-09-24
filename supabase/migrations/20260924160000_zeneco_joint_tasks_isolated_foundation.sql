-- ISOLATED task ledger for owner-reviewed NEW Zen Eco Homes collaborations.
-- Do NOT import public.work_items, email, portal, socials, contact notes, or
-- pre-agreement tasks. NO staff role is activated; service-role-only RPCs.
-- A task is not visible merely because its contact_id/brand matches: each
-- request revalidates exact membership, separate tasks.* grant and owner cohort.
create table if not exists core.zeneco_joint_work_items (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references core.zeneco_joint_lead_cohort(contact_id) on delete restrict,
  brand_id uuid not null references core.brands(id) on delete restrict,
  title text not null check (length(btrim(title)) between 3 and 160 and title !~ '[[:cntrl:]]'),
  due_on date,
  status text not null default 'open' check (status in ('open','done')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_by_email text not null,
  created_at timestamptz not null default now()
    check (created_at >= timestamptz '2026-09-23 22:00:00+00'),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  finished_by_user_id uuid references auth.users(id) on delete restrict,
  finished_by_email text,
  check ((status = 'open' and finished_at is null and finished_by_user_id is null and finished_by_email is null)
      or (status = 'done' and finished_at is not null and finished_by_user_id is not null and finished_by_email is not null))
);
create index if not exists zeneco_joint_work_items_contact_idx
  on core.zeneco_joint_work_items(contact_id, created_at desc, id);
alter table core.zeneco_joint_work_items enable row level security;
revoke all on core.zeneco_joint_work_items from public, anon, authenticated;
grant select, insert, update on core.zeneco_joint_work_items to service_role;
comment on table core.zeneco_joint_work_items is
  'Brand-isolated new collaboration tasks only, never copied from legacy work_items or any historical CRM conversation.';

-- This function returns only a limited projection and at most 51 new-only
-- tasks for one explicitly reviewed new Zen contact. Do not reveal old tasks,
-- email history, global work-item metadata, or other-brand customer data.
create or replace function public.workspace_zeneco_joint_tasks(
  p_user_id uuid, p_email text, p_contact_id uuid
) returns jsonb language sql stable security invoker set search_path = '' as $joint_tasks_read$
  with scoped as (
    select t.id, t.contact_id, t.title, t.due_on, t.status,
      t.created_at, t.updated_at, t.created_by_email,
      t.finished_at, t.finished_by_email
    from core.brand_workspace_memberships m
    join core.brands b on b.id=m.brand_id and b.brand_key='zeneco'
    join core.zeneco_joint_lead_cohort j on j.brand_id=b.id
      and j.contact_id=p_contact_id and j.eligibility='approved'
      and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
      and length(btrim(coalesce(j.evidence_reference,''))) >= 8
      and j.reviewed_at is not null
    join public.contacts c on c.id=j.contact_id and c.brand_id='zeneco' and c.brand='zeneco'
      and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
    join core.zeneco_joint_work_items t on t.contact_id=c.id and t.brand_id=b.id
      and t.created_at >= timestamptz '2026-09-23 22:00:00+00'
    where m.user_id=p_user_id and m.email=lower(btrim(p_email)) and m.status='active'
      and m.permissions @> array['crm.joint.read','tasks.joint.read']::text[]
    order by t.created_at desc, t.id
    limit 51
  )
  select jsonb_build_object(
    'tasks', coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,'contact_id',t.contact_id,'title',t.title,'due_on',t.due_on,
      'status',t.status,'created_at',t.created_at,'updated_at',t.updated_at,
      'created_by_email',t.created_by_email,'finished_at',t.finished_at,
      'finished_by_email',t.finished_by_email
    ) order by t.created_at desc,t.id), '[]'::jsonb),
    'hasMore',count(*) > 50
  ) from scoped t;
$joint_tasks_read$;
revoke execute on function public.workspace_zeneco_joint_tasks(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.workspace_zeneco_joint_tasks(uuid,text,uuid) to service_role;

-- Staff creation serializes with the owner's revoke via the SAME CRM row lock
-- as workspace_zeneco_review_lead. A separate INSERT statement sees fresh
-- membership/cohort eligibility after waiting. No notifications or outbound
-- contact and no writes to public.work_items or public.contacts.
create or replace function public.workspace_zeneco_joint_task_create(
  p_user_id uuid, p_email text, p_contact_id uuid, p_title text, p_due_on date
) returns jsonb language plpgsql security invoker set search_path = '' as $joint_task_create$
declare v_task record;
begin
  if p_user_id is null or p_contact_id is null or
    p_email is null or p_email <> lower(btrim(p_email)) or
    p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or
    p_title is null or length(btrim(p_title)) not between 3 and 160 or
    p_title ~ '[[:cntrl:]]' then return null; end if;
  perform 1 from public.contacts c where c.id=p_contact_id
    and c.brand_id='zeneco' and c.brand='zeneco'
    and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
    for update;
  if not found then return null; end if;

  insert into core.zeneco_joint_work_items
    (contact_id,brand_id,title,due_on,created_by_user_id,created_by_email)
  select c.id,b.id,btrim(p_title),p_due_on,p_user_id,p_email
  from public.contacts c
  join core.zeneco_joint_lead_cohort j on j.contact_id=c.id
    and j.eligibility='approved'
    and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
    and length(btrim(coalesce(j.evidence_reference,''))) >= 8
    and j.reviewed_at is not null
  join core.brands b on b.id=j.brand_id and b.brand_key='zeneco'
  join core.brand_workspace_memberships m on m.brand_id=b.id
    and m.user_id=p_user_id and m.email=p_email and m.status='active'
    and m.permissions @> array['crm.joint.read','tasks.joint.read','tasks.joint.write']::text[]
  where c.id=p_contact_id and c.brand_id='zeneco' and c.brand='zeneco'
    and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
  returning id,contact_id,title,due_on,status,created_at,created_by_email
    into v_task;
  if not found then return null; end if;
  return jsonb_build_object('id',v_task.id,'contact_id',v_task.contact_id,
    'title',v_task.title,'due_on',v_task.due_on,'status',v_task.status,
    'created_at',v_task.created_at,'created_by_email',v_task.created_by_email);
end; $joint_task_create$;
revoke execute on function public.workspace_zeneco_joint_task_create(uuid,text,uuid,text,date)
  from public, anon, authenticated;
grant execute on function public.workspace_zeneco_joint_task_create(uuid,text,uuid,text,date)
  to service_role;

-- Finish only an OPEN joint task for an independently approved NEW Zen lead;
-- never mutate a row in the global work_items table or inherit legacy tasks.
create or replace function public.workspace_zeneco_joint_task_complete(
  p_user_id uuid, p_email text, p_contact_id uuid, p_task_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $joint_task_complete$
declare v_task record;
begin
  if p_user_id is null or p_contact_id is null or p_task_id is null or
    p_email is null or p_email <> lower(btrim(p_email)) or
    p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then return null; end if;
  perform 1 from public.contacts c where c.id=p_contact_id
    and c.brand_id='zeneco' and c.brand='zeneco'
    and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
    for update;
  if not found then return null; end if;
  update core.zeneco_joint_work_items t set
    status='done',updated_at=now(),finished_at=now(),
    finished_by_user_id=p_user_id,finished_by_email=p_email
  where t.id=p_task_id and t.contact_id=p_contact_id and t.status='open'
    and exists (
      select 1 from public.contacts c
      join core.zeneco_joint_lead_cohort j on j.contact_id=c.id
        and j.eligibility='approved'
        and j.first_genuine_enquiry_at >= timestamptz '2026-09-23 22:00:00+00'
        and length(btrim(coalesce(j.evidence_reference,''))) >= 8
        and j.reviewed_at is not null
      join core.brands b on b.id=j.brand_id and b.brand_key='zeneco'
      join core.brand_workspace_memberships m on m.brand_id=b.id
        and m.user_id=p_user_id and m.email=p_email and m.status='active'
        and m.permissions @> array['crm.joint.read','tasks.joint.read','tasks.joint.write']::text[]
      where c.id=p_contact_id and c.brand_id='zeneco' and c.brand='zeneco'
        and c.created_at >= timestamptz '2026-09-23 22:00:00+00'
        and t.brand_id=b.id
    )
  returning t.id,t.contact_id,t.title,t.due_on,t.status,t.updated_at,
    t.finished_at,t.finished_by_email into v_task;
  if not found then return null; end if;
  return jsonb_build_object('id',v_task.id,'contact_id',v_task.contact_id,
    'title',v_task.title,'due_on',v_task.due_on,'status',v_task.status,
    'updated_at',v_task.updated_at,'finished_at',v_task.finished_at,
    'finished_by_email',v_task.finished_by_email);
end; $joint_task_complete$;
revoke execute on function public.workspace_zeneco_joint_task_complete(uuid,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.workspace_zeneco_joint_task_complete(uuid,text,uuid,uuid)
  to service_role;
