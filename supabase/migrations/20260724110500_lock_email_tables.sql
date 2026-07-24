-- Email configuration and message content must stay behind server routes.
-- Public clients use API endpoints that return only the needed summaries.

drop policy if exists "Allow all on brand_email_configs" on public.brand_email_configs;
drop policy if exists "Deny direct API access to brand email configs" on public.brand_email_configs;
create policy "Deny direct API access to brand email configs"
on public.brand_email_configs
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Allow all on email_messages" on public.email_messages;
drop policy if exists "Deny direct API access to email messages" on public.email_messages;
create policy "Deny direct API access to email messages"
on public.email_messages
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Allow all on email_drafts" on public.email_drafts;
drop policy if exists "Deny direct API access to email drafts" on public.email_drafts;
create policy "Deny direct API access to email drafts"
on public.email_drafts
for all
to anon, authenticated
using (false)
with check (false);
