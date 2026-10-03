import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/care/keys/route.ts", "utf8");

test("Care key API is admin-only and stores keys in the Care schema", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /schema\("care"\)/);
  assert.match(route, /from\("kh_keys"\)/);
  assert.match(route, /property_id: propertyId/);
  assert.match(route, /status: "in_office"/);
});

test("Care key handover writes an immutable key event and updates key status", () => {
  assert.match(route, /from\("kh_key_events"\)\.insert/);
  assert.match(route, /"checked_out"/);
  assert.match(route, /"checked_in"/);
  assert.match(route, /holder_name/);
  assert.match(route, /reason/);
  assert.match(route, /nextStatus = action === "checked_out" \? "with_holder" : "in_office"/);
});

test("Care key API supports lost and retired states without deleting history", () => {
  assert.match(route, /action === "lost" \|\| action === "retired"/);
  assert.doesNotMatch(route, /\.delete\(\)/);
});
