-- RealtyFlow Book OS phase 3.0: versioned canon, revision-specific quality
-- evidence and controlled taxonomy. AI output is evidence only; approval is a
-- separate human decision and no approved publishing metadata is overwritten.

create table if not exists public.publishing_work_bibles (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.publishing_catalog_works(id) on delete cascade,
  source_project_id uuid references public.publishing_book_projects(id) on delete set null,
  bible_type text not null check (bible_type in ('series_bible', 'work_canon', 'style_guide', 'research_standard')),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'superseded', 'withdrawn')),
  content jsonb not null default '{}'::jsonb,
  content_fingerprint text,
  change_summary text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, bible_type, version),
  check (status <> 'approved' or (nullif(trim(approved_by), '') is not null and approved_at is not null))
);

create unique index if not exists publishing_work_bibles_one_approved
  on public.publishing_work_bibles(work_id, bible_type)
  where status = 'approved';

create index if not exists publishing_work_bibles_project_idx
  on public.publishing_work_bibles(source_project_id) where source_project_id is not null;

create table if not exists public.publishing_revision_quality_checks (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.publishing_catalog_revisions(id) on delete cascade,
  check_type text not null check (check_type in (
    'canon_consistency', 'editorial', 'factual', 'citations',
    'epub_validation', 'accessibility', 'metadata', 'legal_sensitivity'
  )),
  attempt integer not null default 1 check (attempt > 0),
  result text not null default 'pending' check (result in ('pending', 'running', 'pass', 'warning', 'fail', 'error')),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected', 'waived')),
  score numeric check (score is null or score between 0 and 100),
  automated boolean not null default true,
  provider text,
  model text,
  summary text,
  evidence jsonb not null default '{}'::jsonb,
  evidence_fingerprint text,
  started_at timestamptz,
  completed_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (revision_id, check_type, attempt),
  check (decision = 'pending' or (nullif(trim(decided_by), '') is not null and decided_at is not null)),
  check (decision <> 'waived' or nullif(trim(decision_reason), '') is not null)
);

create index if not exists publishing_revision_quality_checks_revision_idx
  on public.publishing_revision_quality_checks(revision_id, check_type, attempt desc);

create table if not exists public.publishing_taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  scheme text not null check (scheme in ('bisac', 'amazon_category', 'apple_category', 'google_category', 'kobo_category', 'internal_theme')),
  channel text not null default '',
  code text not null,
  label text not null,
  parent_code text,
  language text not null default 'en',
  active boolean not null default true,
  source text,
  source_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheme, channel, code, language)
);

create table if not exists public.publishing_edition_taxonomy_assignments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.publishing_catalog_editions(id) on delete cascade,
  revision_id uuid references public.publishing_catalog_revisions(id) on delete set null,
  taxonomy_term_id uuid references public.publishing_taxonomy_terms(id) on delete restrict,
  scheme text not null,
  channel text not null default '',
  code text not null,
  label text not null,
  assignment_type text not null default 'category' check (assignment_type in ('category', 'keyword', 'audience', 'theme')),
  rank integer not null default 1 check (rank > 0),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'applied', 'retired')),
  confidence numeric check (confidence is null or confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  proposed_by text,
  approved_by text,
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('approved', 'applied') or (nullif(trim(approved_by), '') is not null and approved_at is not null)),
  check (status <> 'applied' or applied_at is not null)
);

create unique index if not exists publishing_edition_taxonomy_assignment_identity
  on public.publishing_edition_taxonomy_assignments(
    edition_id, coalesce(revision_id, '00000000-0000-0000-0000-000000000000'::uuid),
    scheme, channel, assignment_type, code
  );

create index if not exists publishing_edition_taxonomy_review_idx
  on public.publishing_edition_taxonomy_assignments(edition_id, status, scheme, channel);

create index if not exists publishing_edition_taxonomy_revision_idx
  on public.publishing_edition_taxonomy_assignments(revision_id) where revision_id is not null;

create index if not exists publishing_edition_taxonomy_term_idx
  on public.publishing_edition_taxonomy_assignments(taxonomy_term_id) where taxonomy_term_id is not null;

do $$
declare
  table_name text;
  tables constant text[] := array[
    'publishing_work_bibles', 'publishing_revision_quality_checks',
    'publishing_taxonomy_terms', 'publishing_edition_taxonomy_assignments'
  ];
begin
  foreach table_name in array tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('drop policy if exists %I on public.%I', 'Deny direct API access to Book OS quality data', table_name);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      'Deny direct API access to Book OS quality data', table_name
    );
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.book_set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

comment on table public.publishing_work_bibles is 'Versioned series bibles, work canon, style guides and research standards; approval is explicit and human-attributed.';
comment on table public.publishing_revision_quality_checks is 'Revision-specific quality evidence with separate machine result and human decision.';
comment on table public.publishing_taxonomy_terms is 'Controlled channel-neutral and retailer taxonomy vocabulary with source/version provenance.';
comment on table public.publishing_edition_taxonomy_assignments is 'Approval-gated category, keyword, audience and theme proposals for one edition and optional revision.';

notify pgrst, 'reload schema';
