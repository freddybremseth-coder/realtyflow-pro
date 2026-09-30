alter table public.property_content_opportunities
  drop constraint if exists property_content_opportunities_opportunity_type_check;

alter table public.property_content_opportunities
  add constraint property_content_opportunities_opportunity_type_check
  check (opportunity_type in (
    'same_price_area_gap',
    'cross_area_same_budget',
    'property_type_tradeoff',
    'budget_band_cluster'
  ));
