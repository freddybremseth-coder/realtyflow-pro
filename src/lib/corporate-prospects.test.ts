import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultDecisionRoles,
  normalizeCorporateProspect,
  scoreCorporateProspect,
} from "@/lib/corporate-prospects";

test("Corporate Homes scoring rewards Norwegian target-size companies with evidence", () => {
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

  assert.equal(result.tier, "A");
  assert.ok(result.score >= 75);
  assert.equal(result.gaps.length, 0);
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
