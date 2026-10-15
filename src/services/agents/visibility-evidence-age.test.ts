import test from "node:test";
import assert from "node:assert/strict";
import { visibilityEvidenceAge } from "./visibility-evidence-age";

const now = new Date("2026-10-15T12:00:00.000Z");

test("weekly samples remain recent within a ten-day observation window", () => {
  assert.equal(visibilityEvidenceAge("2026-10-08T13:00:00.000Z", now), "RECENT");
});
test("old samples require a new technical check, not a stale green label", () => {
  assert.equal(visibilityEvidenceAge("2026-09-30T12:00:00.000Z", now), "AGED");
});
test("missing, invalid and significantly future-dated evidence are unknown", () => {
  assert.equal(visibilityEvidenceAge(null, now), "UNKNOWN");
  assert.equal(visibilityEvidenceAge("not-a-date", now), "UNKNOWN");
  assert.equal(visibilityEvidenceAge("2026-10-16T12:00:00.000Z", now), "UNKNOWN");
});
test("short processing clock-skew does not itself invalidate a fresh observation", () => {
  assert.equal(visibilityEvidenceAge("2026-10-15T12:08:00.000Z", now), "RECENT");
});
