import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCorporateExecutionPlan } from "@/lib/corporate-execution-plan";

const shortlist = [
  { ref: "A1", title: "Villa A", price: 500000, match_score: 91 },
  { ref: "A2", title: "Villa B", price: 550000, match_score: 87 },
  { ref: "A3", title: "Villa C", price: 575000, match_score: 82 },
];

test("approved viewing outcome becomes an internal three-property viewing plan", () => {
  const plan = buildCorporateExecutionPlan({
    status: "OPPORTUNITY",
    evidence: {
      corporate_decision_pack: { shortlist },
      corporate_decision_outcome: {
        outcome: "APPROVE_VIEWINGS",
        viewing_candidate_refs: ["A1", "A2", "A3"],
      },
    },
    now: new Date("2026-09-27T14:00:00.000Z"),
  });
  assert.equal(plan.kind, "VIEWING_PLAN");
  assert.equal(plan.properties.length, 3);
  assert.equal(plan.governance.customer_message_sent, false);
  assert.equal(plan.governance.calendar_action_created, false);
});

test("approved offer prep becomes a selected-property preflight without sending an offer", () => {
  const plan = buildCorporateExecutionPlan({
    status: "OPPORTUNITY",
    evidence: {
      corporate_decision_pack: { shortlist },
      corporate_decision_outcome: {
        outcome: "APPROVE_OFFER_PREP",
        selected_property_ref: "A2",
      },
    },
  });
  assert.equal(plan.kind, "OFFER_PREP");
  assert.equal(plan.property.ref, "A2");
  assert.ok(plan.preflight.length >= 6);
  assert.equal(plan.governance.offer_sent, false);
  assert.equal(plan.governance.reservation_created, false);
});

test("hold or revision decisions cannot produce an execution plan", () => {
  assert.throws(() => buildCorporateExecutionPlan({
    status: "OPPORTUNITY",
    evidence: {
      corporate_decision_pack: { shortlist },
      corporate_decision_outcome: { outcome: "HOLD" },
    },
  }), /godkjenne visning eller tilbudsforberedelse/i);
});

test("execution-plan API contains no external execution primitives", () => {
  const source = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/execution-plan/route.ts", "utf8");
  assert.match(source, /requireAdminApi/);
  assert.match(source, /external_execution: false/);
  assert.match(source, /customer_message_sent: false/);
  assert.match(source, /offer_sent: false/);
  assert.match(source, /reservation_created: false/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|createCalendar|reserveProperty|initiatePayment|publish\s*\(/);
});
