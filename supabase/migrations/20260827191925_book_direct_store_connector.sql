-- RealtyFlow Book Distribution Control Plane v2
-- Automated, approval-gated EPUB delivery to books.freddybremseth.com.

alter table public.publishing_books
  add column if not exists source_project_id uuid references public.publishing_book_projects(id) on delete set null,
  add column if not exists epub_path text,
  add column if not exists description text not null default '',
  add column if not exists language text not null default '',
  add column if not exists cover_url text,
  add column if not exists published_at timestamptz,
  add column if not exists direct_gross_sales numeric(12,2) not null default 0;

create unique index if not exists idx_publishing_books_source_project
  on public.publishing_books (source_project_id)
  where source_project_id is not null;

alter table public.publishing_books drop constraint if exists publishing_books_format_check;
alter table public.publishing_books
  add constraint publishing_books_format_check check (format in (
    'kindle', 'epub', 'paperback', 'hardcover', 'audio', 'lead_magnet', 'other'
  ));

comment on column public.publishing_books.epub_path is
  'Path in the private book-epubs bucket. Download access is granted only after a verified purchase.';
comment on column public.publishing_books.source_project_id is
  'Idempotent link to the Book Engine project that produced this direct-store edition.';

alter table public.book_download_grants
  add column if not exists file_format text;
alter table public.book_download_grants drop constraint if exists book_download_grants_file_format_check;
alter table public.book_download_grants
  add constraint book_download_grants_file_format_check
  check (file_format is null or file_format in ('pdf', 'epub'));

revoke all on table public.publishing_books from public, anon, authenticated;
revoke all on table public.book_download_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.publishing_books to service_role;
grant select, insert, update, delete on table public.book_download_grants to service_role;

insert into storage.buckets (id, name, public)
values ('book-epubs', 'book-epubs', false)
on conflict (id) do update set public = false;

