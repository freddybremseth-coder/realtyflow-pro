-- Corporate Intelligence Signal Review Gate
-- Human feedback can confirm, ignore, or mark findings outdated without deleting evidence.

alter table public.corporate_intelligence_findings
  add column if not exists review_status text not null default 'PENDING'
    check (review_status in ('PENDING','CONFIRMED','IGNORED','OUTDATED')),
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_email text;

create index if not exists corporate_intelligence_findings_review_idx
  on public.corporate_intelligence_findings (prospect_id, review_status, last_seen_at desc);

create table if not exists public.corporate_intelligence_reviews (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.corporate_intelligence_findings(id) on delete cascade,
  prospect_id uuid references public.corporate_prospects(id) on delete cascade,
  previous_status text check (previous_status is null or previous_status in ('PENDING','CONFIRMED','IGNORED','OUTDATED')),
  review_status text not null check (review_status in ('PENDING','CONFIRMED','IGNORED','OUTDATED')),
  note text,
  reviewed_by_email text not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists corporate_intelligence_reviews_finding_idx
  on public.corporate_intelligence_reviews (finding_id, reviewed_at desc);
create index if not exists corporate_intelligence_reviews_account_idx
  on public.corporate_intelligence_reviews (prospect_id, reviewed_at desc);

alter table public.corporate_intelligence_reviews enable row level security;

revoke all on table public.corporate_intelligence_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.corporate_intelligence_reviews to service_role;

comment on column public.corporate_intelligence_findings.review_status is
  'Seller quality gate. IGNORED and OUTDATED findings remain visible evidence but must not influence Nexus advice.';
comment on table public.corporate_intelligence_reviews is
  'Append-only seller feedback history for Corporate Intelligence finding quality and future learning.';

create or replace function public.corporate_intelligence_review_finding(
  p_finding_id uuid,
  p_prospect_id uuid,
  p_review_status text,
  p_note text,
  p_reviewer_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_previous_status text;
  v_result jsonb;
begin
  if p_review_status not in ('PENDING','CONFIRMED','IGNORED','OUTDATED') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;
  if coalesce(trim(p_reviewer_email), '') = '' then
    raise exception 'REVIEWER_EMAIL_REQUIRED';
  end if;

  select review_status
    into v_previous_status
  from public.corporate_intelligence_findings
  where id = p_finding_id
    and prospect_id = p_prospect_id
    and scope = 'ACCOUNT'
    and active = true
  for update;

  if not found then
    raise exception 'INTELLIGENCE_FINDING_NOT_FOUND';
  end if;

  update public.corporate_intelligence_findings
  set
    review_status = p_review_status,
    review_note = case when p_review_status = 'PENDING' then null else nullif(trim(p_note), '') end,
    reviewed_at = case when p_review_status = 'PENDING' then null else now() end,
    reviewed_by_email = case when p_review_status = 'PENDING' then null else lower(trim(p_reviewer_email)) end,
    updated_at = now()
  where id = p_finding_id
  returning jsonb_build_object(
    'id', id,
    'review_status', review_status,
    'review_note', review_note,
    'reviewed_at', reviewed_at,
    'reviewed_by_email', reviewed_by_email
  ) into v_result;

  insert into public.corporate_intelligence_reviews (
    finding_id,
    prospect_id,
    previous_status,
    review_status,
    note,
    reviewed_by_email
  ) values (
    p_finding_id,
    p_prospect_id,
    v_previous_status,
    p_review_status,
    nullif(trim(p_note), ''),
    lower(trim(p_reviewer_email))
  );

  return v_result;
end;
$$;

revoke all on function public.corporate_intelligence_review_finding(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.corporate_intelligence_review_finding(uuid,uuid,text,text,text)
  to service_role;

comment on function public.corporate_intelligence_review_finding(uuid,uuid,text,text,text) is
  'Service-role-only atomic review update + append-only audit for Corporate Intelligence findings.';
