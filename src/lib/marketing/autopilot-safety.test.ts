import assert from "node:assert/strict";
import test from "node:test";
import {
  autopilotRunIdentity,
  autopilotTargetHour,
  localAutopilotSlot,
  parseLearnedAutopilotHour,
  shouldRunAutopilotSlot,
} from "./autopilot-safety";

test("autopilot has one exact eligible hour instead of a three-hour window", () => {
  assert.equal(shouldRunAutopilotSlot(11, 12), false);
  assert.equal(shouldRunAutopilotSlot(12, 12), true);
  assert.equal(shouldRunAutopilotSlot(13, 12), false);
});

test("learned hour parsing and exploration fallback are deterministic", () => {
  assert.equal(parseLearnedAutopilotHour("h_16"), 16);
  assert.equal(parseLearnedAutopilotHour("16"), null);
  assert.equal(parseLearnedAutopilotHour("h_25"), null);
  assert.equal(autopilotTargetHour(1, null), 12);
  assert.equal(autopilotTargetHour(1, 18), 18);
});

test("daily slot identity is stable per brand/channel and changes across slots", () => {
  const first = autopilotRunIdentity("DonaAnna", "instagram", "2026-09-02", 12);
  const retry = autopilotRunIdentity("donaanna", "instagram", "2026-09-02", 12);
  const nextDay = autopilotRunIdentity("donaanna", "instagram", "2026-09-03", 12);
  const facebook = autopilotRunIdentity("donaanna", "facebook", "2026-09-02", 12);
  assert.deepEqual(first, retry);
  assert.notEqual(first.marketingRunId, nextDay.marketingRunId);
  assert.notEqual(first.marketingRunId, facebook.marketingRunId);
});

test("local slot date follows Europe/Madrid, including UTC date rollover", () => {
  const slot = localAutopilotSlot(new Date("2026-09-01T22:30:00Z"), "Europe/Madrid");
  assert.equal(slot.localDate, "2026-09-02");
  assert.equal(slot.hour, 0);
});
