import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/public/leads/route.ts", "utf8");

test("public lead preserves deterministic acquisition identity through CRM and revenue event", () => {
  for (const field of [
    "submission_id", "publication_id", "visitor_id", "session_id",
    "utm_source", "utm_medium", "utm_campaign", "utm_content",
  ]) assert.match(source, new RegExp(field));
  assert.match(source, /insertRevenueEvent/);
  assert.match(source, /sourceSystem: "public_leads"/);
});

test("submission id makes CRM interaction and revenue event idempotent", () => {
  assert.match(source, /submissionId \? `website-\$\{submissionId\}`/);
  assert.match(source, /buildRevenueEventDedupeKey\(\["public_leads", brandId, submissionId\]\)/);
});
