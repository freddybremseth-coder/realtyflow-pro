-- Legacy social_accounts can contain plaintext access tokens. Keep all access
-- behind server routes and expose only scrubbed summaries from the app API.

drop policy if exists "allow_all_social_accounts" on public.social_accounts;
drop policy if exists "Deny direct API access to social accounts" on public.social_accounts;
create policy "Deny direct API access to social accounts"
on public.social_accounts
for all
to anon, authenticated
using (false)
with check (false);
