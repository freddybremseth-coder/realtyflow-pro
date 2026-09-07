import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/movement-recommendation-snapshot/route.ts"), "utf8");
const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

test("Movement recommendation snapshot is cron-protected and idempotent", () => {
  assert.match(route, /requireCronApi\(request\)/);
  assert.match(route, /eventType: "automation_recommended"/);
  assert.match(route, /sourceSystem: "nexus_movement"/);
  assert.match(route, /buildRevenueEventDedupeKey/);
});

test("Movement recommendation snapshot runs once daily", () => {
  assert.match(vercel, /"path": "\/api\/cron\/movement-recommendation-snapshot", "schedule": "30 5 \* \* \*"/);
});

test("Movement snapshot does not send customer communication or mutate pipeline status", () => {
  assert.doesNotMatch(route, /sendBrandEmail|sendEmail|pipeline_status\s*:/);
  assert.doesNotMatch(route, /\.from\("contacts"\)\.update/);
});
