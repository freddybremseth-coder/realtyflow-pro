-- Personal Intelligence OS — expose private schemas to PostgREST for server-side service_role access.
-- This does not grant anon/authenticated access. Existing schema/table grants and RLS remain authoritative.

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, personal_core, mentor, knowledge, learning, beliefs';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
