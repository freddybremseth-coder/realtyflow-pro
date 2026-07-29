-- Public buckets still serve files through public URLs. These SELECT policies
-- only add broad object listing through the Storage API, which Supabase flags.

drop policy if exists "Public read ad-creatives" on storage.objects;
drop policy if exists "Olivia field observation images are publicly readable" on storage.objects;
drop policy if exists "Public read plot-assets" on storage.objects;
