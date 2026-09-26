import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporateDecisionBrief } from "@/lib/corporate-decision-brief";

test("Corporate decision brief keeps unknown commercial inputs explicit", () => {
  const brief = buildCorporateDecisionBrief({
    id: "prospect-1",
    company_name: "Eksempel Teknologi AS",
    organization_number: "999999999",
    organization_type: "company",
    industry: "Programmeringstjenester",
    city: "OSLO",
    employee_count: 85,
    fit_tier: "A",
    fit_score: 87,
    fit_reasons: ["15–500 ansatte matcher kjernemålgruppen"],
    evidence_gaps: ["Kildelenke mangler"],
    decision_roles: ["CEO / Managing Director", "HR / People & Culture", "CFO / Finance"],
    status: "RESEARCHED",
  });

  assert.equal(brief.fit.tier, "A");
  assert.equal(brief.company.size, "85 ansatte");
  assert.match(brief.workingModel.label, /Employee Home/);
  assert.ok(brief.boardChecklist.some((item) => item.label === "Investeringsramme" && item.status === "open"));
  assert.ok(brief.guardrails.some((item) => /Ukjente forhold/.test(item)));
});

test("Corporate decision brief uses member-home working model for member organisations", () => {
  const brief = buildCorporateDecisionBrief({
    id: "prospect-2",
    company_name: "Eksempel Forening",
    organization_type: "member_organization",
    member_count: 2500,
    fit_tier: "A",
    fit_score: 90,
  });

  assert.equal(brief.company.size, "2 500 medlemmer");
  assert.match(brief.workingModel.label, /Member Home/);
  assert.ok(brief.buyingCommittee.length >= 4);
});
