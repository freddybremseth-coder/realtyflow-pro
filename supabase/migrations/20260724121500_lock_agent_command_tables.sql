-- Route Victoria command center data through server APIs only.

do $$
begin
  if to_regclass('public.command_executions') is not null then
    alter table public.command_executions enable row level security;

    drop policy if exists "Allow all on command_executions" on public.command_executions;

    create policy "Deny direct API access to command executions"
      on public.command_executions
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.command_conversations') is not null then
    alter table public.command_conversations enable row level security;

    drop policy if exists "command_conversations_all" on public.command_conversations;

    create policy "Deny direct API access to command conversations"
      on public.command_conversations
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;
