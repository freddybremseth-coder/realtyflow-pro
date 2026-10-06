alter table public.buyer_profiles
  drop constraint if exists buyer_profiles_intake_brand_fkey;

alter table public.buyer_profiles
  add constraint buyer_profiles_intake_brand_fkey
  foreign key (intake_id, brand)
  references public.lead_intake_messages(id, brand)
  on update cascade
  on delete cascade;