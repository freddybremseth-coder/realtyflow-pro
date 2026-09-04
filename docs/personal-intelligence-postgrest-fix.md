# Personal Intelligence PostgREST schema exposure fix

## Incident

The Personal Intelligence UI was reachable, but server-side Supabase queries failed with:

`Personal Intelligence owner resolution failed: Invalid schema: personal_core`

## Root cause

The Personal Intelligence schemas existed in production and `service_role` had schema usage, but PostgREST had not been configured to expose the custom schemas. Supabase JS `.schema("personal_core")` therefore failed before normal grants/RLS could be evaluated.

## Fix

Migration `20260904190500_personal_intelligence_postgrest_schemas.sql` adds these schemas to `pgrst.db_schemas` for the `authenticator` role and reloads PostgREST config/schema:

- `personal_core`
- `mentor`
- `knowledge`
- `learning`
- `beliefs`

The migration does not grant schema/table access to `anon` or `authenticated`; existing private-by-default grants and RLS remain authoritative.
