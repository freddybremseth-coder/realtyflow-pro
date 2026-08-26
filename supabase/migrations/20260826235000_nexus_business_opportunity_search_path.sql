-- Harden Nexus Opportunity Store trigger function search_path.
-- Keep migration history immutable: the original table migration remains as applied,
-- and this follow-up replaces only the trigger function definition.

CREATE OR REPLACE FUNCTION public.nexus_business_opportunity_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;
