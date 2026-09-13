import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/nexus/pipeline-health/route.ts", "utf8");

test("pipeline health endpoint is admin-gated and read-only", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /buildPipelineHealthSnapshot/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
  assert.doesNotMatch(source, /sendBrandEmail/);
});

test("pipeline health loads the whole governed lead journey", () => {
  for (const table of [
    "contacts",
    "buyer_profiles",
    "lead_property_shortlists",
    "lead_customer_presentations",
    "lead_customer_message_drafts",
    "work_items",
    "nexus_property_recommendation_send_receipts",
  ]) assert.match(source, new RegExp(`from\\(\\"${table}\\"\\)`));
});

test("pipeline health degrades non-critical downstream tables without hiding CRM failures", () => {
  assert.match(source, /contactsResult\.status === "rejected"/);
  assert.match(source, /optionalTableError/);
  assert.match(source, /warnings/);
});

test("pipeline health response declares read-only operating semantics", () => {
  assert.match(source, /Lead Journey Monitor er read-only observability/);
  assert.match(source, /pipelineHealth/);
});
