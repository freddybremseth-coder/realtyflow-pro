-- Token/state tables are server-only. API routes use the service role key,
-- while anon/authenticated clients should never access these rows directly.

drop policy if exists "Allow all on oauth_tokens" on public.oauth_tokens;
drop policy if exists "service role full access" on public.oauth_tokens;
drop policy if exists "Deny direct API access to oauth tokens" on public.oauth_tokens;
create policy "Deny direct API access to oauth tokens"
on public.oauth_tokens
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Allow all on oauth_states" on public.oauth_states;
drop policy if exists "service role full access" on public.oauth_states;
drop policy if exists "Deny direct API access to oauth states" on public.oauth_states;
create policy "Deny direct API access to oauth states"
on public.oauth_states
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Allow all" on public.openart_connection;
drop policy if exists "Deny direct API access to OpenArt connection" on public.openart_connection;
create policy "Deny direct API access to OpenArt connection"
on public.openart_connection
for all
to anon, authenticated
using (false)
with check (false);
