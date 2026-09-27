import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  appendCorporateConfirmedOutcome,
  buildCorporateConfirmedOutcome,
} from "@/lib/corporate-confirmed-outcome";

const viewingEvidence = {
  corporate_execution_plan: {
    kind: "VIEWING_PLAN",
    properties: [{ ref: "A1", price: 510000 }, { ref: "A2", price: 540000 }],
  },
};

test("confirmed completed viewing requires CRM identity and a planned property", () => {
  const outcome = buildCorporateConfirmedOutcome({
    status: "OPPORTUNITY",
    convertedContactId: "contact-1",
    evidence: viewingEvidence,
    type: "VIEWING_COMPLETED",
    propertyRef: "A2",
    occurredAt: "2026-09-27T16:00:00.000Z",
  });
  assert.equal(outcome.eventType, "viewing_completed");
  assert.equal(outcome.crmPipelineStatus, "VIEWING");
  assert.equal(outcome.propertyRef, "A2");
  assert.equal(outcome.pipelineValueEur, 540000);
  assert.equal(outcome.nextFollowupAt, "2026-09-28T16:00:00.000Z");
  assert.throws(() => buildCorporateConfirmedOutcome({
    status: "OPPORTUNITY",
    evidence: viewingEvidence,
    type: "VIEWING_COMPLETED",
    propertyRef: "A1",
  }), /promotert til CRM/);
});

test("confirmed offer must match the property selected in offer preflight", () => {
  const evidence = {
    corporate_execution_plan: {
      kind: "OFFER_PREP",
      property: { ref: "B7", price: 500000 },
    },
  };
  const outcome = buildCorporateConfirmedOutcome({
    status: "OPPORTUNITY",
    convertedContactId: "contact-2",
    evidence,
    type: "OFFER_MADE",
    propertyRef: "B7",
    offerAmountEur: 475000,
  });
  assert.equal(outcome.eventType, "offer_made");
  assert.equal(outcome.crmPipelineStatus, "NEGOTIATION");
  assert.equal(outcome.offerAmountEur, 475000);
  assert.equal(outcome.pipelineValueEur, 475000);
  assert.throws(() => buildCorporateConfirmedOutcome({
    status: "OPPORTUNITY",
    convertedContactId: "contact-2",
    evidence,
    type: "OFFER_MADE",
    propertyRef: "WRONG",
  }), /Tilbudet må gjelde/);
});

test("confirmed-outcome log stays bounded", () => {
  let evidence: Record<string, unknown> = {};
  for (let i = 0; i < 25; i += 1) {
    evidence = appendCorporateConfirmedOutcome(evidence, { i });
  }
  assert.equal((evidence.corporate_confirmed_outcomes as unknown[]).length, 20);
  assert.deepEqual(evidence.latest_corporate_confirmed_outcome, { i: 24 });
});

test("route reuses canonical Revenue Events and contains no external action primitive", () => {
  const source = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/confirmed-outcome/route.ts", "utf8");
  assert.match(source, /insertRevenueEvent/);
  assert.match(source, /sourceSystem: "corporate_homes"/);
  assert.match(source, /actorType: "human"/);
  assert.match(source, /pipeline_status: outcome\.crmPipelineStatus/);
  assert.match(source, /customer_message_sent: false/);
  assert.match(source, /offer_sent_by_realtyflow: false/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|createCalendar|reserveProperty|initiatePayment|publish\s*\(/);
});
