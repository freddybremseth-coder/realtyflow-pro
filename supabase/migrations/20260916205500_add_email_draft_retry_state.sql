alter table public.email_messages
  add column if not exists ai_draft_attempt_count integer not null default 0,
  add column if not exists ai_draft_last_attempt_at timestamptz,
  add column if not exists ai_draft_retry_after timestamptz,
  add column if not exists ai_draft_last_error text,
  add column if not exists ai_draft_quarantined_at timestamptz;

comment on column public.email_messages.ai_draft_attempt_count is
  'Number of consecutive failed AI auto-draft attempts since the last successful draft.';
comment on column public.email_messages.ai_draft_retry_after is
  'Earliest time a failed AI auto-draft may be retried; also used as a short processing lease while claimed.';
comment on column public.email_messages.ai_draft_last_error is
  'Sanitized last AI auto-draft error for operations diagnostics; must not contain email body content.';
comment on column public.email_messages.ai_draft_quarantined_at is
  'Set after the retry budget is exhausted so a poison message cannot monopolize the auto-draft queue.';

create index if not exists idx_email_messages_ai_draft_retry
  on public.email_messages (ai_draft_quarantined_at, ai_draft_retry_after, received_at)
  where direction = 'inbound' and is_archived = false and has_draft_reply = false;
