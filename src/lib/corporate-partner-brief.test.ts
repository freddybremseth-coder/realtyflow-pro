import assert from "node:assert/strict";
import test from "node:test";
import { buildCorporatePartnerBrief } from "@/lib/corporate-partner-brief";

test("Corporate partner brief creates a Norwegian partner pitch", () => {
  const brief = buildCorporatePartnerBrief({
    id: "p1",
    company_name: "FINANS NORGE",
    partner_type: "business_membership",
    fit_score: 95,
    fit_tier: "A",
    fit_reasons: ["Bred medlemsrelevans"],
    evidence_gaps: [],
    referral_angle: "Kan formidle konseptet til medlemsbedrifter.",
  });

  assert.equal(brief.partner.label, "Nærings- / medlemsorganisasjon");
  assert.match(brief.email.subject, /Mulig samarbeid/);
  assert.match(brief.email.body, /norske bedrifter og organisasjoner/);
  assert.match(brief.email.body, /FINANS NORGE/);
  assert.match(brief.email.body, /Vennlig hilsen/);
  assert.match(brief.email.body, /Freddy Bremseth/);
});

test("Corporate partner brief stays company-level and draft-first", () => {
  const brief = buildCorporatePartnerBrief({
    id: "p2",
    company_name: "EKSEMPEL AS",
    partner_type: "legal",
  });

  assert.ok(brief.guardrails.some((item) => item.includes("Ingen personnavn")));
  assert.ok(brief.guardrails.some((item) => item.includes("sendes ikke automatisk")));
  assert.doesNotMatch(brief.email.body, /@/);
  assert.equal(brief.email.body.includes("+47"), false);
});
