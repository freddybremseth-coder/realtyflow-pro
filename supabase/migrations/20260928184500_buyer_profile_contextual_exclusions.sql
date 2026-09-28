alter table public.buyer_profile_criteria
  drop constraint if exists buyer_profile_criteria_key_check;

alter table public.buyer_profile_criteria
  add constraint buyer_profile_criteria_key_check
  check (
    key = any (array[
      'bedrooms'::text,
      'bathrooms'::text,
      'property_type'::text,
      'location'::text,
      'golf_course_setting'::text,
      'short_term_rental_area'::text,
      'total_budget'::text,
      'purchase_price'::text,
      'estimated_total_cost'::text,
      'floor_position'::text,
      'has_lift'::text,
      'terrace_area_m2'::text,
      'terrace_access'::text,
      'view_quality'::text,
      'orientation'::text,
      'parking'::text,
      'pool'::text,
      'new_build_or_resale'::text,
      'availability_status'::text,
      'availability_verified_at'::text,
      'adjacent_plot_status'::text,
      'future_building_risk'::text,
      'view_privacy_loss_risk'::text,
      'view_obstruction_risk'::text,
      'legal_notes'::text,
      'living_area_m2'::text,
      'plot_area_m2'::text,
      'distance_to_beach'::text,
      'stairs'::text,
      'other'::text,
      'unknown'::text
    ])
    and (
      (key = 'other' and other_key is not null)
      or (key <> 'other' and other_key is null)
    )
  );
