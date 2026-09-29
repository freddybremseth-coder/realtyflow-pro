import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const growth = fs.readFileSync("src/components/workspaces/growth-corporate-panel.tsx", "utf8");
const email = fs.readFileSync("src/components/workspaces/email-reach-panel.tsx", "utf8");
const route = fs.readFileSync("src/app/api/workspaces/[brandKey]/email/route.ts", "utf8");

test("Corporate workspace can hand approved templates into E-post / Reach", () => {
  assert.match(growth, /corporateOutreachTemplates/);
  assert.match(growth, /buildCorporatePartnerOutreach/);
  assert.match(growth, /Lag e-postutkast/);
  assert.match(growth, /targetType: "corporate" \| "partner"/);
  assert.match(growth, /initialDirectDraft=\{emailHandoff\}/);
});

test("Email handoff resolves the recipient only from server-approved workspace targets", () => {
  assert.match(email, /data\.targets\.find\(item =>/);
  assert.match(email, /item\.type === initialDirectDraft\.targetType/);
  assert.match(email, /item\.id === initialDirectDraft\.targetId/);
  assert.match(email, /har ikke en godkjent e-postmottaker/);
  assert.doesNotMatch(growth, /recipientEmail\s*:/);
});

test("Direct email save still submits target identity rather than browser-supplied recipient address", () => {
  assert.match(route, /workspace_brand_email_draft_save/);
  assert.match(route, /targetType/);
  assert.match(route, /targetId/);
  assert.doesNotMatch(route, /recipientEmail:\s*body\./);
});


test("Corporate next-step guidance remains planning-only and status-aware", () => {
  assert.match(growth, /Planlegg oppfølging/);
  assert.match(growth, /Forbered discovery-møte/);
  assert.match(growth, /Forbered registrert møte/);
  assert.match(growth, /Forbered Decision Pack/);
  assert.match(growth, /Planlegg partneroppfølging/);
  assert.match(growth, /Forbered partnersamtale/);
  assert.match(growth, /permissions\.includes\("corporate\.plan"\)/);
  assert.match(growth, /setArea\("plan"\)/);
  assert.doesNotMatch(growth, /status:\s*"MEETING"/);
  assert.doesNotMatch(growth, /status:\s*"OPPORTUNITY"/);
});
