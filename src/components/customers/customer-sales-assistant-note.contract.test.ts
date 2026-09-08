import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/customers/customer-sales-assistant-note.tsx"), "utf8");

test("sales assistant UI shows Nexus conversation brief", () => {
  assert.match(source, /Samtalegrunnlag i Nexus Today/);
  assert.match(source, /result\.followupBrief/);
});

test("sales assistant UI shows Buyer Profile proposals without claiming hard persistence", () => {
  assert.match(source, /Buyer Profile-forslag/);
  assert.match(source, /ingenting blir gjort til hardt kriterium uten review/);
  assert.match(source, /buyerProfileEvidence/);
  assert.match(source, /Åpne review/);
});

test("sales assistant UI surfaces evidence conflicts", () => {
  assert.match(source, /Konflikt:/);
  assert.match(source, /conflict\.reason/);
  assert.match(source, /conflict\.values\.join/);
});

test("review draft action uses only the server-issued draft request", () => {
  assert.match(source, /const draftRequest = result\?\.buyerProfileEvidence\?\.draftRequest/);
  assert.match(source, /body: JSON\.stringify\(draftRequest\)/);
  assert.match(source, /\/api\/nexus\/profile-activation-priority\/evidence-draft/);
  assert.match(source, /Lag review-utkast/);
});

test("review draft button is hidden for conflicts, missing draft request or already persisted evidence", () => {
  assert.match(source, /reviewRecommended/);
  assert.match(source, /draftRequest/);
  assert.match(source, /conflicts\.length === 0/);
  assert.match(source, /!result\?\.buyerProfileEvidence\?\.persisted/);
});

test("draft success is described as pending review, not approved matching", () => {
  assert.match(source, /pending kriterier/);
  assert.doesNotMatch(source, /automatisk godkjent/);
  assert.doesNotMatch(source, /matching startet/);
});
