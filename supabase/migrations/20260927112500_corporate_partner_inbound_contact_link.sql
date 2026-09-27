alter table public.corporate_partner_prospects
  add column if not exists converted_contact_id uuid references public.contacts(id) on delete set null;

create index if not exists corporate_partner_prospects_converted_contact_idx
  on public.corporate_partner_prospects (converted_contact_id)
  where converted_contact_id is not null;