-- Trigger functions are internal database plumbing and must not be callable as
-- exposed PostgREST RPCs by PUBLIC/anon/authenticated roles.

revoke execute on function public.reconcile_marketing_publication_from_posted_attempt() from public;
revoke execute on function public.reconcile_marketing_publication_from_posted_attempt() from anon;
revoke execute on function public.reconcile_marketing_publication_from_posted_attempt() from authenticated;

revoke execute on function public.enforce_marketing_controlled_auto_cadence() from public;
revoke execute on function public.enforce_marketing_controlled_auto_cadence() from anon;
revoke execute on function public.enforce_marketing_controlled_auto_cadence() from authenticated;
