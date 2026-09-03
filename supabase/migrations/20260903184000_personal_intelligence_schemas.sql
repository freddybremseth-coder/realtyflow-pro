-- Personal Intelligence OS — foundation schemas.
-- RealtyFlow already uses `core` for platform/multitenant data, so the
-- personal canonical profile lives in `personal_core` to preserve ownership
-- boundaries and avoid colliding with existing core.* contracts.

create schema if not exists personal_core;
create schema if not exists mentor;
create schema if not exists knowledge;
create schema if not exists learning;
create schema if not exists beliefs;

comment on schema personal_core is 'Canonical personal entities, claims, sources, goals and provenance for Personal Intelligence OS.';
comment on schema mentor is 'Mentor sessions, context usage, observations, recommendations, actions, decisions and reviews.';
comment on schema knowledge is 'Personal knowledge graph, mastery evidence and knowledge gaps.';
comment on schema learning is 'Learning sessions, assessments, teach-back evidence, reviews and learning experiments.';
comment on schema beliefs is 'Beliefs, hypotheses, assumptions, evidence, revisions and prediction calibration.';

-- Schemas are private-by-default. Table/RPC grants are added explicitly in
-- later migrations only after RLS and runtime contracts exist.
revoke all on schema personal_core, mentor, knowledge, learning, beliefs from public, anon, authenticated;
grant usage on schema personal_core, mentor, knowledge, learning, beliefs to service_role;

notify pgrst, 'reload schema';
