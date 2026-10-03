import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/care/care-dashboard.tsx", "utf8");

test("Care calendar workspace can schedule stays, prep, service and storm checks", () => {
  assert.match(source, /Planlegg opphold og service/);
  assert.match(source, /value="owner_stay"/);
  assert.match(source, /value="guest_stay"/);
  assert.match(source, /value="prep_task"/);
  assert.match(source, /value="service_visit"/);
  assert.match(source, /value="storm_callout"/);
  assert.match(source, /fetch\("\/api\/care\/calendar"/);
});

test("Care calendar workspace supports done and cancelled states", () => {
  assert.match(source, /updateCalendarEvent\(event\.id, "done"\)/);
  assert.match(source, /updateCalendarEvent\(event\.id, "cancelled"\)/);
  assert.match(source, /Marker utført/);
  assert.match(source, /Avlys/);
});

test("Care calendar keeps inspections in the dedicated Visits workflow", () => {
  assert.match(source, /Ordinære tilsyn planlegges under Besøk & tilsyn/);
  assert.match(source, /event\.type !== "inspection"/);
  assert.match(source, /href="\/care\/visits"/);
});
