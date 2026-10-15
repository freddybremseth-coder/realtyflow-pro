-- Brand Operations is an explicit, per-brand operational label.
-- It does not change the signed WORKSPACE_MEMBER app role or grant any new API permissions.
alter table core.brand_workspace_memberships
  add column if not exists operational_role text not null default 'STANDARD';

alter table core.brand_workspace_memberships
  drop constraint if exists brand_workspace_memberships_operational_role_check;
alter table core.brand_workspace_memberships
  add constraint brand_workspace_memberships_operational_role_check
  check (operational_role in ('STANDARD', 'BRAND_OPERATIONS'));

-- Include the role in the already service-role-only, independently verified grant lookups.
-- The caller must STILL independently verify auth.users identity and permission grants.
create or replace function public.workspace_brand_grant(p_brand_key text, p_email text)
returns jsonb language sql stable set search_path to '' as $$
  select jsonb_build_object(
    'brand', jsonb_build_object('id', b.id, 'brand_key', b.brand_key),
    'grant', (select jsonb_build_object(
      'brand_id', m.brand_id, 'user_id', m.user_id, 'email', m.email,
      'status', m.status, 'permissions', m.permissions,
      'operational_role', m.operational_role
    ) from core.brand_workspace_memberships m
    where m.brand_id = b.id and m.email = p_email)
  )
  from core.brands b where b.brand_key = p_brand_key;
$$;

create or replace function public.workspace_user_brand_grants(p_email text)
returns jsonb language sql stable set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'brand', jsonb_build_object('id', b.id, 'brand_key', b.brand_key, 'display_name', b.display_name),
    'grant', jsonb_build_object('brand_id', m.brand_id, 'user_id', m.user_id,
      'email', m.email, 'status', m.status, 'permissions', m.permissions,
      'operational_role', m.operational_role)
  ) order by b.display_name), '[]'::jsonb)
  from core.brand_workspace_memberships m
  join core.brands b on b.id = m.brand_id
  where m.email = lower(btrim(p_email)) and m.status = 'active';
$$;

comment on column core.brand_workspace_memberships.operational_role is
  'Per-brand operational profile. Does not imply API access: every action requires verified membership and explicit permission.';
