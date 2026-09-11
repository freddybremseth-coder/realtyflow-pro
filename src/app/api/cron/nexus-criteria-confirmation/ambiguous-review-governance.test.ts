import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-criteria-confirmation/route.ts"),
  "utf8",
);

test("ambiguous criteria confirmation replies stay open for human interpretation", () => {
  assert.match(source, /isExplicitCriteriaCorrection/);
  assert.match(source, /ambiguous_confirmation_reply/);
  assert.match(source, /requires_human_interpretation: true/);
  assert.match(source, /priority: "HIGH"/);
  assert.match(source, /Tolk tvetydig kundesvar før søkekriterier endres/);
  assert.match(source, /done: false/);
});

test("clear corrections continue through the normal Nexus inbound pipeline", () => {
  assert.match(source, /correction_or_clarification_received/);
  assert.match(source, /tydelig korrigering eller utdyping/);
  assert.match(source, /done: true/);
});

test("ambiguous replies are counted in automation logs", () => {
  assert.match(source, /ambiguous_replies: ambiguousReplies/);
  assert.match(source, /ambiguousReplies/);
});
