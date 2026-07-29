-- Keep portal messaging and property visibility behind their API routes.

do $$
begin
  if to_regclass('public.portal_messages') is not null then
    alter table public.portal_messages enable row level security;
    drop policy if exists "Allow all on portal_messages" on public.portal_messages;
    create policy "Deny direct API access to portal messages"
      on public.portal_messages for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.property_brand_visibility') is not null then
    alter table public.property_brand_visibility enable row level security;
    drop policy if exists "Allow all on property_brand_visibility" on public.property_brand_visibility;
    create policy "Deny direct API access to property brand visibility"
      on public.property_brand_visibility for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
