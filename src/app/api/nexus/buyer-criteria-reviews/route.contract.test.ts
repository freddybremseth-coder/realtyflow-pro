import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/buyer-criteria-reviews/route.ts"),
  "utf8",
);
const resolveSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/nexus/buyer-criteria-reviews/[reviewId]/resolve/route.ts"),
  "utf8",
);
const pageSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/(content)/nexus-os/buyer-criteria-review/page.tsx"),
  "utf8",
);

test("buyer criteria reviews are admin-only and limited to explicit human interpretation cases", () => {
  assert.match(source, /requireAdminApi\(request\)/);
  assert.match(source, /metadata->>kind/);
  assert.match(source, /buyer_profile_email_review/);
  assert.match(source, /metadata->>requires_human_interpretation/);
  assert.match(source, /human_interpretation_reply_preview/);
  assert.match(source, /searchParams\.get\("reviewId"\)/);
});

test("buyer criteria review list stays read-only and deep-links to the focused resolver", () => {
  assert.doesNotMatch(source, /\.insert\s*\(/);
  assert.doesNotMatch(source, /\.update\s*\(/);
  assert.doesNotMatch(source, /\.delete\s*\(/);
  assert.match(source, /\/nexus-os\/buyer-criteria-review\?/);
  assert.match(source, /buyerProfileId/);
  assert.match(source, /buyerProfileUpdated:\s*false/);
  assert.match(source, /matchingTriggered:\s*false/);
  assert.match(source, /emailSent:\s*false/);
});

test("human resolution validates review ownership and re-opens matching for the new approved profile", () => {
  assert.match(resolveSource, /requireAdminApi\(request\)/);
  assert.match(resolveSource, /requires_human_interpretation !== true/);
  assert.match(resolveSource, /Buyer Profile does not belong to this customer and brand/);
  assert.match(resolveSource, /status \|\| ""\)\.toLowerCase\(\) !== "approved"/);
  assert.match(resolveSource, /delete nextSourceMetadata\.property_match_prepared_at/);
  assert.match(resolveSource, /buyer_profile_status:\s*"APPROVED"/);
  assert.match(resolveSource, /human_interpretation_resolved/);
  assert.match(resolveSource, /status:\s*"DONE"/);
  assert.match(resolveSource, /matchingWillRun:\s*true/);
  assert.doesNotMatch(resolveSource, /sendEmail|nodemailer|smtp/i);
});

test("focused review UI shows customer reply, revises Buyer Profile, then resolves review", () => {
  assert.match(pageSource, /Kundens svar/);
  assert.match(pageSource, /replyPreview/);
  assert.match(pageSource, /\/api\/lead-intelligence\/buyer-profiles\/\$\{profile\.buyerProfileId\}\/revision/);
  assert.match(pageSource, /\/api\/nexus\/buyer-criteria-reviews\/\$\{encodeURIComponent\(review\.id\)\}\/resolve/);
  assert.match(pageSource, /Lagre og fortsett automatisk/);
  assert.match(pageSource, /Nexus.*automatisk.*boligmatching/s);
  assert.doesNotMatch(pageSource, /\/api\/email\/send|sendEmail|nodemailer|smtp/i);
});
