import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCorporateDecisionPack } from "@/lib/corporate-decision-pack";

const base = {
  company_name: "Example AS",
  status: "OPPORTUNITY",
  fit_tier: "A",
  fit_score: 91,
  evidence: {
    corporate_assessment: {
      model: "Employee Home",
      budget_max_eur: 600000,
      expected_users: 50,
      usage_weeks_per_year: 40,
      preferred_area: "Costa Blanca North",
      bedrooms_min: 3,
      property_type: "Villa",
      ownership_years: 10,
    },
    corporate_property_match: {
      shortlist: [
        { ref: "A1", title: "Villa A", price: 500000, bedrooms: 4, corporate_match_score: 88 },
        { ref: "A2", title: "Villa B", price: 550000, bedrooms: 3, corporate_match_score: 83 },
        { ref: "A3", title: "Villa C", price: 590000, bedrooms: 3, corporate_match_score: 79 },
      ],
    },
  },
};

test("Opportunity with persisted shortlist becomes an internal decision pack", () => {
  const pack = buildCorporateDecisionPack(base);
  assert.equal(pack.shortlist.length, 3);
  assert.equal(pack.economics.budget_headroom_eur, 100000);
  assert.equal(pack.economics.purchase_per_expected_user_eur, 10000);
  assert.equal(pack.economics.purchase_per_planned_user_week_eur, 250);
  assert.equal(pack.governance.customer_shared, false);
  assert.equal(pack.governance.automatic_customer_contact, false);
});

test("Decision pack requires Opportunity and persisted shortlist", () => {
  assert.throws(() => buildCorporateDecisionPack({ ...base, status: "MEETING" }), /OPPORTUNITY/);
  assert.throws(() => buildCorporateDecisionPack({
    ...base,
    evidence: { corporate_assessment: (base.evidence as any).corporate_assessment },
  }), /Boligshortlist/);
});

test("Decision-pack API remains internal-only and does not send customer messages", () => {
  const source = fs.readFileSync("src/app/api/corporate-homes/prospects/[id]/decision-pack/route.ts", "utf8");
  assert.match(source, /requireAdminApi/);
  assert.match(source, /customer_shared: false/);
  assert.match(source, /automatic_customer_contact: false/);
  assert.match(source, /human_quality_check_required: true/);
  assert.doesNotMatch(source, /sendEmail\s*\(|sendMessage\s*\(|publish\s*\(/);
});
