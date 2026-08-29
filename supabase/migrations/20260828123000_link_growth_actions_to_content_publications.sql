-- Growth Hub attribution loop: keep a durable audited link from a Growth Action
-- to the Content Hub publication created from it. A handoff is not the same as
-- an external publish, so action status can remain truthful while publication
-- status is read from content_publications.

alter table public.growth_actions
  add column if not exists content_publication_id uuid references public.content_publications(id) on delete set null,
  add column if not exists handed_off_at timestamptz;

create index if not exists idx_growth_actions_content_publication_id
  on public.growth_actions(content_publication_id)
  where content_publication_id is not null;

create index if not exists idx_growth_actions_handed_off_at
  on public.growth_actions(handed_off_at desc)
  where handed_off_at is not null;
