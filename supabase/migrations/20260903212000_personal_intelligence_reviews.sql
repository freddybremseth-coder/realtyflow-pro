-- Personal Intelligence OS — review foundation.
-- Reviews summarize evidence over a bounded period; they are not person scores.

create table if not exists mentor.reviews (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_entity_id uuid not null references personal_core.entities(id) on delete cascade,
  review_type text not null
    check (review_type in ('daily','weekly','monthly','quarterly','annual')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft','presented','accepted','superseded')),
  source_window jsonb not null default '{}'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  summary text,
  progress_summary text,
  friction_summary text,
  learning_summary text,
  decision_summary text,
  trajectory_summary text,
  recommendation text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  generated_by text not null default 'system'
    check (generated_by in ('system','mentor','owner')),
  presented_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  unique (owner_user_id, subject_entity_id, review_type, period_start, period_end)
);

create index if not exists mentor_reviews_owner_period_idx
  on mentor.reviews(owner_user_id, subject_entity_id, review_type, period_end desc);
create index if not exists mentor_reviews_status_idx
  on mentor.reviews(owner_user_id, status, created_at desc);

create or replace function mentor.enforce_review_owner_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from personal_core.entities e
    where e.id = new.subject_entity_id and e.owner_user_id = new.owner_user_id
  ) then
    raise exception 'Review subject must belong to the same owner';
  end if;
  return new;
end;
$$;

create trigger mentor_reviews_owner_guard
before insert or update of owner_user_id, subject_entity_id on mentor.reviews
for each row execute function mentor.enforce_review_owner_link();

create trigger mentor_reviews_touch_updated_at
before update on mentor.reviews
for each row execute function personal_core.touch_updated_at();

alter table mentor.reviews enable row level security;
revoke all on mentor.reviews from public, anon, authenticated;
grant all on mentor.reviews to service_role;
revoke all on function mentor.enforce_review_owner_link() from public, anon, authenticated;
grant execute on function mentor.enforce_review_owner_link() to service_role;

comment on table mentor.reviews is
  'Evidence-bounded Personal Intelligence reviews. Sections remain separate; no aggregate person score is stored.';
comment on column mentor.reviews.evidence_snapshot is
  'Structured evidence used for the review. It must not contain hidden chain-of-thought.';

notify pgrst, 'reload schema';
