-- Explicit, source-confirmed pricing facts. NULL is unknown; never infer from plot_size.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS plot_included_in_price boolean,
  ADD COLUMN IF NOT EXISTS plot_price_eur numeric,
  ADD COLUMN IF NOT EXISTS pricing_source_note text;

COMMENT ON COLUMN public.properties.plot_included_in_price IS
  'Whether the advertised property price includes the plot, verified from a written offer or source. NULL = not confirmed.';
COMMENT ON COLUMN public.properties.plot_price_eur IS
  'Documented separate plot price in EUR when plot_included_in_price = false; NULL = not confirmed.';
COMMENT ON COLUMN public.properties.pricing_source_note IS
  'Private provenance for the verified price basis (offer reference/date, developer or authorized representative). Not exposed publicly.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_plot_price_eur_nonnegative'
      AND conrelid = 'public.properties'::regclass
  ) THEN
    ALTER TABLE public.properties
      ADD CONSTRAINT properties_plot_price_eur_nonnegative
      CHECK (plot_price_eur IS NULL OR plot_price_eur >= 0);
  END IF;
END $$;
