create or replace function public.workspace_user_admin_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $workspace_user_admin_snapshot$
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',u.user_id,
        'username',u.username,
        'email',u.email,
        'display_name',u.display_name,
        'status',u.status,
        'account_kind',u.account_kind,
        'organization',u.organization,
        'access_expires_at',u.access_expires_at,
        'expired',(u.access_expires_at is not null and u.access_expires_at<=now()),
        'created_at',u.created_at,
        'updated_at',u.updated_at,
        'memberships',coalesce((
          select jsonb_agg(jsonb_build_object(
            'brand_id',m.brand_id,
            'brand_key',b.brand_key,
            'brand_name',b.display_name,
            'status',m.status,
            'permissions',m.permissions,
            'responsibilities',coalesce(r.responsibilities,'{}'::text[]),
            'updated_at',m.updated_at
          ) order by b.display_name)
          from core.brand_workspace_memberships m
          join core.brands b on b.id=m.brand_id
          left join core.brand_workspace_responsibilities r
            on r.brand_id=m.brand_id and r.user_id=m.user_id
          where m.user_id=u.user_id
        ),'[]'::jsonb)
      ) order by u.display_name,u.username)
      from core.workspace_user_directory u
    ),'[]'::jsonb),
    'brands',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,
        'brand_key',b.brand_key,
        'display_name',b.display_name
      ) order by b.display_name)
      from core.brands b
    ),'[]'::jsonb)
  );
$workspace_user_admin_snapshot$;

revoke execute on function public.workspace_user_admin_snapshot()
  from public, anon, authenticated;
grant execute on function public.workspace_user_admin_snapshot() to service_role;

create or replace function public.workspace_user_responsibilities_replace(
  p_user_id uuid,
  p_brand_responsibilities jsonb,
  p_actor text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $workspace_user_responsibilities_replace$
declare
  v_entry jsonb;
  v_brand_key text;
  v_brand_id uuid;
  v_responsibilities text[];
  v_brand_ids uuid[] := '{}'::uuid[];
  v_seen_keys text[] := '{}'::text[];
begin
  begin
    if p_user_id is null
      or jsonb_typeof(p_brand_responsibilities) <> 'array'
      or jsonb_array_length(p_brand_responsibilities) < 1
      or nullif(btrim(coalesce(p_actor,'')),'') is null
    then
      raise exception 'invalid responsibility payload';
    end if;

    if not exists (
      select 1
      from core.workspace_user_directory u
      where u.user_id = p_user_id
    ) then
      raise exception 'unknown workspace user';
    end if;

    for v_entry in
      select value from jsonb_array_elements(p_brand_responsibilities)
    loop
      if jsonb_typeof(v_entry) <> 'object'
        or jsonb_typeof(v_entry->'responsibilities') <> 'array'
      then
        raise exception 'invalid responsibility entry';
      end if;

      v_brand_key := lower(btrim(coalesce(v_entry->>'brandKey','')));
      if v_brand_key = '' or v_brand_key = any(v_seen_keys) then
        raise exception 'invalid or duplicate brand key';
      end if;

      select b.id
      into v_brand_id
      from core.brands b
      where b.brand_key = v_brand_key
      limit 1;

      if v_brand_id is null or not exists (
        select 1
        from core.brand_workspace_memberships m
        where m.brand_id = v_brand_id
          and m.user_id = p_user_id
          and m.status = 'active'
      ) then
        raise exception 'brand membership unavailable';
      end if;

      select coalesce(array_agg(x order by x), '{}'::text[])
      into v_responsibilities
      from jsonb_array_elements_text(v_entry->'responsibilities') as t(x);

      if not (v_responsibilities <@ array[
        'new-leads','property-matching','seo-content','social-reels',
        'newsletter','corporate','nexus-review'
      ]::text[]) then
        raise exception 'unknown responsibility';
      end if;

      insert into core.brand_workspace_responsibilities (
        brand_id,user_id,responsibilities,updated_by_email,updated_at
      ) values (
        v_brand_id,p_user_id,v_responsibilities,p_actor,now()
      )
      on conflict (brand_id,user_id) do update
      set responsibilities=excluded.responsibilities,
          updated_by_email=excluded.updated_by_email,
          updated_at=excluded.updated_at;

      v_brand_ids := array_append(v_brand_ids,v_brand_id);
      v_seen_keys := array_append(v_seen_keys,v_brand_key);
    end loop;

    delete from core.brand_workspace_responsibilities
    where user_id=p_user_id
      and not (brand_id = any(v_brand_ids));
  exception
    when others then
      return false;
  end;

  return true;
end;
$workspace_user_responsibilities_replace$;

revoke execute on function public.workspace_user_responsibilities_replace(uuid,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.workspace_user_responsibilities_replace(uuid,jsonb,text)
  to service_role;
