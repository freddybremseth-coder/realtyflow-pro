import assert from "node:assert/strict";
import test from "node:test";
import { COMMUNICATION_LEARNING_SAFETY } from "./communication-learning";

test("communication learning never grants autonomous customer-side authority", () => {
  assert.equal(COMMUNICATION_LEARNING_SAFETY.automaticSendAllowed, false);
  assert.equal(COMMUNICATION_LEARNING_SAFETY.policyMutationAllowed, false);
  assert.equal(COMMUNICATION_LEARNING_SAFETY.autonomyExpansionAllowed, false);
  assert.equal(COMMUNICATION_LEARNING_SAFETY.maxTimingAuthority, "recommendation_only");
});
