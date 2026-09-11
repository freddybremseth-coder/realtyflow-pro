import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/buyer-criteria-reviews/route.ts"),
  "utf8",
);

test("buyer criteria reviews are admin-only and limited to explicit human interpretation cases", () => {
  assert.match(source, /requireAdminApi\(request\)/);
  assert.match(source, /metadata->>kind/);
  assert.match(source, /buyer_profile_email_review/);
  assert.match(source, /metadata->>requires_human_interpretation/);
  assert.match(source, /human_interpretation_reply_preview/);
});

test("buyer criteria review endpoint is read-only and deep-links to Customer 360", () => {
  assert.doesNotMatch(source, /\.insert\s*\(/);
  assert.doesNotMatch(source, /\.update\s*\(/);
  assert.doesNotMatch(source, /\.delete\s*\(/);
  assert.match(source, /\/customers\/\$\{encodeURIComponent\(contactId\)\}/);
  assert.match(source, /buyerProfileUpdated:\s*false/);
  assert.match(source, /matchingTriggered:\s*false/);
  assert.match(source, /emailSent:\s*false/);
});
