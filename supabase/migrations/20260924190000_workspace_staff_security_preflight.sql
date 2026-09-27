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
  v_direct_customer_policy_risk integer := 0;
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
  if pg_catalog.to_regclass('storage.buckets') is not null then
    execute $q$
      select count(*) = 2,
             count(*) = 2 and bool_and(not public)
      from storage.buckets
      where id in ('property-documents','caecv-documents')
    $q$ into v_private_buckets_present, v_private_buckets_private;
  end if;

  -- Conservative rule: any authenticated storage.objects policy explicitly
  -- targeting these two private buckets blocks staff rollout. Access must be
  -- redesigned first through scoped server routes or identity-bound policies.
  if pg_catalog.to_regclass('storage.objects') is not null then
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
  end if;

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

  return jsonb_build_object(
    'required_customer_tables_rls', v_required_tables_rls,
    'private_document_buckets_present', v_private_buckets_present,
    'private_document_buckets_private', v_private_buckets_private,
    'private_document_authenticated_policies', v_private_bucket_auth_policies,
    'direct_customer_policy_risk', v_direct_customer_policy_risk,
    'safe_for_workspace_auth',
      v_required_tables_rls
      and v_private_buckets_present
      and v_private_buckets_private
      and v_private_bucket_auth_policies = 0
      and v_direct_customer_policy_risk = 0
  );
end;
$workspace_staff_security_preflight$;

revoke execute on function public.workspace_staff_security_preflight()
  from public, anon, authenticated;
grant execute on function public.workspace_staff_security_preflight()
  to service_role;

comment on function public.workspace_staff_security_preflight() is
  'Read-only rollout gate: blocks workspace Auth activation while direct customer/storage exposure remains.';
