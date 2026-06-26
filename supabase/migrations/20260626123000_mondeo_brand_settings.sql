-- Seed Mondeo Eiendom AS as a custom brand without changing existing hardcoded brands.
-- This keeps the brand visible in /brands while the dedicated /mondeo page handles the finance follow-up.

INSERT INTO brand_settings (brand_id, settings, updated_at)
VALUES (
  'mondeo',
  jsonb_build_object(
    'custom_name', 'Mondeo Eiendom AS',
    'type', 'real_estate',
    'description', 'Intern oppfølging av Raveien 152E, Sandefjord',
    'color', '#14b8a6',
    'tone', 'ryddig, kontrollert, dokumentert',
    'target_audience', 'Intern business-oppfølging',
    'specialties', jsonb_build_array('betalingsplan', 'rente', 'KPI', 'sikkerhet'),
    'is_custom_brand', true
  ),
  NOW()
)
ON CONFLICT (brand_id)
DO UPDATE SET
  settings = brand_settings.settings || EXCLUDED.settings,
  updated_at = NOW();
