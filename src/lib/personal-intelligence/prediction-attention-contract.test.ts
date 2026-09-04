import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const service = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/today-service.ts"), "utf8");

test("TODAY reads only open predictions with deadlines inside a bounded attention horizon", () => {
  assert.match(service, /schema\("beliefs"\)\.from\("predictions"\)/);
  assert.match(service, /\.eq\("status", "open"\)/);
  assert.match(service, /\.not\("deadline", "is", null\)/);
  assert.match(service, /72 \* 3_600_000/);
  assert.match(service, /\.lte\("deadline", predictionHorizon\)/);
});

test("prediction attention never resolves or persists predictions automatically", () => {
  assert.match(service, /type: "prediction_attention"/);
  assert.match(service, /resolutionRequired: true/);
  assert.match(service, /autoResolve: false/);
  assert.match(service, /persistAsPersonalMemory: false/);
  assert.doesNotMatch(service, /schema\("beliefs"\)[\s\S]{0,180}\.update\(/);
  assert.doesNotMatch(service, /schema\("beliefs"\)[\s\S]{0,180}\.insert\(/);
  assert.doesNotMatch(service, /schema\("beliefs"\)[\s\S]{0,180}\.upsert\(/);
  assert.doesNotMatch(service, /schema\("beliefs"\)[\s\S]{0,180}\.delete\(/);
});

test("predictions reuse transparent TODAY scoring rather than a separate opaque score", () => {
  assert.match(service, /if \(item\.type === "prediction_attention"\) value \+= 5/);
  assert.match(service, /dueAt: row\.deadline/);
  assert.match(service, /open_predictions_due_within_72h_are_attention_only/);
  assert.doesNotMatch(service, /predictionScore|calibrationRank|personScore/i);
});
