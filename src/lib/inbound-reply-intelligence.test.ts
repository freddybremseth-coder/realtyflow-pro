import assert from "node:assert/strict";
import test from "node:test";
import { classifyInboundReply, extractLatestReplyText, governInboundReply } from "./inbound-reply-intelligence";

test("explicit do-not-contact is honored automatically and stops nurture", () => {
  const classification = classifyInboundReply({ body: "Please do not contact me again." });
  assert.equal(classification.intent, "do_not_contact");
  assert.equal(classification.shouldStopNurture, true);
  const governed = governInboundReply(classification);
  assert.equal(governed.safety.tier, "AUTO");
  assert.equal(governed.canApplyAutomatically, true);
});

test("bare stop reply is do-not-contact even when quoted thread contains active language", () => {
  const classification = classifyInboundReply({
    subject: "Re: Er bolig i Spania fortsatt aktuelt for deg?",
    body: "Stopp\n\nOn Tue, Sep 8, 2026 at 09:01 Freddy wrote:\n> fortsatt interessert\n> https://zenecohomes.com/property/123",
  });
  assert.equal(classification.intent, "do_not_contact");
  assert.equal(classification.shouldStopNurture, true);
  assert.equal(classification.requiresFastResponse, false);
  assert.equal(classification.shouldRunPropertyMatching, false);
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

test("Norwegian ikke aktuelt lenger beats quoted subject, property links and active language", () => {
  const body = `Ikke aktuelt lenger.\n\nSendt fra Outlook for Android\n________________________________\nFrom: Freddy Bremseth – Zen Eco Homes <freddy@zenecohomes.com>\nSubject: Er bolig i Spania fortsatt aktuelt for deg?\nSvar gjerne «fortsatt interessert».\nhttps://zenecohomes.com/property/123`;
  const classification = classifyInboundReply({
    subject: "Re: Er bolig i Spania fortsatt aktuelt for deg?",
    body,
  });
  assert.equal(classification.intent, "no_longer_buying");
  assert.equal(classification.shouldStopNurture, true);
  assert.equal(classification.requiresFastResponse, false);
  assert.equal(classification.shouldRunPropertyMatching, false);
  assert.equal(governInboundReply(classification).canApplyAutomatically, true);
});

test("latest reply extraction removes Outlook quoted history", () => {
  const body = "Ikke aktuelt lenger.\n________________________________\nFrom: Freddy <freddy@example.com>\nfortsatt interessert";
  assert.equal(extractLatestReplyText(body), "Ikke aktuelt lenger.");
});

test("decided to rent instead is terminal buying outcome", () => {
  const classification = classifyInboundReply({ body: "Takk for mail. Vi har bestemt oss for å leie i fremtiden." });
  assert.equal(classification.intent, "no_longer_buying");
  assert.equal(classification.shouldStopNurture, true);
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

test("temporary Norwegian not-now reply is not misclassified as active interest", () => {
  const classification = classifyInboundReply({ body: "Boligkjøp i Spania er ikke aktuelt for oss med det første, men takk for henvendelsen." });
  assert.equal(classification.intent, "follow_up_later");
  assert.equal(classification.proposedPipelineAction, "schedule_followup");
  assert.equal(classification.requiresFastResponse, false);
  assert.equal(classification.shouldRunPropertyMatching, false);
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
