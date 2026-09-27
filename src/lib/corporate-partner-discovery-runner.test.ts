import assert from "node:assert/strict";
import test from "node:test";
import { selectBalancedPartnerCandidates } from "@/lib/corporate-partner-discovery-runner";

test("Partner discovery balances a batch across partner segments before taking repeats", () => {
  const candidates = [
    { partner_type: "business_membership", fit_score: 90, id: "m1" },
    { partner_type: "business_membership", fit_score: 89, id: "m2" },
    { partner_type: "business_membership", fit_score: 88, id: "m3" },
    { partner_type: "legal", fit_score: 87, id: "l1" },
    { partner_type: "accounting_tax", fit_score: 86, id: "a1" },
    { partner_type: "hr_recruitment", fit_score: 84, id: "h1" },
    { partner_type: "management_consulting", fit_score: 83, id: "c1" },
  ];

  const selected = selectBalancedPartnerCandidates(candidates, 5);
  assert.deepEqual(selected.map((row) => row.id), ["m1", "l1", "a1", "h1", "c1"]);
});

test("Partner batch selection still returns the strongest remaining candidates when segments are exhausted", () => {
  const candidates = [
    { partner_type: "legal", fit_score: 90, id: "l1" },
    { partner_type: "legal", fit_score: 88, id: "l2" },
    { partner_type: "accounting_tax", fit_score: 89, id: "a1" },
    { partner_type: "accounting_tax", fit_score: 87, id: "a2" },
  ];

  const selected = selectBalancedPartnerCandidates(candidates, 4);
  assert.deepEqual(selected.map((row) => row.id), ["l1", "a1", "l2", "a2"]);
});
