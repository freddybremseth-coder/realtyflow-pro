import assert from "node:assert/strict";
import test from "node:test";
import { rankPropertyBuyerMatches } from "./property-360";

test("property 360 ranks negotiation buyer ahead of a similar passive match", () => {
  const result = rankPropertyBuyerMatches([
    {
      shortlistId: "s1",
      buyerProfileId: "p1",
      contactId: "c1",
      contactName: "Negotiation Buyer",
      pipelineStatus: "NEGOTIATION",
      shortlistStatus: "approved",
      item: { score: 76, data_quality_score: 90, system_eligibility: "eligible", reasons: ["Budget and location fit"] },
    },
    {
      shortlistId: "s2",
      buyerProfileId: "p2",
      contactId: "c2",
      contactName: "Early Buyer",
      pipelineStatus: "CONTACT",
      shortlistStatus: "approved",
      item: { score: 82, data_quality_score: 90, system_eligibility: "eligible", reasons: ["Strong feature fit"] },
    },
  ]);

  assert.equal(result[0].contactName, "Negotiation Buyer");
  assert.equal(result[0].priority, "HOT");
});

test("property 360 de-duplicates the same buyer profile and keeps best evidence", () => {
  const result = rankPropertyBuyerMatches([
    {
      shortlistId: "old",
      buyerProfileId: "p1",
      contactName: "Buyer",
      pipelineStatus: "QUALIFIED",
      item: { score: 65, data_quality_score: 80, system_eligibility: "eligible" },
    },
    {
      shortlistId: "new",
      buyerProfileId: "p1",
      contactName: "Buyer",
      pipelineStatus: "QUALIFIED",
      item: { score: 84, data_quality_score: 90, system_eligibility: "eligible", reasons: ["Latest shortlist fit"] },
    },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].shortlistId, "new");
  assert.match(result[0].reason, /Latest shortlist fit/);
});

test("conditional and rejected eligibility reduce ranking confidence", () => {
  const result = rankPropertyBuyerMatches([
    {
      shortlistId: "conditional",
      buyerProfileId: "p1",
      contactName: "Conditional",
      pipelineStatus: "CONTACT",
      item: { score: 80, data_quality_score: 90, system_eligibility: "conditional" },
    },
    {
      shortlistId: "rejected",
      buyerProfileId: "p2",
      contactName: "Rejected",
      pipelineStatus: "CONTACT",
      item: { score: 80, data_quality_score: 90, system_eligibility: "rejected" },
    },
  ]);

  assert.ok(result[0].score > result[1].score);
  assert.equal(result[1].priority, "WATCH");
});
