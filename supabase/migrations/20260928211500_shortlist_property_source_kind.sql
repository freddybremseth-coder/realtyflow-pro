alter table public.lead_property_shortlist_items
  add column if not exists property_source_kind text not null default 'property';

alter table public.lead_property_shortlist_items
  drop constraint if exists lead_property_shortlist_items_source_kind_check;

alter table public.lead_property_shortlist_items
  add constraint lead_property_shortlist_items_source_kind_check
  check (property_source_kind in ('property','land_plot'));

comment on column public.lead_property_shortlist_items.property_source_kind is
  'Inventory source for internal navigation and revalidation: property or land_plot.';
