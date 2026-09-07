import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260907194500_property_feed_source_refresh.sql"),
  "utf8",
);

test("refresh RPC only updates existing feed properties and source fact columns", () => {
  assert.match(sql, /create or replace function public\.apply_property_feed_source_facts\(p_rows jsonb\)/i);
  assert.match(sql, /update public\.properties p/i);
  assert.match(sql, /p\.ref = s\.ref/i);
  assert.match(sql, /p\.source[\s\S]*'redsp'[\s\S]*'xml'[\s\S]*'csv'/i);
  for (const column of ["source_description", "amenities_no", "floor_label", "facing_source", "usage_source"]) {
    assert.match(sql, new RegExp(`${column}\\s*=`, "i"));
  }
  assert.doesNotMatch(sql, /\bprice\s*=/i);
  assert.doesNotMatch(sql, /\bstatus\s*=/i);
  assert.doesNotMatch(sql, /insert into public\.properties/i);
});

test("refresh RPC skips unchanged rows and cannot erase a missing source description", () => {
  assert.match(sql, /source_description = coalesce\(s\.source_description, p\.source_description\)/i);
  assert.match(sql, /is distinct from/i);
});

test("refresh RPC is service-only", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function public\.apply_property_feed_source_facts\(jsonb\) from anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.apply_property_feed_source_facts\(jsonb\) to service_role/i);
});

test("migration seeds the current RedSP source without duplicating it", () => {
  assert.match(sql, /insert into public\.import_sources/i);
  assert.match(sql, /'zeneco'/i);
  assert.match(sql, /'xml_url'/i);
  assert.match(sql, /xml\.redsp\.net\/files\/901\/46721pms78l\/21-3-25-all-extended\.xml/i);
  assert.match(sql, /where not exists/i);
});
