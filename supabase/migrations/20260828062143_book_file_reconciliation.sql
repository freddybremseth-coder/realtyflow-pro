-- Approval-gated reconciliation between the canonical book catalog and private storage.
create table if not exists public.book_file_reconciliation_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  candidate_type text not null check (candidate_type in ('link_file', 'duplicate_file', 'missing_package')),
  book_id uuid references public.book_titles(id) on delete cascade,
  storage_bucket text check (storage_bucket is null or storage_bucket = 'book-ebooks'),
  storage_path text,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  match_type text check (match_type is null or match_type in ('exact', 'strong', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  evidence jsonb not null default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_book_file_reconciliation_status
  on public.book_file_reconciliation_candidates (status, candidate_type, confidence desc);
alter table public.book_file_reconciliation_candidates enable row level security;
revoke all on table public.book_file_reconciliation_candidates from public, anon, authenticated;
grant select, insert, update, delete on table public.book_file_reconciliation_candidates to service_role;

drop policy if exists "book_file_reconciliation_deny_direct" on public.book_file_reconciliation_candidates;
create policy "book_file_reconciliation_deny_direct"
  on public.book_file_reconciliation_candidates for all to anon, authenticated
  using (false) with check (false);

create or replace function public.book_file_reconciliation_apply(p_candidate_id uuid, p_applied_by text)
returns table (candidate_status text, book_id uuid, ebook_file_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_candidate public.book_file_reconciliation_candidates%rowtype;
begin
  select * into v_candidate from public.book_file_reconciliation_candidates where id=p_candidate_id for update;
  if not found then raise exception 'Candidate not found' using errcode='P0002'; end if;
  if v_candidate.status <> 'approved' then raise exception 'Candidate must be approved' using errcode='P0001'; end if;
  if v_candidate.candidate_type <> 'link_file' or v_candidate.book_id is null or v_candidate.storage_path is null then
    raise exception 'Only link_file candidates can be applied' using errcode='22023';
  end if;
  if v_candidate.storage_bucket <> 'book-ebooks' or not exists (
    select 1 from storage.objects where bucket_id=v_candidate.storage_bucket and name=v_candidate.storage_path
  ) then raise exception 'Storage object no longer exists' using errcode='P0001'; end if;
  update public.book_titles set ebook_file_path=v_candidate.storage_path, updated_at=now()
  where id=v_candidate.book_id and (ebook_file_path is null or ebook_file_path=v_candidate.storage_path);
  if not found then raise exception 'Book already has a different file path' using errcode='P0001'; end if;
  update public.book_file_reconciliation_candidates
  set status='applied', applied_at=now(), updated_at=now(),
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('applied_by',p_applied_by)
  where id=p_candidate_id;
  return query select 'applied'::text,v_candidate.book_id,v_candidate.storage_path;
end;
$$;

revoke execute on function public.book_file_reconciliation_apply(uuid,text) from public,anon,authenticated;
grant execute on function public.book_file_reconciliation_apply(uuid,text) to service_role;
notify pgrst, 'reload schema';
