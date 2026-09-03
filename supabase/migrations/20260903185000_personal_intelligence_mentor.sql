-- Personal Intelligence OS — mentor runtime foundation.

create table if not exists mentor.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  session_type text not null default 'conversation',
  primary_mode text not null default 'mentor',
  input_mode text not null default 'text'
    check (input_mode in ('text','dictation','voice_conversation','reflection')),
  think_deeper_enabled boolean not null default false,
  privacy_scope text not null default 'internal'
    check (privacy_scope in ('public','internal','private','sensitive','restricted')),
  summary text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists mentor_sessions_owner_idx on mentor.sessions(owner_user_id, started_at desc);
create index if not exists mentor_sessions_subject_idx on mentor.sessions(owner_user_id, subject_entity_id, started_at desc);

create trigger mentor_sessions_touch_updated_at
before update on mentor.sessions
for each row execute function personal_core.touch_updated_at();

create table if not exists mentor.messages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references mentor.sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  input_mode text not null default 'text'
    check (input_mode in ('text','dictation','voice_conversation','reflection')),
  transcript_reference text,
  created_at timestamptz not null default now()
);

create index if not exists mentor_messages_session_idx on mentor.messages(owner_user_id, session_id, created_at);

create table if not exists mentor.context_usage (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references mentor.sessions(id) on delete cascade,
  schema_name text not null,
  resource_type text not null,
  resource_id text,
  context_reason text not null,
  sensitivity text not null default 'internal'
    check (sensitivity in ('public','internal','private','sensitive','restricted')),
  source_updated_at timestamptz,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  used_at timestamptz not null default now()
);

create index if not exists mentor_context_usage_session_idx on mentor.context_usage(owner_user_id, session_id, used_at);
create index if not exists mentor_context_usage_resource_idx on mentor.context_usage(owner_user_id, schema_name, resource_type);

create table if not exists mentor.observations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  session_id uuid references mentor.sessions(id) on delete set null,
  observation text not null,
  category text,
  evidence_json jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null default 0.5000 check (confidence >= 0 and confidence <= 1),
  status text not null default 'candidate'
    check (status in ('candidate','validated','promoted','rejected','expired')),
  requires_confirmation boolean not null default false,
  privacy_level text not null default 'internal'
    check (privacy_level in ('public','internal','private','sensitive','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentor_observations_owner_status_idx on mentor.observations(owner_user_id, status, created_at desc);

create trigger mentor_observations_touch_updated_at
before update on mentor.observations
for each row execute function personal_core.touch_updated_at();

create table if not exists mentor.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references mentor.sessions(id) on delete set null,
  event_type text not null,
  resource_schema text,
  resource_type text,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mentor_audit_events_owner_idx on mentor.audit_events(owner_user_id, created_at desc);
create index if not exists mentor_audit_events_session_idx on mentor.audit_events(session_id, created_at) where session_id is not null;

alter table mentor.sessions enable row level security;
alter table mentor.messages enable row level security;
alter table mentor.context_usage enable row level security;
alter table mentor.observations enable row level security;
alter table mentor.audit_events enable row level security;

revoke all on all tables in schema mentor from public, anon, authenticated;
grant all on all tables in schema mentor to service_role;
grant usage, select on all sequences in schema mentor to service_role;

comment on table mentor.context_usage is 'Auditable record of which approved context resources were used in a mentor session; never stores hidden chain-of-thought.';
comment on table mentor.observations is 'Tentative evidence-backed mentor observations that remain separate from canonical personal claims until promoted by policy.';

notify pgrst, 'reload schema';
