alter table public.property_content_opportunities
  drop constraint if exists property_content_opportunities_status_check;

alter table public.property_content_opportunities
  add constraint property_content_opportunities_status_check
  check (status in ('suggested','auto_ready','drafted','dismissed','expired'));

create index if not exists property_content_opportunities_auto_ready_idx
  on public.property_content_opportunities (brand_id,score desc,detected_at desc)
  where status='auto_ready';

comment on column public.property_content_opportunities.status is
  'suggested=signal for review; auto_ready=complete Nexus draft ready to open in Content Studio; drafted=materialized by authorized editor; dismissed/expired are inactive. None imply publication.';
