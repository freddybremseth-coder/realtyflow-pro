alter table public.portal_saved_searches
  add column if not exists criteria_updated_at timestamptz,
  add column if not exists confirmation_due_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmed_at timestamptz;
