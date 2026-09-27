import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCorporateProspectReadiness } from "@/lib/corporate-prospect-readiness";

test("A-fit public company data becomes research-complete but is not auto-qualified", () => {
  const readiness = evaluateCorporateProspectReadiness({
    status: "RESEARCHED",
    fit_tier: "A",
    fit_score: 90,
    organization_number: "999999999",
    domain: "example.no",
    industry: "Programmeringstjenester",
    employee_count: 80,
    organization_type: "company",
    source_url: "https://data.brreg.no/enhetsregisteret/api/enheter/999999999",
    decision_roles: ["CEO / Managing Director", "HR / People & Culture", "CFO / Finance"],
    evidence_gaps: [],
  });

  assert.equal(readiness.suggestedStage, "RESEARCHED");
  assert.equal(readiness.qualificationReady, true);
  assert.equal(readiness.autoAdvanceAllowed, false);
  assert.notEqual(readiness.suggestedStage, "QUALIFIED");
});

test("discovered A/B target can auto-advance only to researched", () => {
  const readiness = evaluateCorporateProspectReadiness({
    status: "DISCOVERED",
    fit_tier: "B",
    organization_number: "888888888",
    industry: "Ingeniørvirksomhet",
    employee_count: 45,
    source_url: "https://data.brreg.no/enhetsregisteret/api/enheter/888888888",
    decision_roles: ["CEO", "CFO", "HR"],
    evidence_gaps: ["Nettsted/domene mangler"],
  });

  assert.equal(readiness.suggestedStage, "RESEARCHED");
  assert.equal(readiness.autoAdvanceAllowed, true);
  assert.notEqual(readiness.suggestedStage, "QUALIFIED");
});

test("missing company evidence remains discovered", () => {
  const readiness = evaluateCorporateProspectReadiness({
    status: "DISCOVERED",
    fit_tier: "A",
    decision_roles: ["CEO", "CFO", "HR"],
  });

  assert.equal(readiness.suggestedStage, "DISCOVERED");
  assert.equal(readiness.autoAdvanceAllowed, false);
  assert.equal(readiness.qualificationReady, false);
  assert.ok(readiness.missing.length >= 3);
});


test("qualified company with generic company channel becomes manual-contact ready without auto-advance", () => {
  const readiness = evaluateCorporateProspectReadiness({
    status: "RESEARCHED",
    fit_tier: "B",
    fit_score: 78,
    organization_number: "777777777",
    domain: "example.no",
    industry: "Teknologitjenester",
    employee_count: 120,
    organization_type: "company",
    source_url: "https://data.brreg.no/enhetsregisteret/api/enheter/777777777",
    decision_roles: ["CEO", "CFO", "HR"],
    evidence_gaps: [],
    evidence: {
      generic_company_contact: {
        generic_email: "post@example.no",
        contact_page_url: "https://example.no/kontakt",
        company_level_only: true,
        personal_data_collected: false,
        outreach_started: false,
      },
    },
  });

  assert.equal(readiness.qualificationReady, true);
  assert.equal(readiness.manualContactReady, true);
  assert.equal(readiness.suggestedStage, "CONTACT_READY");
  assert.equal(readiness.autoAdvanceAllowed, false);
  assert.equal(readiness.genericCompanyChannel.email, "post@example.no");
  assert.match(readiness.label, /manuell kontakt/i);
});

test("qualification-ready company without a generic company channel stays researched", () => {
  const readiness = evaluateCorporateProspectReadiness({
    status: "RESEARCHED",
    fit_tier: "B",
    fit_score: 78,
    organization_number: "666666666",
    domain: "example.no",
    industry: "Teknologitjenester",
    employee_count: 120,
    organization_type: "company",
    source_url: "https://data.brreg.no/enhetsregisteret/api/enheter/666666666",
    decision_roles: ["CEO", "CFO", "HR"],
    evidence_gaps: [],
  });

  assert.equal(readiness.qualificationReady, true);
  assert.equal(readiness.manualContactReady, false);
  assert.equal(readiness.suggestedStage, "RESEARCHED");
  assert.equal(readiness.autoAdvanceAllowed, false);
  assert.ok(readiness.missing.includes("Offisiell selskapskanal mangler"));
});
