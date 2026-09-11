import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/no-match-reviews/route.ts"),
  "utf8",
);

test("no-match review API is admin-only and read-only", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function POST/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /sendBrandEmail/);
});

test("no-match review API only exposes cases explicitly escalated for human judgment", () => {
  assert.match(source, /metadata->>no_match_review_required/);
  assert.match(source, /criteriaMutated:\s*false/);
  assert.match(source, /customerMessageSent:\s*false/);
  assert.match(source, /property_match_analyzed/);
  assert.match(source, /no_match_current_criteria/);
});
