-- Make the intentional private-schema deny posture visible to the database
-- linter, and keep browser access to billing read-only. All mutations continue
-- through authenticated Next.js server routes using the service role.

do $$
declare
  relation record;
begin
  for relation in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('commerce', 'inventory', 'integrations')
      and c.relkind in ('r', 'p')
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = relation.schema_name
        and tablename = relation.table_name
        and policyname = 'deny_direct_browser_access'
    ) then
      execute format(
        'create policy deny_direct_browser_access on %I.%I as restrictive for all to anon, authenticated using (false) with check (false)',
        relation.schema_name,
        relation.table_name
      );
    end if;
  end loop;
end;
$$;

drop policy if exists billing_admins_update_organizations on public.billing_organizations;

drop policy if exists billing_users_read_self on public.billing_organization_users;
create policy billing_users_read_self on public.billing_organization_users
for select to authenticated
using (
  active and (
    user_id = (select auth.uid()) or
    lower(user_email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
);

drop policy if exists billing_members_read_organizations on public.billing_organizations;
create policy billing_members_read_organizations on public.billing_organizations
for select to authenticated
using (exists (
  select 1 from public.billing_organization_users member
  where member.organization_id = billing_organizations.id and member.active and (
    member.user_id = (select auth.uid()) or
    lower(member.user_email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'billing_organization_settings', 'billing_invoice_series', 'billing_customers',
    'billing_customer_contacts', 'billing_products', 'billing_tax_rules',
    'billing_documents', 'billing_document_lines', 'billing_document_snapshots',
    'billing_payments', 'billing_payment_allocations', 'billing_attachments',
    'billing_email_events', 'billing_audit_events', 'billing_exchange_rates',
    'billing_verifactu_records', 'billing_electronic_invoice_exports', 'billing_delivery_jobs'
  ] loop
    execute format('drop policy if exists billing_members_write on public.%I', table_name);
    execute format('drop policy if exists billing_members_read on public.%I', table_name);
    execute format(
      'create policy billing_members_read on public.%I for select to authenticated using (exists (
        select 1 from public.billing_organization_users member
        where member.organization_id = %I.organization_id and member.active and (
          member.user_id = (select auth.uid()) or
          lower(member.user_email) = lower(coalesce(((select auth.jwt()) ->> ''email''), ''''))
        )
      ))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
