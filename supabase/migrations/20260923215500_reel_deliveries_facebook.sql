-- Allow one guarded Facebook Page Reel upload per rendered job alongside Instagram and YouTube.
alter table public.remaster_reel_deliveries
  drop constraint if exists remaster_reel_deliveries_channel_check;
alter table public.remaster_reel_deliveries
  add constraint remaster_reel_deliveries_channel_check
  check (channel in ('instagram','youtube','facebook'));
