-- Explicitly keep property editorial trigger functions out of PostgREST RPC.
-- They are trigger-only implementation details.
revoke execute on function public.queue_property_editorial_job() from public, anon, authenticated;
revoke execute on function public.preserve_property_feed_source() from public, anon, authenticated;
