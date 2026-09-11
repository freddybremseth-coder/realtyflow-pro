import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const serviceSource = fs.readFileSync(
  path.join(process.cwd(), "src/services/email/inbound-buyer-profile-autopilot.ts"),
  "utf8",
);
const cronSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/nexus-buyer-profile-sync/route.ts"),
  "utf8",
);
const vercelSource = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

test("buyer profile autopilot only approves explicit high-confidence customer evidence", () => {
  assert.match(serviceSource, /MIN_EXPLICIT_CONFIDENCE = 0\.88/);
  assert.match(serviceSource, /raw\.includes\(source\)/);
  assert.match(serviceSource, /source: "customer_confirmed"/);
  assert.match(serviceSource, /approvalStatus: "approved"/);
  assert.match(serviceSource, /customerConfirmed: true/);
});

test("buyer profile autopilot requires a useful matching dimension and readiness confidence", () => {
  assert.match(serviceSource, /MATCH_DIMENSION_KEYS/);
  assert.match(serviceSource, /hasMatchingDimension\(verified\)/);
  assert.match(serviceSource, /readinessConfidence < 0\.75/);
});

test("existing profile updates are never overwritten automatically", () => {
  assert.match(serviceSource, /existing && input\.intent === "update_preferences"/);
  assert.match(serviceSource, /status: "revision_required"/);
  assert.match(cronSource, /Review kundeendring i Buyer Profile/);
});

test("raw customer email is not retained in Lead Intelligence persistence", () => {
  assert.match(serviceSource, /rawTextRestricted: null/);
  assert.match(serviceSource, /rawTextRetentionUntil: null/);
});

test("buyer profile sync runs between CRM sync and property matching", () => {
  const crm = vercelSource.indexOf('"/api/cron/email-crm-sync"');
  const profile = vercelSource.indexOf('"/api/cron/nexus-buyer-profile-sync"');
  const matching = vercelSource.indexOf('"/api/cron/nexus-property-match-prep"');
  assert.ok(crm >= 0 && profile > crm && matching > profile);
  assert.match(vercelSource, /nexus-buyer-profile-sync[^\n]+3-59\/5/);
  assert.match(vercelSource, /nexus-property-match-prep[^\n]+4-59\/5/);
});
