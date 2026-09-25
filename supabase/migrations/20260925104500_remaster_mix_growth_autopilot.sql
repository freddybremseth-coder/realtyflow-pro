-- Durable idempotency for the adaptive 12-hour YouTube mix planner.
create unique index if not exists remaster_mix_growth_autopilot_slot_unique_idx
  on public.remaster_mix_jobs ((input_snapshot->>'autopilotSlotKey'))
  where source = 'growth-autopilot'
    and input_snapshot->>'autopilot' = 'true';
