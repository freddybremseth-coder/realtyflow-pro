-- Restore the Care schema in the PostgREST schema allow-list.
-- Care was originally exposed for server-side service_role access, but later
-- schema-list migrations replaced pgrst.db_schemas without retaining care.
-- Existing table grants and tenant RLS remain authoritative.

alter role authenticator set pgrst.db_schemas =
  'public, graphql_public, personal_core, mentor, knowledge, learning, beliefs, family, olivia, care';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
