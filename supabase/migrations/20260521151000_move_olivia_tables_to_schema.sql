-- Move Olivia farm tables from public -> olivia schema (data-preserving)
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS olivia;

DO $$
BEGIN
  -- Ensure search path can resolve references during migration
  PERFORM set_config('search_path', 'public,olivia', true);

  -- Move parent table first, then dependent tables.
  IF to_regclass('public.parcels') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.parcels SET SCHEMA olivia';
  END IF;

  IF to_regclass('public.farm_settings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.farm_settings SET SCHEMA olivia';
  END IF;

  IF to_regclass('public.harvest_records') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.harvest_records SET SCHEMA olivia';
  END IF;

  IF to_regclass('public.farm_expenses') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.farm_expenses SET SCHEMA olivia';
  END IF;

  IF to_regclass('public.subsidy_income') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.subsidy_income SET SCHEMA olivia';
  END IF;
END $$;

-- Optional helpful index checks (idempotent; only created if missing after move)
CREATE INDEX IF NOT EXISTS idx_harvest_records_date ON olivia.harvest_records(harvest_date DESC);
CREATE INDEX IF NOT EXISTS idx_farm_expenses_date ON olivia.farm_expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_subsidy_income_date ON olivia.subsidy_income(date DESC);

