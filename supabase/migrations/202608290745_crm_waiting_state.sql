-- Persist waiting as an orthogonal CRM state.
-- A buyer can remain QUALIFIED/MATCHING/etc. while we wait for the customer
-- or a third party until a concrete date.

alter table public.contacts
  add column if not exists waiting_on text,
  add column if not exists waiting_reason text,
  add column if not exists waiting_until timestamptz;

do $$
begin
  alter table public.contacts
    add constraint contacts_waiting_on_check
    check (waiting_on is null or waiting_on in ('customer', 'third_party'));
exception
  when duplicate_object then null;
end $$;

create index if not exists contacts_waiting_until_idx
  on public.contacts (waiting_until)
  where waiting_until is not null;
