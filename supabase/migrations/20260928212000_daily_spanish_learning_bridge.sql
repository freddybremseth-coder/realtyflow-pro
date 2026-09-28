create table if not exists learning.external_course_progress (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  provider text not null,
  course_key text not null,
  current_level text not null default 'adaptive',
  streak_days integer not null default 0 check (streak_days >= 0),
  total_sessions integer not null default 0 check (total_sessions >= 0),
  total_minutes integer not null default 0 check (total_minutes >= 0),
  next_focus text,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, provider, course_key)
);

alter table learning.external_course_progress enable row level security;

comment on table learning.external_course_progress is
  'Owner-scoped bridge state for external learning apps. Spanish ChatGenius uses this to exchange daily progress with RealtyFlow without implying mastery.';
