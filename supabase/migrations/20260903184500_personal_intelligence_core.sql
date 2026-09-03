-- Personal Intelligence OS — canonical personal core.

create or replace function personal_core.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists personal_core.entities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  display_name text not null,
  canonical_name text,
  description text,
  status text not null default 'active',
  privacy_level text not null default 'internal'
    check (privacy_level in ('public','internal','private','sensitive','restricted')),
  metadata jsonb not null default '{}'::jsonb,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create index if not exists personal_core_entities_owner_idx on personal_core.entities(owner_user_id);
create index if not exists personal_core_entities_type_idx on personal_core.entities(owner_user_id, entity_type);
create index if not exists personal_core_entities_name_idx on personal_core.entities(owner_user_id, canonical_name) where canonical_name is not null;

create trigger personal_core_entities_touch_updated_at
before update on personal_core.entities
for each row execute function personal_core.touch_updated_at();

create table if not exists personal_core.sources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_name text,
  source_system text,
  external_reference text,
  reliability_class text,
  privacy_level text not null default 'internal'
    check (privacy_level in ('public','internal','private','sensitive','restricted')),
  source_date timestamptz,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists personal_core_sources_owner_idx on personal_core.sources(owner_user_id);
create index if not exists personal_core_sources_system_idx on personal_core.sources(owner_user_id, source_system) where source_system is not null;

create table if not exists personal_core.claims (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  predicate text not null,
  value_text text,
  value_json jsonb,
  claim_type text not null default 'fact',
  status text not null default 'captured'
    check (status in ('captured','candidate','validated','canonical','disputed','superseded','expired','rejected')),
  confidence numeric(5,4) not null default 0.5000
    check (confidence >= 0 and confidence <= 1),
  source_id uuid references personal_core.sources(id) on delete set null,
  source_excerpt text,
  valid_from timestamptz,
  valid_to timestamptz,
  supersedes_claim_id uuid references personal_core.claims(id) on delete set null,
  privacy_level text not null default 'internal'
    check (privacy_level in ('public','internal','private','sensitive','restricted')),
  requires_confirmation boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (value_text is not null or value_json is not null),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check (status <> 'canonical' or not requires_confirmation or confirmed_at is not null)
);

create index if not exists personal_core_claims_owner_idx on personal_core.claims(owner_user_id);
create index if not exists personal_core_claims_subject_idx on personal_core.claims(owner_user_id, subject_entity_id);
create index if not exists personal_core_claims_predicate_idx on personal_core.claims(owner_user_id, subject_entity_id, predicate);
create index if not exists personal_core_claims_current_idx on personal_core.claims(owner_user_id, status, valid_to);

create trigger personal_core_claims_touch_updated_at
before update on personal_core.claims
for each row execute function personal_core.touch_updated_at();

create table if not exists personal_core.claim_conflicts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  claim_a_id uuid not null references personal_core.claims(id) on delete cascade,
  claim_b_id uuid not null references personal_core.claims(id) on delete cascade,
  conflict_type text not null default 'contradiction',
  resolution_status text not null default 'open',
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (claim_a_id <> claim_b_id),
  unique (claim_a_id, claim_b_id)
);

create index if not exists personal_core_claim_conflicts_owner_idx on personal_core.claim_conflicts(owner_user_id, resolution_status);

create table if not exists personal_core.entity_relations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  predicate text not null,
  object_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  valid_from timestamptz,
  valid_to timestamptz,
  confidence numeric(5,4) not null default 0.5000 check (confidence >= 0 and confidence <= 1),
  source_id uuid references personal_core.sources(id) on delete set null,
  privacy_level text not null default 'internal'
    check (privacy_level in ('public','internal','private','sensitive','restricted')),
  created_at timestamptz not null default now(),
  check (subject_entity_id <> object_entity_id),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create index if not exists personal_core_entity_relations_subject_idx on personal_core.entity_relations(owner_user_id, subject_entity_id, predicate);
create index if not exists personal_core_entity_relations_object_idx on personal_core.entity_relations(owner_user_id, object_entity_id, predicate);

create table if not exists personal_core.goals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  title text not null,
  description text,
  domain text,
  goal_type text,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'idea'
    check (status in ('idea','active','paused','completed','abandoned','unclear')),
  target_date date,
  start_date date,
  why_it_matters text,
  success_definition text,
  parent_goal_id uuid references personal_core.goals(id) on delete set null,
  source_id uuid references personal_core.sources(id) on delete set null,
  privacy_level text not null default 'internal'
    check (privacy_level in ('public','internal','private','sensitive','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_core_goals_owner_status_idx on personal_core.goals(owner_user_id, status, priority);
create index if not exists personal_core_goals_subject_idx on personal_core.goals(owner_user_id, subject_entity_id);

create trigger personal_core_goals_touch_updated_at
before update on personal_core.goals
for each row execute function personal_core.touch_updated_at();

comment on table personal_core.claims is 'Versioned personal claims with provenance, confidence, temporal validity and explicit confirmation semantics.';
comment on table personal_core.claim_conflicts is 'Preserves contradictions instead of silently overwriting personal history.';

alter table personal_core.entities enable row level security;
alter table personal_core.sources enable row level security;
alter table personal_core.claims enable row level security;
alter table personal_core.claim_conflicts enable row level security;
alter table personal_core.entity_relations enable row level security;
alter table personal_core.goals enable row level security;

-- No anon/authenticated grants in Foundation. Server-side runtime uses explicitly
-- authorized service access; user-facing RPC grants are added only after the
-- privacy and correction contracts are implemented.
revoke all on all tables in schema personal_core from public, anon, authenticated;
grant all on all tables in schema personal_core to service_role;
grant usage, select on all sequences in schema personal_core to service_role;

notify pgrst, 'reload schema';
