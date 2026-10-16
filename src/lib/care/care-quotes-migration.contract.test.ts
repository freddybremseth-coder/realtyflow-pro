
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261003113000_care_quotes_pipeline.sql", "utf8");

test("Care quotes have an explicit lifecycle between lead and contract", () => {
  assert.match(migration, /create table if not exists care\.kh_quotes/i);
  assert.match(migration, /work_item_id uuid not null references public\.work_items/i);
  assert.match(migration, /contact_id uuid not null references public\.contacts/i);
  assert.match(migration, /plan_id uuid null references care\.kh_plans/i);
  assert.match(migration, /status in \('draft','sent','accepted','declined','expired','cancelled'\)/i);
  assert.match(migration, /monthly_price_cents bigint not null/i);
  assert.match(migration, /unique \(work_item_id\)/i);
});

test("Care quotes are not publicly accessible and are included in dashboard snapshot", () => {
  assert.match(migration, /alter table care\.kh_quotes enable row level security/i);
  assert.match(migration, /revoke all on table care\.kh_quotes from anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table care\.kh_quotes to service_role/i);
  assert.match(migration, /'kh_quotes'/);
  assert.match(migration, /from care\.kh_quotes order by created_at desc/i);
});