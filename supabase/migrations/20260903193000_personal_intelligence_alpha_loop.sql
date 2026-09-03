-- Personal Intelligence OS — Alpha Loop 1.0.
-- Adds the minimal action/follow-up and learning review contracts required for TODAY.

create table if not exists mentor.recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  session_id uuid references mentor.sessions(id) on delete set null,
  recommendation text not null,
  reason text,
  related_goal_id uuid references personal_core.goals(id) on delete set null,
  expected_outcome text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'proposed'
    check (status in ('proposed','accepted','rejected','ignored','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentor_recommendations_owner_status_idx
  on mentor.recommendations(owner_user_id, status, created_at desc);

create trigger mentor_recommendations_touch_updated_at
before update on mentor.recommendations
for each row execute function personal_core.touch_updated_at();

create table if not exists mentor.actions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  title text not null,
  description text,
  action_type text not null default 'quick'
    check (action_type in ('quick','focus','deep_work','decision','follow_up','habit','experiment')),
  commitment_status text not null default 'idea'
    check (commitment_status in ('idea','considering','committed','scheduled','in_progress','done','dropped')),
  priority smallint not null default 3 check (priority between 1 and 5),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  scheduled_at timestamptz,
  source_session_id uuid references mentor.sessions(id) on delete set null,
  related_goal_id uuid references personal_core.goals(id) on delete set null,
  destination_system text,
  external_action_id text,
  completed_at timestamptz,
  outcome text,
  friction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentor_actions_owner_status_idx
  on mentor.actions(owner_user_id, commitment_status, priority, scheduled_at);
create index if not exists mentor_actions_subject_idx
  on mentor.actions(owner_user_id, subject_entity_id, created_at desc);

create trigger mentor_actions_touch_updated_at
before update on mentor.actions
for each row execute function personal_core.touch_updated_at();

create table if not exists mentor.followups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  recommendation_id uuid references mentor.recommendations(id) on delete cascade,
  action_id uuid references mentor.actions(id) on delete cascade,
  followup_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open','due','completed','cancelled')),
  outcome text,
  lesson text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (recommendation_id is not null or action_id is not null)
);

create index if not exists mentor_followups_due_idx
  on mentor.followups(owner_user_id, status, followup_at);

create trigger mentor_followups_touch_updated_at
before update on mentor.followups
for each row execute function personal_core.touch_updated_at();

create table if not exists learning.review_schedule (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  topic_id uuid not null references knowledge.topics(id) on delete cascade,
  review_reason text not null,
  due_at timestamptz not null,
  priority smallint not null default 3 check (priority between 1 and 5),
  status text not null default 'due'
    check (status in ('scheduled','due','completed','skipped','cancelled')),
  last_result numeric(5,4) check (last_result is null or (last_result >= 0 and last_result <= 1)),
  next_interval interval,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, subject_entity_id, topic_id, due_at)
);

create index if not exists learning_review_schedule_due_idx
  on learning.review_schedule(owner_user_id, status, due_at, priority);

create trigger learning_review_schedule_touch_updated_at
before update on learning.review_schedule
for each row execute function personal_core.touch_updated_at();

alter table mentor.recommendations enable row level security;
alter table mentor.actions enable row level security;
alter table mentor.followups enable row level security;
alter table learning.review_schedule enable row level security;

revoke all on mentor.recommendations, mentor.actions, mentor.followups from public, anon, authenticated;
revoke all on learning.review_schedule from public, anon, authenticated;
grant all on mentor.recommendations, mentor.actions, mentor.followups to service_role;
grant all on learning.review_schedule to service_role;

comment on table mentor.actions is 'Explicit commitment lifecycle; ideas are never treated as commitments by default.';
comment on table mentor.followups is 'Outcome-oriented follow-up loop for recommendations and actions.';
comment on table learning.review_schedule is 'Context-aware learning review schedule; due items feed TODAY but do not create streak pressure.';

notify pgrst, 'reload schema';