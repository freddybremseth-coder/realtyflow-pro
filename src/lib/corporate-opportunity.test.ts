import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildCorporateOpportunityUpdate,
  evaluateCorporateOpportunityGate,
} from "@/lib/corporate-opportunity";

const readyEvidence = {
  corporate_meeting: {
    scheduled_at: "2026-09-27T10:00:00.000Z",
    method: "video",
  },
  corporate_assessment: {
    budget_max_eur: 500000,
    expected_users: 50,
    usage_weeks_per_year: 35,
    preferred_area: "Costa Blanca North",
    bedrooms_min: 3,
    property_type: "Villa",
  },
};

test("completed discovery with required assessment can become Opportunity", () => {
  const result = buildCorporateOpportunityUpdate({
    status: "MEETING",
    evidence: readyEvidence,
    now: new Date("2026-09-27T12:00:00.000Z"),
  });

  assert.equal(result.status, "OPPORTUNITY");
  assert.equal(result.next_followup, "2026-09-29T12:00:00.000Z");
  assert.equal(result.opportunity.assessment_ready, true);
  assert.equal(result.opportunity.automatic_customer_contact, false);
});

test("Opportunity gate lists missing commercial discovery fields", () => {
  const gate = evaluateCorporateOpportunityGate({
    status: "MEETING",
    evidence: {
      corporate_meeting: { scheduled_at: "2026-09-27T10:00:00.000Z" },
      corporate_assessment: { expected_users: 20 },
    },
    now: new Date("2026-09-27T12:00:00.000Z"),
  });

  assert.equal(gate.ready, false);
  assert.ok(gate.missing.includes("Maksbudsjett"));
  assert.ok(gate.missing.includes("Ønsket område"));
  assert.ok(gate.missing.includes("Boligtype"));
});

test("future meeting cannot be marked completed or promoted", () => {
  assert.throws(() => buildCorporateOpportunityUpdate({
    status: "MEETING",
    evidence: readyEvidence,
    now: new Date("2026-09-27T08:00:00.000Z"),
  }), /fremtiden/);
});

test("MEETING stage is mandatory for Opportunity", () => {
  assert.throws(() => buildCorporateOpportunityUpdate({
    status: "ENGAGED",
    evidence: readyEvidence,
    now: new Date("2026-09-27T12:00:00.000Z"),
  }), /MEETING/);
});

test("Opportunity endpoint is explicit and never sends customer communication", () => {
  const source = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/opportunity/route.ts", "utf8");
  assert.match(source, /requireAdminApi/);
  assert.match(source, /customer_message_sent: false/);
  assert.match(source, /calendar_action: false/);
  assert.match(source, /personal_enrichment: false/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|createEvent\s*\(|nodemailer|gmail/i);
});
