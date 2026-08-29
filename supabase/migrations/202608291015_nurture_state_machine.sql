-- Canonical nurture state machine.
-- `eligible` means the contact may be evaluated for an appropriate sequence.
-- `enrolled` means a real sequence has actually started.
-- `paused` is temporary; `stopped` is an explicit permanent opt-out.

alter table public.contacts
  alter column nurture_status set default 'eligible';

update public.contacts
set nurture_status = 'enrolled'
where lower(coalesce(nurture_status, '')) = 'active'
  and (nurture_sequence is not null or nurture_enrolled_at is not null);

update public.contacts
set nurture_status = 'eligible'
where lower(coalesce(nurture_status, '')) = 'active'
  and nurture_sequence is null
  and nurture_enrolled_at is null;

update public.contacts
set nurture_status = 'eligible'
where nurture_status is null or btrim(nurture_status) = '';

create index if not exists contacts_nurture_state_idx
  on public.contacts (nurture_status, nurture_sequence)
  where nurture_status in ('eligible', 'enrolled', 'paused');
