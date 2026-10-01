import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeResponsibilities,
  responsibilityAllowed,
  suggestedResponsibilitiesForPreset,
} from "./responsibilities";

test("responsibilities never widen workspace permissions", () => {
  assert.equal(responsibilityAllowed("pinosoecolife", "newsletter", ["email.read"]), false);
  assert.equal(responsibilityAllowed("pinosoecolife", "newsletter", ["email.read","email.draft"]), true);
  assert.equal(responsibilityAllowed("pinosoecolife", "newsletter", ["crm.read"]), false);
  assert.equal(normalizeResponsibilities("pinosoecolife", ["newsletter"], ["crm.read"]), null);
});

test("Corporate responsibility remains Zen-only", () => {
  assert.equal(responsibilityAllowed("zeneco", "corporate", ["corporate.read"]), true);
  assert.equal(responsibilityAllowed("pinosoecolife", "corporate", ["corporate.read"]), false);
});

test("partner role suggests only responsibilities supported by each brand permissions", () => {
  const pinoso = suggestedResponsibilitiesForPreset("pinosoecolife", "partner", [
    "crm.read","properties.catalog.read","visibility.read","visibility.plan","marketing.read","marketing.draft",
    "reels.read","reels.create","email.read","email.draft","nexus.read",
  ]);
  assert.deepEqual(pinoso, [
    "new-leads","property-matching","seo-content","social-reels","newsletter","nexus-review",
  ]);
  assert.equal(pinoso.includes("corporate"), false);
});

test("responsibility input rejects duplicates and unknown values", () => {
  assert.equal(normalizeResponsibilities("zeneco", ["new-leads","new-leads"], ["crm.joint.read"]), null);
  assert.equal(normalizeResponsibilities("zeneco", ["owner-admin"], ["crm.joint.read"]), null);
});
