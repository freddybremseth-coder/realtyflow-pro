-- Keep the Mondeo/business finance ledger behind server routes.

do $$
begin
  if to_regclass('public.business_financial_events') is not null then
    alter table public.business_financial_events enable row level security;

    drop policy if exists "Allow all on business_financial_events" on public.business_financial_events;

    create policy "Deny direct API access to business financial events"
      on public.business_financial_events
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
