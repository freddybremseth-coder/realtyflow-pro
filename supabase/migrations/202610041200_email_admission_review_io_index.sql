-- Reduce disk IO for the hot customer-mail review scan.
-- Filters by account/status/mailbox and serves the required priority ordering.
create index if not exists idx_email_admission_queue_review_hot_path
  on public.email_admission_queue (
    account_id,
    admission_status,
    mailbox_role,
    is_historical asc,
    received_at desc
  );
