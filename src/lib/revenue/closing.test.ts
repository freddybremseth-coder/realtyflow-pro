import assert from "node:assert/strict";
import test from "node:test";
import { buildClosingOpportunity, sortClosingOpportunities } from "./closing";

const NOW = new Date("2026-07-11T09:00:00.000Z");

test("flags overdue negotiation with missing legal steps as high risk", () => {
  const deal = buildClosingOpportunity({
    id: "1",
    name: "Buyer",
    email: "buyer@example.com",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 700000,
    property_interest: "Villa in Altea",
    notes: "Budget confirmed. Viewing completed. Preferred property selected.",
    next_followup: "2026-07-10T09:00:00.000Z",
  }, NOW);
  assert.ok(deal);
  assert.equal(deal.risk, "HIGH");
  assert.equal(deal.href, "/customers/1");
  assert.match(deal.nextAction, /i dag/i);
  assert.ok(deal.blockers.some((item) => /advokat/i.test(item)));
});

test("excludes non-closing pipeline stages", () => {
  assert.equal(buildClosingOpportunity({ id: "2", pipeline_status: "NEW" }, NOW), null);
  assert.equal(buildClosingOpportunity({ id: "3", pipeline_status: "WON" }, NOW), null);
});

test("complete negotiation is low risk", () => {
  const deal = buildClosingOpportunity({
    id: "4",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 500000,
    property_interest: "Apartment in Albir",
    notes: "Budget and financing confirmed. Timeline within 3 months. Both partners joined. Viewing completed. Preferred property selected. Lawyer and legal due diligence arranged. Currency and bank clarified. Reservation and offer discussed.",
    next_followup: "2026-07-12T09:00:00.000Z",
  }, NOW);
  assert.ok(deal);
  assert.equal(deal.risk, "LOW");
  assert.equal(deal.blockers.length, 0);
});

test("sorting puts high risk before low risk", () => {
  const high = buildClosingOpportunity({ id: "h", pipeline_status: "VIEWING" }, NOW);
  const low = buildClosingOpportunity({ id: "l", pipeline_status: "NEGOTIATION", notes: "Budget financing timeline both partners viewing preferred lawyer legal currency reservation offer", property_interest: "Altea", next_followup: "2026-07-12" }, NOW);
  assert.ok(high && low);
  assert.equal(sortClosingOpportunities([low, high])[0].id, "h");
});


test("reserved deal remains visible and moves into closing delivery", () => {
  const deal = buildClosingOpportunity({
    id: "reserved-1",
    pipeline_status: "RESERVED",
    pipeline_value: 620000,
    property_interest: "Villa in Finestrat",
    notes: "Reservation signed. Deposit paid. Preferred property selected. Lawyer engaged. Cash buyer. Timeline within 2 months.",
    next_followup: "2026-07-12T09:00:00.000Z",
  }, NOW);
  assert.ok(deal);
  assert.equal(deal.stage, "RESERVED");
  assert.equal(deal.checklist.find((item) => item.id === "reservation")?.complete, true);
  assert.match(deal.nextAction, /closing-plan/i);
});

test("reserved deal with missing legal and payment context is still visible but blocked", () => {
  const deal = buildClosingOpportunity({
    id: "reserved-2",
    pipeline_status: "RESERVED",
    pipeline_value: 450000,
    property_interest: "Apartment in Benidorm",
    notes: "Reservation signed.",
    next_followup: "2026-07-12T09:00:00.000Z",
  }, NOW);
  assert.ok(deal);
  assert.ok(deal.blockers.some((item) => /advokat/i.test(item)));
  assert.ok(deal.blockers.some((item) => /betalingsmåte/i.test(item)));
});
