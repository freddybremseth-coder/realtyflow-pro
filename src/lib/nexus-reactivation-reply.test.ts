import assert from "node:assert/strict";
import test from "node:test";
import { classifyReactivationReply } from "./nexus-reactivation-reply";

test("explicit stop always suppresses nurture", () => {
  const result = classifyReactivationReply({ body: "Takk, men dette er ikke aktuelt lenger. Stopp gjerne e-postene." });
  assert.equal(result.intent, "stop");
  assert.equal(result.suggestedPipelineAction, "suppress_nurture");
  assert.equal(result.shouldReactivatePipeline, false);
});

test("continued interest reactivates the lead", () => {
  const result = classifyReactivationReply({ body: "Ja, vi er fortsatt interessert og ser fortsatt etter bolig i området." });
  assert.equal(result.intent, "reactivate_now");
  assert.equal(result.suggestedPipelineAction, "move_to_contact");
  assert.equal(result.shouldReactivatePipeline, true);
});

test("changed needs refresh buyer intelligence before matching", () => {
  const result = classifyReactivationReply({ body: "Ja, fortsatt aktuelt, men vi har endret budsjett og ser etter et annet område nå." });
  assert.equal(result.intent, "update_preferences");
  assert.equal(result.suggestedPipelineAction, "refresh_buyer_profile");
  assert.equal(result.shouldReactivatePipeline, true);
});

test("later signal schedules future follow-up instead of reactivation", () => {
  const result = classifyReactivationReply({ body: "Ikke nå, men kanskje senere eller neste år." });
  assert.equal(result.intent, "follow_up_later");
  assert.equal(result.suggestedPipelineAction, "schedule_future_followup");
  assert.equal(result.shouldReactivatePipeline, false);
});

test("unclear replies stay in human review", () => {
  const result = classifyReactivationReply({ body: "Takk for meldingen." });
  assert.equal(result.intent, "unclear");
  assert.equal(result.requiresHumanReview, true);
});
