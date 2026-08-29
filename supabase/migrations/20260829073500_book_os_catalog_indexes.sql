-- Book OS phase 2.1: cover every canonical catalogue foreign key used by joins.
create index if not exists publishing_catalog_assets_revision_idx
  on public.publishing_catalog_assets(revision_id) where revision_id is not null;
create index if not exists publishing_catalog_editions_book_idx
  on public.publishing_catalog_editions(canonical_book_id) where canonical_book_id is not null;
create index if not exists publishing_catalog_editions_project_idx
  on public.publishing_catalog_editions(canonical_project_id) where canonical_project_id is not null;
create index if not exists publishing_catalog_editions_website_title_idx
  on public.publishing_catalog_editions(canonical_website_title_id) where canonical_website_title_id is not null;
create index if not exists publishing_catalog_merge_log_candidate_idx
  on public.publishing_catalog_merge_log(candidate_id);
create index if not exists publishing_catalog_candidates_source_work_idx
  on public.publishing_catalog_reconciliation_candidates(source_work_id);
create index if not exists publishing_catalog_candidates_target_work_idx
  on public.publishing_catalog_reconciliation_candidates(target_work_id);
create index if not exists publishing_catalog_revisions_project_idx
  on public.publishing_catalog_revisions(project_id) where project_id is not null;

notify pgrst, 'reload schema';
