-- Brand/system settings and YouTube channel rows may contain API keys,
-- refresh-token mirrors, SMTP-related settings, or internal config.
-- Keep access behind server routes.

drop policy if exists "Allow all on brand_settings" on public.brand_settings;
drop policy if exists "Deny direct API access to brand settings" on public.brand_settings;
create policy "Deny direct API access to brand settings"
on public.brand_settings
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "allow_all_settings" on public.settings;
drop policy if exists "Deny direct API access to settings" on public.settings;
create policy "Deny direct API access to settings"
on public.settings
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "allow_all_youtube_channels" on public.youtube_channels;
drop policy if exists "Deny direct API access to YouTube channels" on public.youtube_channels;
create policy "Deny direct API access to YouTube channels"
on public.youtube_channels
for all
to anon, authenticated
using (false)
with check (false);
