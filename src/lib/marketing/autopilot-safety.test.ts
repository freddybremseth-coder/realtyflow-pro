import assert from "node:assert/strict";
import test from "node:test";
import {
  autopilotRunIdentity,
  autopilotTargetHour,
  autopilotTargetHours,
  dueAutopilotTargetHour,
  localAutopilotSlot,
  isPlannedAutopilotDay,
  parseLearnedAutopilotHour,
  shouldRunAutopilotSlot,
} from "./autopilot-safety";

test("autopilot has exact eligible hours instead of wide windows", () => {
  assert.equal(shouldRunAutopilotSlot(11, 12), false);
  assert.equal(shouldRunAutopilotSlot(12, 12), true);
  assert.equal(shouldRunAutopilotSlot(13, 12), false);
});

test("learned hour parsing and legacy exploration fallback are deterministic", () => {
  assert.equal(parseLearnedAutopilotHour("h_16"), 16);
  assert.equal(parseLearnedAutopilotHour("16"), null);
  assert.equal(parseLearnedAutopilotHour("h_25"), null);
  assert.equal(autopilotTargetHour(1, null), 12);
  assert.equal(autopilotTargetHour(1, 18), 18);
});

test("12-hour slots use learned hour and exact opposite slot", () => {
  assert.deepEqual(autopilotTargetHours("zeneco", 9), [9, 21]);
  assert.deepEqual(autopilotTargetHours("zeneco", 20), [20, 8]);
  assert.equal(dueAutopilotTargetHour(9, [9, 21]), 9);
  assert.equal(dueAutopilotTargetHour(21, [9, 21]), 21);
  assert.equal(dueAutopilotTargetHour(10, [9, 21]), null);
});

test("fallback 12-hour slots are stable per brand and stagger brands", () => {
  const zenFirst = autopilotTargetHours("zeneco", null);
  const zenRetry = autopilotTargetHours("zeneco", null);
  const pinoso = autopilotTargetHours("pinosoecolife", null);
  assert.deepEqual(zenFirst, zenRetry);
  assert.equal((zenFirst[1] - zenFirst[0] + 24) % 24, 12);
  assert.equal((pinoso[1] - pinoso[0] + 24) % 24, 12);
  assert.ok(zenFirst[0] >= 7 && zenFirst[0] <= 11);
  assert.ok(pinoso[0] >= 7 && pinoso[0] <= 11);
});

test("slot identity is stable per brand/channel and changes across slots", () => {
  const first = autopilotRunIdentity("DonaAnna", "instagram", "2026-09-02", 12);
  const retry = autopilotRunIdentity("donaanna", "instagram", "2026-09-02", 12);
  const second = autopilotRunIdentity("donaanna", "instagram", "2026-09-02", 0);
  const facebook = autopilotRunIdentity("donaanna", "facebook", "2026-09-02", 12);
  assert.deepEqual(first, retry);
  assert.notEqual(first.marketingRunId, second.marketingRunId);
  assert.notEqual(first.marketingRunId, facebook.marketingRunId);
});

test("local slot date follows Europe/Madrid, including UTC date rollover", () => {
  const slot = localAutopilotSlot(new Date("2026-09-01T22:30:00Z"), "Europe/Madrid");
  assert.equal(slot.localDate, "2026-09-02");
  assert.equal(slot.hour, 0);
});

test("legacy weekday helper remains fail closed", () => {
  const days = ["monday", "wednesday", "friday", "sunday"];
  for (const day of [0, 1, 3, 5]) assert.equal(isPlannedAutopilotDay(day, days), true);
  for (const day of [2, 4, 6]) assert.equal(isPlannedAutopilotDay(day, days), false);
  assert.equal(isPlannedAutopilotDay(1, null), true);
  assert.equal(isPlannedAutopilotDay(1, []), false);
  assert.equal(isPlannedAutopilotDay(1, ["invalid"]), false);
});
