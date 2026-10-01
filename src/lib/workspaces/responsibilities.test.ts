import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAllowedPrimaryResponsibilities,
  filterAllowedResponsibilities,
  normalizePrimaryResponsibilities,
  normalizeResponsibilities,
  responsibilityAllowed,
  suggestedPrimaryResponsibilitiesForPreset,
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


test("read filtering preserves valid responsibilities when older assignments become stale", () => {
  const filtered = filterAllowedResponsibilities(
    "pinosoecolife",
    ["new-leads","newsletter","corporate","unknown"],
    ["crm.read"],
  );
  assert.deepEqual(filtered, ["new-leads"]);
});


test("primary responsibilities must be a subset of valid assigned responsibilities", () => {
  const permissions = ["crm.read","properties.catalog.read"] as const;
  const assigned = ["new-leads","property-matching"] as const;
  assert.deepEqual(
    normalizePrimaryResponsibilities("pinosoecolife", ["new-leads"], [...permissions], [...assigned]),
    ["new-leads"],
  );
  assert.equal(
    normalizePrimaryResponsibilities("pinosoecolife", ["newsletter"], [...permissions], [...assigned]),
    null,
  );
});

test("read filtering drops stale primary ownership without dropping valid support responsibility", () => {
  const filtered = filterAllowedPrimaryResponsibilities(
    "pinosoecolife",
    ["new-leads","newsletter"],
    ["crm.read"],
    ["new-leads"],
  );
  assert.deepEqual(filtered, ["new-leads"]);
});

test("role profiles suggest primary ownership conservatively", () => {
  const marketingResponsibilities = ["seo-content","social-reels","nexus-review"] as const;
  const marketingPrimary = suggestedPrimaryResponsibilitiesForPreset(
    "pinosoecolife",
    "marketing",
    ["visibility.plan","content.edit","marketing.draft","reels.create","nexus.read"],
    [...marketingResponsibilities],
  );
  assert.deepEqual(marketingPrimary, ["seo-content","social-reels"]);

  const partnerPrimary = suggestedPrimaryResponsibilitiesForPreset(
    "pinosoecolife",
    "partner",
    ["crm.read","properties.catalog.read","visibility.plan","marketing.draft","email.draft","nexus.read"],
    ["new-leads","property-matching","seo-content","social-reels","newsletter","nexus-review"],
  );
  assert.deepEqual(partnerPrimary, []);
});
