import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Corporate channel results use confirmed Revenue OS outcomes", () => {
  const route = fs.readFileSync("src/app/api/corporate-homes/overview/route.ts", "utf8");
  const page = fs.readFileSync("src/app/(business)/corporate-homes/page.tsx", "utf8");

  assert.match(route, /outcomeByChannel/);
  assert.match(route, /viewingContactIds\.has\(contactId\)/);
  assert.match(route, /offerContactIds\.has\(contactId\)/);
  assert.match(route, /leadToViewingRate/);
  assert.match(route, /viewingToOfferRate/);
  assert.match(route, /channels: acquisitionChannelsWithRevenue/);

  assert.match(page, /Faktisk visning/);
  assert.match(page, /Faktisk tilbud/);
  assert.match(page, /Lead → visning/);
  assert.match(page, /bekreftede Revenue OS-events/);
});
