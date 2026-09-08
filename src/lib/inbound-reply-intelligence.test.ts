import assert from "node:assert/strict";
import test from "node:test";
import { classifyInboundReply, governInboundReply } from "./inbound-reply-intelligence";

test("explicit do-not-contact is honored automatically and stops nurture", () => {
  const classification = classifyInboundReply({ body: "Please do not contact me again." });
  assert.equal(classification.intent, "do_not_contact");
  assert.equal(classification.shouldStopNurture, true);
  const governed = governInboundReply(classification);
  assert.equal(governed.safety.tier, "AUTO");
  assert.equal(governed.canApplyAutomatically, true);
});

test("explicit purchase elsewhere is AUTO terminal outcome", () => {
  const classification = classifyInboundReply({ body: "Thanks, we already bought a house elsewhere." });
  assert.equal(classification.intent, "purchased_elsewhere");
  assert.equal(classification.proposedPipelineAction, "mark_lost_purchased_elsewhere");
  assert.equal(classification.shouldStopNurture, true);
  const governed = governInboundReply(classification);
  assert.equal(governed.safety.tier, "AUTO");
  assert.equal(governed.canApplyAutomatically, true);
  assert.equal(governed.safety.requiresAudit, true);
});

test("explicit no-longer-buying reply is AUTO terminal outcome", () => {
  const classification = classifyInboundReply({ body: "We have decided not to buy and are no longer looking." });
  assert.equal(classification.intent, "no_longer_buying");
  assert.equal(classification.proposedPipelineAction, "mark_lost_no_longer_buying");
  assert.equal(classification.shouldStopNurture, true);
  const governed = governInboundReply(classification);
  assert.equal(governed.safety.tier, "AUTO");
  assert.equal(governed.canApplyAutomatically, true);
});

test("viewing request becomes fast-response priority", () => {
  const classification = classifyInboundReply({ body: "Can we book a viewing for this villa on Thursday?" });
  assert.equal(classification.intent, "viewing_request");
  assert.equal(classification.requiresFastResponse, true);
  assert.equal(classification.shouldRunPropertyMatching, true);
  assert.equal(classification.shouldPauseNurture, true);
});

test("changed preferences trigger buyer profile refresh and rematching", () => {
  const classification = classifyInboundReply({ body: "Our requirements changed, we now have a different budget and want another area." });
  assert.equal(classification.intent, "update_preferences");
  assert.equal(classification.shouldRefreshBuyerProfile, true);
  assert.equal(classification.shouldRunPropertyMatching, true);
});

test("specific property links are treated as active property interest", () => {
  const classification = classifyInboundReply({ body: "I like this property https://zenecohomes.com/property/123 - is it available?" });
  assert.equal(classification.intent, "property_interest");
  assert.equal(classification.requiresFastResponse, true);
});

test("later request pauses nurture and schedules follow-up", () => {
  const classification = classifyInboundReply({ body: "Not now, please contact us after summer." });
  assert.equal(classification.intent, "follow_up_later");
  assert.equal(classification.proposedPipelineAction, "schedule_followup");
  assert.equal(classification.shouldPauseNurture, true);
});

test("plain customer question is not mistaken for a terminal outcome", () => {
  const classification = classifyInboundReply({ body: "How much is the community fee?" });
  assert.equal(classification.intent, "question");
  assert.equal(classification.proposedPipelineAction, "prepare_answer");
  assert.equal(classification.shouldStopNurture, false);
});

test("unclear messages remain manual review", () => {
  const classification = classifyInboundReply({ body: "Thanks for the information." });
  assert.equal(classification.intent, "unclear");
  const governed = governInboundReply(classification);
  assert.equal(governed.safety.tier, "REVIEW");
  assert.equal(governed.canApplyAutomatically, false);
});
