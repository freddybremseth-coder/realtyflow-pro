import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("src/app/api/care/calendar/route.ts", "utf8");

test("Care calendar API is admin-only and scoped to the Care schema", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /schema\("care"\)/);
  assert.match(route, /from\("kh_calendar_events"\)/);
  assert.match(route, /property_id: propertyId/);
});

test("Care calendar creates only approved operational event types", () => {
  assert.match(route, /owner_stay/);
  assert.match(route, /guest_stay/);
  assert.match(route, /service_visit/);
  assert.match(route, /prep_task/);
  assert.match(route, /storm_callout/);
  assert.doesNotMatch(route, /EVENT_TYPES = new Set\(\[[^\]]*"inspection"/s);
});

test("Care calendar status route cannot complete inspections outside Visits", () => {
  assert.match(route, /existing\.event_type === "inspection"/);
  assert.match(route, /Tilsyn fullføres fra Besøk & tilsyn/);
  assert.match(route, /status === "planned"/);
});
