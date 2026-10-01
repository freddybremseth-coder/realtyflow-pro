-- Keep the workspace staff security preflight aligned with reviewed public
-- SECURITY DEFINER metadata endpoints. This does not grant any new access.
--
-- art_public_print_master_metadata is intentionally callable by anon/authenticated
-- for published artwork only and returns metadata (artwork_id, role, mime type,
-- pixel dimensions) without bucket/object paths or private master contents.
create or replace function public.workspace_staff_security_preflight()
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_required_tables_rls boolean := false;
  v_private_buckets_present boolean := false;
  v_private_buckets_private boolean := false;
  v_private_bucket_auth_policies integer := 0;
  v_operational_storage_auth_write_policies integer := 0;
  v_direct_customer_policy_risk integer := 0;
  v_direct_internal_policy_risk integer := 0;
  v_direct_security_definer_risk integer := 0;
begin
  select count(*) = 4 and bool_and(c.relrowsecurity)
    into v_required_tables_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('contacts','work_items','portal_messages','brand_settings')
    and c.relkind in ('r','p');

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'buckets'
      and c.relkind in ('r','p')
  ) then
    begin
      execute $q$
        select count(*) = 2,
               count(*) = 2 and bool_and(not public)
        from storage.buckets
        where id in ('property-documents','caecv-documents')
      $q$ into v_private_buckets_present, v_private_buckets_private;
    exception
      when insufficient_privilege or undefined_table or invalid_schema_name then
        v_private_buckets_present := false;
        v_private_buckets_private := false;
    end;
  end if;

  select count(*)::integer into v_private_bucket_auth_policies
  from pg_catalog.pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    and (
      coalesce(p.qual,'') ilike '%property-documents%'
      or coalesce(p.with_check,'') ilike '%property-documents%'
      or coalesce(p.qual,'') ilike '%caecv-documents%'
      or coalesce(p.with_check,'') ilike '%caecv-documents%'
    )
    and (
      (p.cmd in ('ALL','SELECT','UPDATE','DELETE')
        and coalesce(p.qual,'') not ilike '%olivia_private.is_internal_user%')
      or
      (p.cmd in ('ALL','INSERT','UPDATE')
        and coalesce(p.with_check,'') not ilike '%olivia_private.is_internal_user%')
    );

  select count(*)::integer into v_operational_storage_auth_write_policies
  from pg_catalog.pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.cmd in ('ALL','INSERT','UPDATE','DELETE')
    and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    and (
      (
        (
          coalesce(p.qual,'') ilike '%plot-assets%'
          or coalesce(p.with_check,'') ilike '%plot-assets%'
          or coalesce(p.qual,'') ilike '%ad-creatives%'
          or coalesce(p.with_check,'') ilike '%ad-creatives%'
        )
      )
      or
      (
        (
          coalesce(p.qual,'') ilike '%olivia-field-observations%'
          or coalesce(p.with_check,'') ilike '%olivia-field-observations%'
        )
        and (
          (p.cmd in ('ALL','UPDATE','DELETE')
            and coalesce(p.qual,'') not ilike '%olivia_private.is_internal_user%')
          or
          (p.cmd in ('ALL','INSERT','UPDATE')
            and coalesce(p.with_check,'') not ilike '%olivia_private.is_internal_user%')
        )
      )
    );

  select count(*)::integer into v_direct_customer_policy_risk
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('contacts','work_items','portal_messages','brand_settings')
    and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    and (
      (p.cmd in ('ALL','SELECT','UPDATE','DELETE')
        and coalesce(regexp_replace(lower(p.qual),'[()[:space:]]','','g'),'') not in ('','false'))
      or
      (p.cmd in ('ALL','INSERT','UPDATE')
        and coalesce(regexp_replace(lower(p.with_check),'[()[:space:]]','','g'),'') not in ('','false'))
    );

  select count(*)::integer into v_direct_internal_policy_risk
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('agentic_approvals','plot_assets')
    and p.cmd in ('ALL','SELECT','INSERT','UPDATE','DELETE')
    and not (p.tablename = 'plot_assets' and p.cmd = 'SELECT')
    and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    and (
      (p.cmd in ('ALL','SELECT','UPDATE','DELETE')
        and coalesce(regexp_replace(lower(p.qual),'[()[:space:]]','','g'),'') not in ('','false'))
      or
      (p.cmd in ('ALL','INSERT','UPDATE')
        and coalesce(regexp_replace(lower(p.with_check),'[()[:space:]]','','g'),'') not in ('','false'))
    );

  select count(*)::integer into v_direct_security_definer_risk
  from pg_catalog.pg_proc pr
  join pg_catalog.pg_namespace n on n.oid = pr.pronamespace
  where n.nspname = 'public'
    and pr.prosecdef
    and pr.proname not in (
      'art_gallery_admin_master_status',
      'art_public_print_master_metadata'
    )
    and (
      pg_catalog.has_function_privilege('anon', pr.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', pr.oid, 'EXECUTE')
    );

  return jsonb_build_object(
    'required_customer_tables_rls', v_required_tables_rls,
    'private_document_buckets_present', v_private_buckets_present,
    'private_document_buckets_private', v_private_buckets_private,
    'private_document_authenticated_policies', v_private_bucket_auth_policies,
    'operational_storage_authenticated_write_policies', v_operational_storage_auth_write_policies,
    'direct_customer_policy_risk', v_direct_customer_policy_risk,
    'direct_internal_policy_risk', v_direct_internal_policy_risk,
    'direct_security_definer_risk', v_direct_security_definer_risk,
    'safe_for_workspace_auth',
      v_required_tables_rls
      and v_private_buckets_present
      and v_private_buckets_private
      and v_private_bucket_auth_policies = 0
      and v_operational_storage_auth_write_policies = 0
      and v_direct_customer_policy_risk = 0
      and v_direct_internal_policy_risk = 0
      and v_direct_security_definer_risk = 0
  );
end;
$function$;

revoke execute on function public.workspace_staff_security_preflight()
  from public, anon, authenticated;
grant execute on function public.workspace_staff_security_preflight()
  to service_role;
