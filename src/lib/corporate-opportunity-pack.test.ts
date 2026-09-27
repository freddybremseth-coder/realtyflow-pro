import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildCorporateOpportunityPack,
  opportunityPackToText,
} from "@/lib/corporate-opportunity-pack";

const evidence = {
  corporate_assessment: {
    model: "Bedriftsvilla",
    budget_max_eur: 500000,
    expected_users: 45,
    usage_weeks_per_year: 32,
    preferred_area: "Costa Blanca North",
    bedrooms_min: 3,
    property_type: "Villa",
  },
  corporate_property_match: {
    shortlist: [
      {
        ref: "A1",
        title: "Villa A",
        location: "Finestrat",
        price: 450000,
        corporate_match_score: 91,
        corporate_use_classification: "Strong fit",
        corporate_match_reasons: ["Innenfor budsjett", "Riktig størrelse"],
        corporate_match_cautions: ["Tilgjengelighet må bekreftes"],
      },
      {
        ref: "B2",
        title: "Villa B",
        location: "Polop",
        price: 525000,
        corporate_match_score: 84,
        corporate_match_reasons: ["God kapasitet"],
        corporate_match_cautions: [],
      },
    ],
  },
};

test("Opportunity Pack summarizes documented assessment and shortlist without inventing returns", () => {
  const pack = buildCorporateOpportunityPack({
    company_name: "Example AS",
    status: "OPPORTUNITY",
    fit_tier: "A",
    fit_score: 88,
    evidence,
  }, new Date("2026-09-27T12:00:00.000Z"));

  assert.equal(pack.shortlist.length, 2);
  assert.equal(pack.shortlist[0].budget_delta_eur, 50000);
  assert.equal(pack.shortlist[0].within_budget, true);
  assert.equal(pack.shortlist[1].budget_delta_eur, -25000);
  assert.equal(pack.shortlist[1].within_budget, false);
  assert.equal(pack.customer_shared, false);
  assert.equal(pack.human_quality_check_required, true);
  assert.doesNotMatch(pack.executive_summary, /return|avkastning|garantert/i);
});

test("Opportunity Pack requires OPPORTUNITY stage and a saved shortlist", () => {
  assert.throws(() => buildCorporateOpportunityPack({
    company_name: "Example AS",
    status: "MEETING",
    evidence,
  }), /OPPORTUNITY/);

  assert.throws(() => buildCorporateOpportunityPack({
    company_name: "Example AS",
    status: "OPPORTUNITY",
    evidence: { corporate_assessment: evidence.corporate_assessment },
  }), /shortlist/i);
});

test("plain-text Opportunity Pack is suitable for manual review and copy", () => {
  const pack = buildCorporateOpportunityPack({
    company_name: "Example AS",
    status: "OPPORTUNITY",
    evidence,
  }, new Date("2026-09-27T12:00:00.000Z"));
  const text = opportunityPackToText(pack);

  assert.match(text, /ZEN CORPORATE HOMES · OPPORTUNITY PACK/);
  assert.match(text, /TOPP 3/);
  assert.match(text, /€50[  ]?000 under maksbudsjett|€50\.000 under maksbudsjett/);
  assert.match(text, /Ikke kundedelt/i);
});

test("Opportunity Pack endpoint remains internal-only and never sends", () => {
  const source = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/opportunity-pack/route.ts", "utf8");
  assert.match(source, /requireAdminApi/);
  assert.match(source, /customer_shared: false/);
  assert.match(source, /customer_message_sent: false/);
  assert.match(source, /personal_enrichment: false/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|publish\s*\(|nodemailer|gmail/i);
});
