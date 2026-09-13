import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("booking ingestion separates canonical lead creation from meeting activity", () => {
  const source = readFileSync("src/app/api/public/booking-leads/route.ts", "utf8");
  assert.match(source, /existing\?\.id \? null : await insertRevenueEvent/);
  assert.match(source, /eventType: "lead_created"/);
  assert.match(source, /eventType: "meeting_booked"/);
  assert.match(source, /\["booking-lead", brandId, revenueSourceId\]/);
  assert.match(source, /\["booking_meeting", brandId, revenueSourceId\]/);
});

test("commission state changes emit evidence-backed canonical outcomes", () => {
  const source = readFileSync("src/app/api/revenue/commissions/route.ts", "utf8");
  assert.match(source, /eventType: "commission_invoiced"/);
  assert.match(source, /eventType: "commission_paid"/);
  assert.match(source, /invoice_number: invoiceNumber/);
  assert.match(source, /paid_at: requestedPaidAt\.toISOString\(\)/);
  assert.match(source, /Fakturanummer er påkrevd/);
  assert.match(source, /reconciled_from_contact: true/);
  assert.match(source, /REVENUE_EVENT_RECONCILIATION_FAILED/);
});

test("marketing and agentic signals cannot masquerade as canonical lead creation", () => {
  const marketing = readFileSync("src/lib/marketing/events.ts", "utf8");
  const agentic = readFileSync("src/services/agentic/adapters.ts", "utf8");
  assert.match(marketing, /lead_attributed: \{ eventType: "note"/);
  assert.match(agentic, /event\.eventType === "lead_created" \? "note"/);
  assert.match(agentic, /proposed_revenue_event_type/);
});

test("marketing lead intake writes canonical lead creation through revenue events only", () => {
  const source = readFileSync("src/services/marketing/lead-intake-bridge.ts", "utf8");
  assert.match(source, /contactCreated && canonicalContactId/);
  assert.match(source, /eventType: "lead_created"/);
  assert.match(source, /sourceSystem: "marketing_lead_form"/);
  assert.doesNotMatch(source, /touchType: "lead_created"/);
});
