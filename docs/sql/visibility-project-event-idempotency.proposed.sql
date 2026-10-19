-- REVIEW ONLY. This is NOT an applied Supabase migration.
-- Convert using 'supabase migration new visibility_project_evidence_atomic' in a checked-out
-- repository, reconcile migration drift, run locally, then merge only after CI.
--
-- Existing automation_logs has RLS denying direct anon/authenticated users.
-- A partial UNIQUE INDEX makes event IDs unique only for this event action.
-- PostgreSQL index creation on a live table requires an operational rollout
-- decision; confirm there are no duplicates first.
--
-- PRECHECK (read-only):
-- select details->>'event_id' as event_id, count(*) from public.automation_logs
-- where action='visibility_project_claim_event'
-- group by details->>'event_id' having count(*)>1;
--
-- Proposed DDL after precheck:
create unique index if not exists ux_visibility_project_claim_event_id
on public.automation_logs ((details->>'event_id'))
where action='visibility_project_claim_event';

-- Do NOT use INSERT ON CONFLICT without identifying the correct conflict target.
-- A safe writer can attempt insert, catch SQLSTATE 23505 specifically for the
-- unique index, and return 'already_exists' only after verifying the stored
-- event payload fingerprint matches the attempted event. A duplicate ID with
-- different content is a CONFLICT, not success.
--
-- Insert is executed exclusively by authorized server code using the service
-- role; revoke any direct API access as already configured for automation_logs.
--
-- This DDL alone does NOT provide immutability against service-role updates,
-- independent evidence verification, or a permission to publish.
