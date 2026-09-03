-- Personal Intelligence OS — knowledge, learning and belief foundations.

create table if not exists knowledge.domains (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (owner_user_id, name)
);

create table if not exists knowledge.topics (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  domain_id uuid not null references knowledge.domains(id) on delete cascade,
  parent_topic_id uuid references knowledge.topics(id) on delete set null,
  name text not null,
  description text,
  difficulty_band smallint check (difficulty_band is null or difficulty_band between 0 and 5),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_user_id, domain_id, name)
);

create index if not exists knowledge_topics_parent_idx on knowledge.topics(owner_user_id, parent_topic_id) where parent_topic_id is not null;

create table if not exists knowledge.mastery (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  topic_id uuid not null references knowledge.topics(id) on delete cascade,
  exposure_score numeric(5,4) check (exposure_score is null or (exposure_score >= 0 and exposure_score <= 1)),
  understanding_score numeric(5,4) check (understanding_score is null or (understanding_score >= 0 and understanding_score <= 1)),
  retention_score numeric(5,4) check (retention_score is null or (retention_score >= 0 and retention_score <= 1)),
  transfer_score numeric(5,4) check (transfer_score is null or (transfer_score >= 0 and transfer_score <= 1)),
  confidence_score numeric(5,4) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  formal_exposure_score numeric(5,4) check (formal_exposure_score is null or (formal_exposure_score >= 0 and formal_exposure_score <= 1)),
  practical_exposure_score numeric(5,4) check (practical_exposure_score is null or (practical_exposure_score >= 0 and practical_exposure_score <= 1)),
  interest_score numeric(5,4) check (interest_score is null or (interest_score >= 0 and interest_score <= 1)),
  evidence_strength numeric(5,4) check (evidence_strength is null or (evidence_strength >= 0 and evidence_strength <= 1)),
  last_assessed_at timestamptz,
  next_review_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_user_id, subject_entity_id, topic_id)
);

create trigger knowledge_mastery_touch_updated_at
before update on knowledge.mastery
for each row execute function personal_core.touch_updated_at();

create table if not exists learning.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  topic_id uuid references knowledge.topics(id) on delete set null,
  mentor_session_id uuid references mentor.sessions(id) on delete set null,
  input_mode text not null default 'text'
    check (input_mode in ('text','dictation','voice_conversation','reflection')),
  teaching_mode text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  completion_status text not null default 'started'
    check (completion_status in ('started','completed','abandoned','paused')),
  difficulty numeric(5,4) check (difficulty is null or (difficulty >= 0 and difficulty <= 1)),
  engagement_signal numeric(5,4) check (engagement_signal is null or (engagement_signal >= 0 and engagement_signal <= 1)),
  friction_signal numeric(5,4) check (friction_signal is null or (friction_signal >= 0 and friction_signal <= 1)),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists learning_sessions_subject_idx on learning.sessions(owner_user_id, subject_entity_id, started_at desc);
create index if not exists learning_sessions_topic_idx on learning.sessions(owner_user_id, topic_id, started_at desc) where topic_id is not null;

create table if not exists learning.assessments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references learning.sessions(id) on delete cascade,
  topic_id uuid references knowledge.topics(id) on delete set null,
  assessment_type text not null,
  prompt text not null,
  response text,
  score numeric(5,4) check (score is null or (score >= 0 and score <= 1)),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists learning.teach_back (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references learning.sessions(id) on delete cascade,
  topic_id uuid references knowledge.topics(id) on delete set null,
  transcript text not null,
  understood_concepts jsonb not null default '[]'::jsonb,
  missing_concepts jsonb not null default '[]'::jsonb,
  misconceptions jsonb not null default '[]'::jsonb,
  clarity_score numeric(5,4) check (clarity_score is null or (clarity_score >= 0 and clarity_score <= 1)),
  transfer_signal numeric(5,4) check (transfer_signal is null or (transfer_signal >= 0 and transfer_signal <= 1)),
  mentor_feedback text,
  created_at timestamptz not null default now()
);

create table if not exists knowledge.mastery_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mastery_id uuid not null references knowledge.mastery(id) on delete cascade,
  evidence_type text not null,
  learning_session_id uuid references learning.sessions(id) on delete set null,
  assessment_id uuid references learning.assessments(id) on delete set null,
  source_id uuid references personal_core.sources(id) on delete set null,
  score_effect numeric(7,4),
  evidence_strength numeric(5,4) check (evidence_strength is null or (evidence_strength >= 0 and evidence_strength <= 1)),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_mastery_evidence_mastery_idx on knowledge.mastery_evidence(owner_user_id, mastery_id, created_at desc);

create table if not exists beliefs.claims (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  statement text not null,
  belief_type text not null default 'belief'
    check (belief_type in ('belief','hypothesis','principle','preference','prediction','assumption')),
  confidence numeric(5,4) not null default 0.5000 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active','challenged','revised','retired','rejected')),
  source_id uuid references personal_core.sources(id) on delete set null,
  privacy_level text not null default 'internal'
    check (privacy_level in ('public','internal','private','sensitive','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger beliefs_claims_touch_updated_at
before update on beliefs.claims
for each row execute function personal_core.touch_updated_at();

create table if not exists beliefs.predictions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  statement text not null,
  probability numeric(5,4) not null check (probability >= 0 and probability <= 1),
  deadline timestamptz,
  domain text,
  status text not null default 'open' check (status in ('open','resolved','cancelled')),
  outcome text,
  calibration_score numeric(8,6),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table knowledge.domains enable row level security;
alter table knowledge.topics enable row level security;
alter table knowledge.mastery enable row level security;
alter table knowledge.mastery_evidence enable row level security;
alter table learning.sessions enable row level security;
alter table learning.assessments enable row level security;
alter table learning.teach_back enable row level security;
alter table beliefs.claims enable row level security;
alter table beliefs.predictions enable row level security;

revoke all on all tables in schema knowledge from public, anon, authenticated;
revoke all on all tables in schema learning from public, anon, authenticated;
revoke all on all tables in schema beliefs from public, anon, authenticated;

grant all on all tables in schema knowledge to service_role;
grant all on all tables in schema learning to service_role;
grant all on all tables in schema beliefs to service_role;
grant usage, select on all sequences in schema knowledge, learning, beliefs to service_role;

comment on table knowledge.mastery is 'Nullable evidence-based mastery dimensions; NULL means unknown, never zero knowledge.';
comment on table learning.teach_back is 'Teach-back evidence used to assess conceptual coverage, missing mechanisms and transfer without equating exposure with understanding.';

notify pgrst, 'reload schema';
