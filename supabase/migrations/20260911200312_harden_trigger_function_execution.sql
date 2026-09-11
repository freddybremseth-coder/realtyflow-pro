-- Trigger functions are internal database plumbing and must not be callable as
-- exposed PostgREST RPCs by PUBLIC/anon/authenticated roles.
--
-- The Nexus sent-observation trigger is production behavior and remains active.
-- Its creation currently predates the repository's tracked migration history,
-- so keep this hardening safe for clean databases where it is not present yet.
do $$
begin
  if to_regprocedure('public.nexus_capture_email_draft_sent()') is not null then
    execute 'revoke execute on function public.nexus_capture_email_draft_sent() from public';
    execute 'revoke execute on function public.nexus_capture_email_draft_sent() from anon';
    execute 'revoke execute on function public.nexus_capture_email_draft_sent() from authenticated';
  end if;
end
$$;

-- This trace was temporary diagnostics for the property conversion incident.
-- The atomic queue claim has resolved that incident, so remove both the write
-- amplification on every property update and the exposed definer function.
drop trigger if exists trg_trace_property_conversion_invalidation on public.properties;
drop function if exists public.trace_property_conversion_invalidation();
