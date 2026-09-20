-- Only explicitly supported price facts may be published.
-- An inclusion decision requires private written-source provenance.
-- A separate plot price is meaningful only when the plot is not included.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_plot_inclusion_requires_source'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_plot_inclusion_requires_source
      CHECK (plot_included_in_price IS NULL OR nullif(btrim(pricing_source_note), '') IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_separate_plot_price_requires_exclusion'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_separate_plot_price_requires_exclusion
      CHECK (plot_price_eur IS NULL OR plot_included_in_price IS FALSE);
  END IF;
END $$;
