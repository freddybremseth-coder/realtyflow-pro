import assert from "node:assert/strict";
import test from "node:test";
import {
  BrandProfileInputSchema,
  SocialIntelligenceActionSchema,
  SocialProfileImportInputSchema,
} from "./contracts";

test("brand profile schema supports an empty draft with safe defaults", () => {
  const profile = BrandProfileInputSchema.parse({});

  assert.equal(profile.primaryRole, "real_estate_advisor");
  assert.deepEqual(profile.languages, ["no"]);
  assert.deepEqual(profile.preferredTones, ["professional"]);
  assert.deepEqual(profile.expertise, []);
  assert.equal(profile.analysisConsent, true);
  assert.equal(profile.setupCompleted, false);
});

test("profile import schema accepts reviewed manual text but caps payload size", () => {
  const valid = SocialProfileImportInputSchema.parse({
    reviewedText: "Headline\nAbout\nJeg hjelper boligselgere med bedre struktur og tryggere beslutninger.",
  });

  assert.equal(valid.platform, "linkedin");
  assert.equal(valid.importType, "manual_text");

  const tooLarge = "a".repeat(12_001);
  assert.throws(() => SocialProfileImportInputSchema.parse({ reviewedText: tooLarge }));
});

test("action contract covers server-mediated profile section approval", () => {
  const action = SocialIntelligenceActionSchema.parse({
    action: "accept_section",
    section: {
      id: "5b7ae28b-0d3f-4ec5-91c6-f421223f7c18",
      approvedContent: "Eiendomsrådgiver | AI CRM | Costa Blanca",
    },
  });

  assert.equal(action.action, "accept_section");
});
