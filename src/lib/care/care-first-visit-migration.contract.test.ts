import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003001500_care_first_visit_schedule.sql", "utf8");

test("Care contract activation schedules one idempotent first visit", () => {
  assert.match(migration, /from care\.kh_calendar_events/);
  assert.match(migration, /event_type = 'inspection'/);
  assert.match(migration, /source = 'auto'/);
  assert.match(migration, /notes->>'work_item_id'/);
  assert.match(migration, /insert into care\.kh_calendar_events/);
  assert.match(migration, /'Første Care-besøk'/);
  assert.match(migration, /v_first_visit_event_id is null/);
});

test("Care first visit never becomes a separate addon charge", () => {
  assert.match(migration, /false,\s*'planned',\s*'auto'/);
  assert.match(migration, /'care_first_visit_event_id', v_first_visit_event_id/);
  assert.match(migration, /'first_visit_at', v_first_visit_at/);
});

test("Care first visit is scheduled in Europe Madrid and never in the past by date", () => {
  assert.match(migration, /Europe\/Madrid/);
  assert.match(migration, /greatest\(/);
  assert.match(migration, /time '10:00'/);
});
