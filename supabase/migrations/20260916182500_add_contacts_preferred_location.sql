alter table public.contacts
  add column if not exists preferred_location text;

comment on column public.contacts.preferred_location is
  'Preferred geographic area/location for the customer, when explicitly known.';
