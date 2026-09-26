drop policy if exists "corporate_prospects_deny_direct" on public.corporate_prospects;
create policy "corporate_prospects_deny_direct"
  on public.corporate_prospects
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "corporate_prospect_contacts_deny_direct" on public.corporate_prospect_contacts;
create policy "corporate_prospect_contacts_deny_direct"
  on public.corporate_prospect_contacts
  for all
  to anon, authenticated
  using (false)
  with check (false);
