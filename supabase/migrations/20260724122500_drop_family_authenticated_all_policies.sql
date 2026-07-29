-- Remove broad authenticated family-schema policies; keep existing owner and household RLS.

do $$
declare
  target record;
begin
  for target in
    select *
    from (
      values
        ('family_documents', 'authenticated_all_family_documents'),
        ('farm_operations', 'authenticated_all_farm_operations'),
        ('grocery_items', 'authenticated_all_grocery_items'),
        ('grocery_lists', 'authenticated_all_grocery_lists'),
        ('household_members', 'authenticated_all_household_members'),
        ('households', 'authenticated_all_households'),
        ('integration_connections', 'authenticated_all_integration_connections'),
        ('members', 'authenticated_all_members'),
        ('mondeo_loan_payments', 'authenticated_all_mondeo_loan_payments'),
        ('mondeo_loan_settings', 'authenticated_all_mondeo_loan_settings'),
        ('purchase_history', 'authenticated_all_purchase_history'),
        ('real_estate_deals', 'authenticated_all_real_estate_deals'),
        ('transactions', 'authenticated_all_transactions'),
        ('user_module_access', 'authenticated_all_user_module_access'),
        ('user_profiles', 'authenticated_all_user_profiles')
    ) as policies(table_name, policy_name)
  loop
    if to_regclass(format('family.%I', target.table_name)) is not null then
      execute format('drop policy if exists %I on family.%I', target.policy_name, target.table_name);
    end if;
  end loop;

  if to_regclass('family.family_documents') is not null
     and to_regprocedure('family_private.is_household_adult_or_owner(uuid, uuid)') is not null then
    drop policy if exists documents_manage_adults on family.family_documents;

    create policy documents_manage_adults
      on family.family_documents
      for all
      to authenticated
      using (family_private.is_household_adult_or_owner(household_id, auth.uid()))
      with check (family_private.is_household_adult_or_owner(household_id, auth.uid()));
  end if;
end $$;
