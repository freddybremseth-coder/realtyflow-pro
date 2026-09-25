-- Owner-configured workspace access plans. These are PREVIEW/DRAFT records only.
-- They never enable login, create core.brand_workspace_memberships, or grant data access.
-- A separate audited activation workflow can be added only after legacy APIs are scoped.
create table if not exists core.brand_workspace_access_plans (
  brand_id uuid not null references core.brands(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  permissions text[] not null default '{}'::text[]
    check (permissions <@ array[
      'crm.read', 'crm.write', 'crm.joint.read', 'crm.joint.write',
      'tasks.joint.read', 'tasks.joint.write', 'properties.catalog.read',
      'marketing.read', 'marketing.draft', 'marketing.publish'
    ]::text[]),
  status text not null default 'draft' check (status in ('draft', 'discarded')),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (brand_id, email)
);
create table if not exists core.brand_workspace_access_plan_audit (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  email text not null,
  action text not null check (action in ('draft_saved', 'draft_discarded')),
  permissions text[] not null,
  actor_email text not null,
  at timestamptz not null default now()
);
create or replace function core.audit_brand_workspace_access_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into core.brand_workspace_access_plan_audit
    (brand_id,email,action,permissions,actor_email)
  values
    (new.brand_id,new.email,
     case when new.status = 'discarded' then 'draft_discarded' else 'draft_saved' end,
     new.permissions,new.updated_by);
  return new;
end; $$;
drop trigger if exists trg_brand_workspace_access_plan_audit on core.brand_workspace_access_plans;
create trigger trg_brand_workspace_access_plan_audit
 after insert or update on core.brand_workspace_access_plans
 for each row execute function core.audit_brand_workspace_access_plan();
alter table core.brand_workspace_access_plans enable row level security;
alter table core.brand_workspace_access_plan_audit enable row level security;
revoke all on core.brand_workspace_access_plans, core.brand_workspace_access_plan_audit from anon, authenticated;
revoke all on core.brand_workspace_access_plan_audit from service_role;
grant select, insert, update, delete on core.brand_workspace_access_plans to service_role;
grant select on core.brand_workspace_access_plan_audit to service_role;
comment on table core.brand_workspace_access_plans is 'Owner-designated access drafts only: never used in authorization.';

-- Expose ONLY service-role RPCs in public, not the core schema to browsers.
-- Keep actual auth decision in the server route AND check membership on each call.
create or replace function public.workspace_access_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'brands', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'brand_key', b.brand_key, 'display_name', b.display_name
    ) order by b.display_name) from core.brands b), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
      'brand_id', p.brand_id, 'email', p.email, 'permissions', p.permissions,
      'status', p.status, 'updated_by', p.updated_by, 'updated_at', p.updated_at
    ) order by p.updated_at desc) from core.brand_workspace_access_plans p), '[]'::jsonb)
  );
$$;

create or replace function public.workspace_access_save_draft(
  p_brand_key text, p_email text, p_permissions text[], p_status text, p_actor text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_brand_id uuid;
begin
  select b.id into v_brand_id from core.brands b where b.brand_key = p_brand_key;
  if v_brand_id is null then return false; end if;
  if p_status = 'discarded' then
    update core.brand_workspace_access_plans
      set status = 'discarded', updated_by = p_actor, updated_at = now()
      where brand_id = v_brand_id and email = p_email and status = 'draft';
    return found;
  end if;
  if p_status <> 'draft' then return false; end if;
  insert into core.brand_workspace_access_plans
    (brand_id, email, permissions, status, updated_by, updated_at)
  values (v_brand_id, p_email, p_permissions, 'draft', p_actor, now())
  on conflict (brand_id, email) do update
    set permissions = excluded.permissions, status = 'draft',
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return true;
end; $$;

-- Read only the one brand's exact grant, not unrelated membership rows.
create or replace function public.workspace_brand_grant(p_brand_key text, p_email text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'brand', jsonb_build_object('id', b.id, 'brand_key', b.brand_key),
    'grant', (select jsonb_build_object(
      'brand_id', m.brand_id, 'user_id', m.user_id, 'email', m.email,
      'status', m.status, 'permissions', m.permissions
    ) from core.brand_workspace_memberships m
    where m.brand_id = b.id and m.email = p_email)
  )
  from core.brands b where b.brand_key = p_brand_key;
$$;
revoke execute on function public.workspace_access_snapshot() from public, anon, authenticated;
revoke execute on function public.workspace_access_save_draft(text,text,text[],text,text) from public, anon, authenticated;
revoke execute on function public.workspace_brand_grant(text,text) from public, anon, authenticated;
grant execute on function public.workspace_access_snapshot() to service_role;
grant execute on function public.workspace_access_save_draft(text,text,text[],text,text) to service_role;
grant execute on function public.workspace_brand_grant(text,text) to service_role;

-- List only exact brand-membership candidates for the session email. The server
-- independently checks each returned user_id with Supabase Auth before showing it.
create or replace function public.workspace_user_brand_grants(p_email text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand', jsonb_build_object('id', b.id, 'brand_key', b.brand_key, 'display_name', b.display_name),
    'grant', jsonb_build_object('brand_id', m.brand_id, 'user_id', m.user_id,
      'email', m.email, 'status', m.status, 'permissions', m.permissions)
  ) order by b.display_name), '[]'::jsonb)
  from core.brand_workspace_memberships m
  join core.brands b on b.id = m.brand_id
  where m.email = lower(btrim(p_email)) and m.status = 'active';
$$;
revoke execute on function public.workspace_user_brand_grants(text) from public, anon, authenticated;
grant execute on function public.workspace_user_brand_grants(text) to service_role;

-- Owner-only, aggregate CRM readiness counts for each configured brand.
-- This never returns contact identity, methods, notes, or other customer details,
-- and NEVER assigns/transfers a customer. Expose via owner-only API, not staff UI.
create or replace function public.workspace_contact_brand_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand_key', grouped.brand_key,
    'assigned', grouped.assigned,
    'needs_review', grouped.needs_review
  ) order by grouped.brand_key), '[]'::jsonb)
  from (
    select b.brand_key,
      count(c.id) filter (
        where c.brand_id = b.brand_key and c.brand = b.brand_key
      )::integer as assigned,
      count(c.id) filter (
        where c.id is not null and
          (c.brand_id is distinct from b.brand_key or c.brand is distinct from b.brand_key)
      )::integer as needs_review
    from core.brands b
    left join public.contacts c
      on c.brand_id = b.brand_key or c.brand = b.brand_key
    group by b.brand_key
  ) grouped;
$$;
revoke execute on function public.workspace_contact_brand_counts()
  from public, anon, authenticated;
grant execute on function public.workspace_contact_brand_counts() to service_role;
