-- READ-ONLY security preflight for any future WORKSPACE_MEMBER activation.
-- This migration does NOT create users, memberships, invitations or customer access.
-- It exists to make direct Supabase Auth/storage exposure an explicit rollout blocker.

create or replace function public.workspace_staff_security_preflight()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $workspace_staff_security_preflight$
declare
  v_required_tables_rls boolean := false;
  v_private_buckets_present boolean := false;
  v_private_buckets_private boolean := false;
  v_private_bucket_auth_policies integer := 0;
  v_operational_storage_auth_write_policies integer := 0;
  v_direct_customer_policy_risk integer := 0;
  v_direct_internal_policy_risk integer := 0;
begin
  -- Customer/task/message/settings tables used by RealtyFlow must all keep RLS.
  select count(*) = 4 and bool_and(c.relrowsecurity)
    into v_required_tables_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('contacts','work_items','portal_messages','brand_settings')
    and c.relkind in ('r','p');

  -- A workspace user's Supabase Auth token must not directly unlock the
  -- private document buckets. Current workspace functionality has NO need for
  -- browser-level access to either bucket.
  --
  -- IMPORTANT: do not resolve storage.buckets with to_regclass as the caller:
  -- a deliberately narrow CI service_role may have no USAGE on schema storage.
  -- Inspect existence via pg_catalog, then fail CLOSED if metadata cannot be
  -- read. Production service_role may read storage metadata, but that privilege
  -- is never granted by this migration merely to satisfy the preflight.
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

  -- Conservative rule: any authenticated storage.objects policy explicitly
  -- targeting these two private buckets blocks staff rollout. Access must be
  -- redesigned first through scoped server routes or identity-bound policies.
  -- pg_policies is catalog-backed, so this remains readable even when the
  -- caller intentionally lacks direct storage schema privileges.
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
    );

  -- A generic workspace Auth token must also not inherit unrelated write
  -- privileges to operational/public asset buckets. These buckets may remain
  -- publicly readable by design, but a workspace member has no reason to
  -- upload, update or delete plot/ad/farm assets directly through Supabase.
  select count(*)::integer into v_operational_storage_auth_write_policies
  from pg_catalog.pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.cmd in ('ALL','INSERT','UPDATE','DELETE')
    and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    and (
      coalesce(p.qual,'') ilike '%plot-assets%'
      or coalesce(p.with_check,'') ilike '%plot-assets%'
      or coalesce(p.qual,'') ilike '%ad-creatives%'
      or coalesce(p.with_check,'') ilike '%ad-creatives%'
      or coalesce(p.qual,'') ilike '%olivia-field-observations%'
      or coalesce(p.with_check,'') ilike '%olivia-field-observations%'
    );

  -- For the four core customer surfaces, fail if a public/authenticated policy
  -- appears permissive rather than an explicit deny. This is intentionally
  -- conservative; server/service-role access is unaffected.
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

  -- A workspace Supabase Auth identity also inherits the generic authenticated
  -- role outside the workspace routes. Explicitly block known internal
  -- operational tables that a workspace user must never receive merely by
  -- authenticating. agentic_approvals exposes approval/decision metadata;
  -- plot_assets contains customer visibility/distribution fields and currently
  -- has a generic authenticated full-access policy. Public catalogue tables
  -- (properties/land plots/books/rates) are intentionally not in this list.
  select count(*)::integer into v_direct_internal_policy_risk
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('agentic_approvals','plot_assets')
    and p.cmd in ('ALL','SELECT','INSERT','UPDATE','DELETE')
    -- Published plot assets are intentionally public-read; only non-SELECT or
    -- ALL policies are operational Auth risk for that table.
    and not (p.tablename = 'plot_assets' and p.cmd = 'SELECT')
    and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    and (
      (p.cmd in ('ALL','SELECT','UPDATE','DELETE')
        and coalesce(regexp_replace(lower(p.qual),'[()[:space:]]','','g'),'') not in ('','false'))
      or
      (p.cmd in ('ALL','INSERT','UPDATE')
        and coalesce(regexp_replace(lower(p.with_check),'[()[:space:]]','','g'),'') not in ('','false'))
    );

  return jsonb_build_object(
    'required_customer_tables_rls', v_required_tables_rls,
    'private_document_buckets_present', v_private_buckets_present,
    'private_document_buckets_private', v_private_buckets_private,
    'private_document_authenticated_policies', v_private_bucket_auth_policies,
    'operational_storage_authenticated_write_policies', v_operational_storage_auth_write_policies,
    'direct_customer_policy_risk', v_direct_customer_policy_risk,
    'direct_internal_policy_risk', v_direct_internal_policy_risk,
    'safe_for_workspace_auth',
      v_required_tables_rls
      and v_private_buckets_present
      and v_private_buckets_private
      and v_private_bucket_auth_policies = 0
      and v_operational_storage_auth_write_policies = 0
      and v_direct_customer_policy_risk = 0
      and v_direct_internal_policy_risk = 0
  );
end;
$workspace_staff_security_preflight$;

revoke execute on function public.workspace_staff_security_preflight()
  from public, anon, authenticated;
grant execute on function public.workspace_staff_security_preflight()
  to service_role;

comment on function public.workspace_staff_security_preflight() is
  'Read-only rollout gate: blocks workspace Auth activation while direct customer/storage exposure remains.';
