import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const confirmationSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/buyer-profile-confirmation.ts"),
  "utf8",
);
const cronSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-criteria-confirmation/route.ts"),
  "utf8",
);

test("criteria email sender respects sales hold and suppression state", () => {
  assert.match(confirmationSource, /pipelineStatus === "ON_HOLD"/);
  assert.match(confirmationSource, /nurtureStatus === "stopped"/);
  assert.match(confirmationSource, /contact_not_active_for_criteria_email/);
  assert.match(confirmationSource, /waitingUntil/);
  assert.doesNotMatch(confirmationSource, /nurtureStatus === "paused"/);
});

test("only one criteria request can be open per contact", () => {
  assert.match(confirmationSource, /criteria_request_already_pending/);
  assert.match(confirmationSource, /confirmation_pending === true/);
  assert.match(confirmationSource, /criteria_clarification_pending === true/);
  assert.match(confirmationSource, /metadata->>contact_id/);
});

test("location clarification is explicitly tracked as pending", () => {
  assert.match(confirmationSource, /criteria_clarification_pending: sent\.success && !email\.requiresConfirmation/);
  assert.match(confirmationSource, /criteria_clarification_requested_at/);
});

test("criteria clarification closes when the customer replies", () => {
  assert.match(cronSource, /clarificationPending/);
  assert.match(cronSource, /criteria_clarification_reply_received/);
  assert.match(cronSource, /criteria_clarification_pending: false/);
  assert.match(cronSource, /Nexus behandler svaret som ny kriterieinformasjon/);
});

test("short contextual priority answers bypass ambiguous manual review", () => {
  assert.match(cronSource, /isContextualPriorityAnswer/);
  assert.match(cronSource, /confirmation_priority_question/);
  assert.match(cronSource, /contextual_priority_answer/);
});
