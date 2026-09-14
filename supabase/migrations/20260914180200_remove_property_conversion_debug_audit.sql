-- Property Conversion v3 is production-verified across consecutive cron runs.
-- Remove the temporary diagnostics used to isolate the old v2 requeue loop.

drop trigger if exists trg_property_conversion_debug_audit on public.properties;
drop function if exists public.audit_property_conversion_debug();
drop table if exists public.property_conversion_debug_audit;
