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
