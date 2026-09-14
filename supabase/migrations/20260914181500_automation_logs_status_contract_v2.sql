-- Automation log status contract v2
--
-- The application now records richer execution outcomes (partial/failed/blocked)
-- in addition to the original success/error values. The original table-level
-- check still only permits success/error, which causes failure/partial audit
-- rows to be rejected exactly when observability is most important.
--
-- Keep the status vocabulary explicit and bounded; this is not a free-text
-- relaxation of the contract.

alter table public.automation_logs
  drop constraint if exists automation_logs_status_check;

alter table public.automation_logs
  add constraint automation_logs_status_check
  check (status in ('success', 'error', 'partial', 'failed', 'blocked'));
