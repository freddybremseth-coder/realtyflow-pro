-- Agentic Executor — utvid agentic_approvals med "executed"-status + audit.
-- Executor utfører godkjente handlinger (etter menneskelig approval) og markerer
-- dem executed med tidspunkt, hvem og detalj.

alter table public.agentic_approvals drop constraint if exists agentic_approvals_status_check;
alter table public.agentic_approvals add constraint agentic_approvals_status_check
  check (status in ('pending', 'approved', 'rejected', 'superseded', 'executed'));

alter table public.agentic_approvals add column if not exists executed_at timestamptz;
alter table public.agentic_approvals add column if not exists executed_by text;
alter table public.agentic_approvals add column if not exists execution_detail text;
