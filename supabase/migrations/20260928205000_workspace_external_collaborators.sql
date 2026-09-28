-- Extend owner-managed workspace users to support external collaborators.
-- External users keep the same deny-by-default brand/module enforcement as staff,
-- with optional organisation metadata and an automatic access expiry gate.

alter table core.workspace_user_directory
  add column if not exists account_kind text not null default 'staff',
  add column if not exists organization text,
  add column if not exists access_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='workspace_user_directory_account_kind_check'
      and conrelid='core.workspace_user_directory'::regclass
  ) then
    alter table core.workspace_user_directory
      add constraint workspace_user_directory_account_kind_check
      check (account_kind in ('staff','external'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='workspace_user_directory_organization_check'
      and conrelid='core.workspace_user_directory'::regclass
  ) then
    alter table core.workspace_user_directory
      add constraint workspace_user_directory_organization_check
      check (organization is null or length(btrim(organization)) between 1 and 160);
  end if;
end $$;

comment on column core.workspace_user_directory.account_kind is
  'Owner classification only: internal staff or external collaborator. Authorisation still comes only from exact brand memberships and permissions.';
comment on column core.workspace_user_directory.organization is
  'Optional company/organisation for external collaborators.';
comment on column core.workspace_user_directory.access_expires_at is
  'Optional automatic login cutoff. Expiry never grants access; it only disables an otherwise-active directory identity.';

create or replace function public.workspace_login_directory(p_login text)
returns jsonb language sql stable security invoker set search_path = '' as $workspace_login_directory$
  select jsonb_build_object(
    'user_id',u.user_id,'username',u.username,'email',u.email,
    'display_name',u.display_name,
    'status',case
      when u.status='active' and (u.access_expires_at is null or u.access_expires_at>now()) then 'active'
      else 'disabled'
    end,
    'account_kind',u.account_kind,
    'organization',u.organization,
    'access_expires_at',u.access_expires_at,
    'expired',(u.access_expires_at is not null and u.access_expires_at<=now())
  )
  from core.workspace_user_directory u
  where u.username=lower(btrim(p_login)) or u.email=lower(btrim(p_login))
  limit 1;
$workspace_login_directory$;

revoke execute on function public.workspace_login_directory(text)
  from public, anon, authenticated;
grant execute on function public.workspace_login_directory(text) to service_role;

create or replace function public.workspace_user_admin_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $workspace_user_admin_snapshot$
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',u.user_id,'username',u.username,'email',u.email,
        'display_name',u.display_name,'status',u.status,
        'account_kind',u.account_kind,'organization',u.organization,
        'access_expires_at',u.access_expires_at,
        'expired',(u.access_expires_at is not null and u.access_expires_at<=now()),
        'created_at',u.created_at,'updated_at',u.updated_at,
        'memberships',coalesce((
          select jsonb_agg(jsonb_build_object(
            'brand_id',m.brand_id,'brand_key',b.brand_key,'brand_name',b.display_name,
            'status',m.status,'permissions',m.permissions,'updated_at',m.updated_at
          ) order by b.display_name)
          from core.brand_workspace_memberships m
          join core.brands b on b.id=m.brand_id
          where m.user_id=u.user_id
        ),'[]'::jsonb)
      ) order by u.display_name,u.username)
      from core.workspace_user_directory u
    ),'[]'::jsonb),
    'brands',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'brand_key',b.brand_key,'display_name',b.display_name
      ) order by b.display_name)
      from core.brands b
    ),'[]'::jsonb)
  );
$workspace_user_admin_snapshot$;

revoke execute on function public.workspace_user_admin_snapshot()
  from public, anon, authenticated;
grant execute on function public.workspace_user_admin_snapshot() to service_role;

create or replace function public.workspace_user_configure_v2(
  p_user_id uuid, p_username text, p_email text, p_display_name text,
  p_brand_access jsonb, p_actor text,
  p_account_kind text, p_organization text, p_access_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $workspace_user_configure_v2$
declare
  v_ok boolean;
  v_org text := nullif(btrim(coalesce(p_organization,'')),'');
begin
  if p_account_kind not in ('staff','external')
    or (v_org is not null and length(v_org) not between 1 and 160)
  then return false; end if;

  v_ok := public.workspace_user_configure(
    p_user_id,p_username,p_email,p_display_name,p_brand_access,p_actor
  );
  if v_ok is distinct from true then return false; end if;

  update core.workspace_user_directory
  set account_kind=p_account_kind,
      organization=v_org,
      access_expires_at=p_access_expires_at,
      updated_by_email=p_actor,
      updated_at=now()
  where user_id=p_user_id;

  return found;
exception
  when check_violation or foreign_key_violation then
    return false;
end;
$workspace_user_configure_v2$;

revoke execute on function public.workspace_user_configure_v2(
  uuid,text,text,text,jsonb,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.workspace_user_configure_v2(
  uuid,text,text,text,jsonb,text,text,text,timestamptz
) to service_role;
