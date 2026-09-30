-- Prevent duplicate open outbound-review tasks for the same candidate.
create unique index if not exists work_items_nexus_outbound_open_unique
  on public.work_items (brand_id, source_id)
  where source_type = 'ai_agent'
    and assigned_agent = 'nexus_outbound_draft'
    and status in ('TO_DO','IN_PROGRESS','REVIEW');
