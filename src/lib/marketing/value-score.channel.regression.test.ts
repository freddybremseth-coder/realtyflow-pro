import assert from "node:assert/strict";
import test from "node:test";
import { businessValueScore, qualifiedLeadRate } from "./value-score";

test("existing Instagram-style score is unchanged when new channel-neutral fields are absent", () => {
  const score = businessValueScore({
    views: 1000,
    saves: 2,
    shares: 1,
    clicks: 3,
    leads: 1,
  });

  // 1000*0.01 + 2*1 + 1*2 + 3*3 + 1*20 = 43
  assert.equal(score, 43);
});

test("Facebook-style engagement can score without inventing views", () => {
  const score = businessValueScore({
    impressions: 1000,
    reactions: 20,
    comments: 4,
    shares: 2,
  });

  // 1000*0.005 + 20*0.2 + 4*0.5 + 2*2 = 15
  assert.equal(score, 15);
});

test("qualified lead rate uses impressions when views are unavailable", () => {
  assert.equal(qualifiedLeadRate({ impressions: 2000, qualifiedLeads: 4 }), 2);
});

test("qualified lead rate uses the larger exposure denominator when both are present", () => {
  assert.equal(qualifiedLeadRate({ views: 1500, impressions: 2000, qualifiedLeads: 4 }), 2);
});
