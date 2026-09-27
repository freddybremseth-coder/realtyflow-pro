import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCorporateDecisionOutcome } from "@/lib/corporate-decision-outcome";

const evidence = {
  corporate_decision_pack: {
    shortlist: [
      { ref: "A1", title: "Villa A" },
      { ref: "A2", title: "Villa B" },
      { ref: "A3", title: "Villa C" },
    ],
  },
};

test("approved viewings remain internal and select the top three viewing candidates", () => {
  const result = buildCorporateDecisionOutcome({
    status: "OPPORTUNITY",
    evidence,
    outcome: "APPROVE_VIEWINGS",
    now: new Date("2026-09-27T14:00:00.000Z"),
  });
  assert.equal(result.status, "OPPORTUNITY");
  assert.deepEqual(result.outcome.viewing_candidate_refs, ["A1", "A2", "A3"]);
  assert.equal(result.outcome.customer_message_sent, false);
  assert.equal(result.outcome.calendar_action_created, false);
});

test("offer preparation requires an explicitly selected shortlisted property", () => {
  assert.throws(() => buildCorporateDecisionOutcome({
    status: "OPPORTUNITY",
    evidence,
    outcome: "APPROVE_OFFER_PREP",
  }), /Velg bolig/);

  const result = buildCorporateDecisionOutcome({
    status: "OPPORTUNITY",
    evidence,
    outcome: "APPROVE_OFFER_PREP",
    selectedPropertyRef: "A2",
  });
  assert.equal(result.outcome.selected_property_ref, "A2");
  assert.equal(result.outcome.offer_sent, false);
  assert.equal(result.outcome.reservation_created, false);
});

test("decision outcome cannot bypass Opportunity or Decision Pack", () => {
  assert.throws(() => buildCorporateDecisionOutcome({
    status: "MEETING",
    evidence,
    outcome: "APPROVE_VIEWINGS",
  }), /OPPORTUNITY/);
  assert.throws(() => buildCorporateDecisionOutcome({
    status: "OPPORTUNITY",
    evidence: {},
    outcome: "APPROVE_VIEWINGS",
  }), /Decision Pack/);
});

test("decision-outcome route creates no external execution primitive", () => {
  const source = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/decision-outcome/route.ts", "utf8");
  assert.match(source, /requireAdminApi/);
  assert.match(source, /customer_message_sent: false/);
  assert.match(source, /calendar_action_created: false/);
  assert.match(source, /offer_sent: false/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|createCalendar|reserveProperty|publish\s*\(/);
});