create table if not exists public.publishing_direct_sales (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  book_id uuid not null references public.publishing_books(id) on delete restrict,
  file_format text not null check (file_format in ('pdf', 'epub')),
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  currency text not null,
  sold_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_publishing_direct_sales_book_sold
  on public.publishing_direct_sales (book_id, sold_at desc);

alter table public.publishing_direct_sales enable row level security;
revoke all on table public.publishing_direct_sales from public, anon, authenticated;
grant select, insert, update, delete on table public.publishing_direct_sales to service_role;

drop policy if exists "publishing_direct_sales_deny_direct" on public.publishing_direct_sales;
create policy "publishing_direct_sales_deny_direct"
  on public.publishing_direct_sales for all to anon, authenticated
  using (false) with check (false);

insert into public.publishing_channel_connections (
  brand_id, channel, external_account_id, account_label, connector_type,
  status, capabilities, config, last_health_check_at, updated_at
)
values (
  'freddypublishing', 'direct_store', 'default', 'books.freddybremseth.com', 'internal_api',
  'connected',
  '{"publish":"automated","metadata":"automated","pricing":"automated","sales":"automated"}'::jsonb,
  '{"storage_bucket":"book-epubs","approval_required":true}'::jsonb,
  now(), now()
)
on conflict (brand_id, channel, external_account_id) do update
set connector_type = excluded.connector_type,
    status = excluded.status,
    capabilities = excluded.capabilities,
    config = excluded.config,
    last_health_check_at = excluded.last_health_check_at,
    last_error = null,
    updated_at = excluded.updated_at;

create or replace function public.publishing_distribution_claim_job(
  p_job_id uuid,
  p_actor text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publication_id uuid;
  v_now timestamptz := now();
begin
  update public.publishing_distribution_jobs
  set status = 'running',
      started_at = v_now,
      run_after = null,
      attempt_count = attempt_count + 1,
      error = null,
      output = coalesce(output, '{}'::jsonb) || jsonb_build_object(
        'execution', jsonb_build_object('claimed_by', p_actor, 'claimed_at', v_now)
      ),
      updated_at = v_now
  where id = p_job_id
    and status = 'approved'
    and attempt_count < 3
    and (run_after is null or run_after <= v_now)
  returning publication_id into v_publication_id;

  if v_publication_id is null then return false; end if;

  update public.publishing_distribution_publications
  set status = 'submitted', submitted_at = coalesce(submitted_at, v_now), updated_at = v_now
  where id = v_publication_id and status = 'approved';
  return true;
end;
$$;

create or replace function public.publishing_distribution_finish_job(
  p_job_id uuid,
  p_succeeded boolean,
  p_book_id uuid default null,
  p_external_id text default null,
  p_external_url text default null,
  p_output jsonb default '{}'::jsonb,
  p_error jsonb default null
)
returns table (job_status text, publication_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.publishing_distribution_jobs%rowtype;
  v_now timestamptz := now();
begin
  select * into v_job
  from public.publishing_distribution_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Distribution job not found' using errcode = 'P0002'; end if;
  if v_job.status <> 'running' then
    raise exception 'Distribution job must be running, current status: %', v_job.status using errcode = 'P0001';
  end if;

  if p_succeeded then
    update public.publishing_distribution_jobs
    set status = 'succeeded',
        output = coalesce(output, '{}'::jsonb) || coalesce(p_output, '{}'::jsonb),
        error = null, finished_at = v_now, updated_at = v_now
    where id = p_job_id;
    update public.publishing_distribution_publications
    set status = 'published', book_id = coalesce(p_book_id, book_id),
        external_id = p_external_id, external_url = p_external_url,
        artifact_manifest = coalesce(artifact_manifest, '{}'::jsonb) || coalesce(p_output->'artifact_manifest', '{}'::jsonb),
        published_at = v_now, last_synced_at = v_now, updated_at = v_now
    where id = v_job.publication_id;
  elsif v_job.attempt_count < 3 then
    update public.publishing_distribution_jobs
    set status = 'approved', error = coalesce(p_error, '{"code":"CONNECTOR_FAILED"}'::jsonb),
        run_after = v_now + interval '15 minutes', finished_at = null, updated_at = v_now
    where id = p_job_id;
    update public.publishing_distribution_publications set status = 'approved', updated_at = v_now
    where id = v_job.publication_id;
  else
    update public.publishing_distribution_jobs
    set status = 'failed', error = coalesce(p_error, '{"code":"CONNECTOR_FAILED"}'::jsonb),
        finished_at = v_now, updated_at = v_now
    where id = p_job_id;
    update public.publishing_distribution_publications set status = 'failed', updated_at = v_now
    where id = v_job.publication_id;
  end if;

  return query
  select jobs.status, publications.status
  from public.publishing_distribution_jobs jobs
  join public.publishing_distribution_publications publications on publications.id = jobs.publication_id
  where jobs.id = p_job_id;
end;
$$;

create or replace function public.publishing_record_direct_sale(
  p_stripe_session_id text,
  p_book_id uuid,
  p_file_format text,
  p_gross_amount numeric,
  p_currency text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted uuid;
begin
  if p_file_format not in ('pdf', 'epub') then
    raise exception 'Unsupported book format' using errcode = '22023';
  end if;
  if p_gross_amount < 0 then
    raise exception 'Gross amount must be non-negative' using errcode = '22023';
  end if;

  insert into public.publishing_direct_sales (
    stripe_session_id, book_id, file_format, gross_amount, currency, metadata
  ) values (
    p_stripe_session_id, p_book_id, p_file_format, p_gross_amount, upper(p_currency), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (stripe_session_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then return false; end if;

  update public.publishing_books
  set orders = coalesce(orders, 0) + 1,
      direct_gross_sales = coalesce(direct_gross_sales, 0) + p_gross_amount,
      last_checked_at = now(), updated_at = now()
  where id = p_book_id;
  return true;
end;
$$;

revoke execute on function public.publishing_distribution_claim_job(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.publishing_distribution_finish_job(uuid, boolean, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.publishing_record_direct_sale(text, uuid, text, numeric, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.publishing_distribution_claim_job(uuid, text) to service_role;
grant execute on function public.publishing_distribution_finish_job(uuid, boolean, uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.publishing_record_direct_sale(text, uuid, text, numeric, text, jsonb) to service_role;

notify pgrst, 'reload schema';
