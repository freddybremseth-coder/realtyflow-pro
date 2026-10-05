import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultDecisionRoles,
  normalizeCorporateProspect,
  scoreCorporateProspect,
} from "@/lib/corporate-prospects";

test("Corporate Homes scoring keeps a strong baseline target company at B-fit until extra signals exist", () => {
  const result = scoreCorporateProspect({
    organization_type: "company",
    country_code: "NO",
    industry: "Software and technology consulting",
    employee_count: 85,
    employee_band: null,
    member_count: null,
    domain: "example.no",
    website_url: "https://example.no",
    decision_roles: ["CEO / Managing Director", "HR / People & Culture", "CFO / Finance"],
    source_url: "https://example.no/about",
  });

  assert.equal(result.tier, "B");
  assert.equal(result.score, 78);
  assert.equal(result.gaps.length, 0);
  assert.ok(result.reasons.includes("Relevante beslutningstakerroller er definert som researchmål"));
});

test("Corporate Homes scoring keeps missing evidence visible", () => {
  const result = scoreCorporateProspect({
    organization_type: "company",
    country_code: "NO",
    industry: null,
    employee_count: null,
    employee_band: null,
    member_count: null,
    domain: null,
    website_url: null,
    decision_roles: [],
    source_url: null,
  });

  assert.equal(result.tier, "C");
  assert.ok(result.gaps.includes("Antall ansatte mangler"));
  assert.ok(result.gaps.includes("Domene eller nettsted mangler"));
});

test("Corporate Homes normalization adds default buying roles and normalizes domains", () => {
  const result = normalizeCorporateProspect({
    company_name: "Eksempel AS",
    domain: "https://www.EXAMPLE.no/about",
    organization_type: "company",
    employee_count: 50,
  });

  assert.equal(result.domain, "example.no");
  assert.deepEqual(result.decision_roles, defaultDecisionRoles("company"));
});


test("Corporate Homes scoring rewards documented people-and-travel buying signals", () => {
  const withoutSignals = scoreCorporateProspect({
    organization_type: "company",
    country_code: "NO",
    industry: "Professional services",
    employee_count: 30,
    employee_band: null,
    member_count: null,
    domain: "signal.no",
    website_url: "https://signal.no",
    decision_roles: ["CEO / Managing Director", "HR / People & Culture", "CFO / Finance"],
    source_url: "https://signal.no/about",
    evidence: {},
  });

  const withSignals = scoreCorporateProspect({
    organization_type: "company",
    country_code: "NO",
    industry: "Professional services",
    employee_count: 30,
    employee_band: null,
    member_count: null,
    domain: "signal.no",
    website_url: "https://signal.no",
    decision_roles: ["CEO / Managing Director", "HR / People & Culture", "CFO / Finance"],
    source_url: "https://signal.no/about",
    evidence: {
      employee_benefit_signal: true,
      remote_workforce_signal: "Hybrid work policy",
      retreat_signal: "Annual team retreat",
    },
  });

  assert.equal(withoutSignals.tier, "B");
  assert.equal(withSignals.tier, "A");
  assert.ok(withSignals.score > withoutSignals.score);
  assert.ok(withSignals.reasons.includes("Dokumentert signal om ansattgoder"));
  assert.ok(withSignals.reasons.includes("Dokumentert signal om fjernarbeid / distribuert arbeidsstyrke"));
  assert.ok(withSignals.reasons.includes("Dokumentert signal om samlinger / retreats"));
});


test("Corporate fit scoring excludes legacy signals ignored by Intelligence review", () => {
  const base = normalizeCorporateProspect({
    company_name: "Review Gate AS",
    country_code: "NO",
    industry: "IT konsulent",
    employee_count: 80,
    website_url: "https://review-gate.example",
    source_url: "https://data.brreg.no/example",
    evidence: {
      remote_workforce_signal: "https://review-gate.example/careers",
    },
  });
  const ignored = normalizeCorporateProspect({
    company_name: "Review Gate AS",
    country_code: "NO",
    industry: "IT konsulent",
    employee_count: 80,
    website_url: "https://review-gate.example",
    source_url: "https://data.brreg.no/example",
    evidence: {
      remote_workforce_signal: "https://review-gate.example/careers",
      corporate_intelligence_review_overrides: {
        remote_workforce_signal: "IGNORED",
      },
    },
  });

  assert.equal(base.fit_score - ignored.fit_score, 4);
  assert.ok(base.fit_reasons.includes("Dokumentert signal om fjernarbeid / distribuert arbeidsstyrke"));
  assert.ok(!ignored.fit_reasons.includes("Dokumentert signal om fjernarbeid / distribuert arbeidsstyrke"));
});
