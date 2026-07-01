import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVersionedImportReviewEditableFields,
  getImportReviewVersions,
  sanitizeImportReviewEditableFieldsForStorage,
} from "@/lib/demosites-import-review-versions";

test("DemoSites import review save keeps the previous active version", () => {
  const result = buildVersionedImportReviewEditableFields({
    previous: {
      profile: { company_name: "Eidskog Dekk", website_url: "https://example.com" },
      editable_fields: { hero_title: "Versjon A", services: ["Dekkskift"] },
      warnings: ["Sjekk åpningstider"],
    },
    current: {
      profile: { company_name: "Eidskog Dekk", website_url: "https://example.com" },
      editable_fields: { hero_title: "Versjon B", services: ["Dekkskift", "Hjulhotell"] },
      warnings: ["Sjekk åpningstider"],
    },
    now: new Date("2026-07-01T08:00:00.000Z"),
  });

  const versions = getImportReviewVersions(result.editable_fields);
  assert.equal(result.didAppendVersion, true);
  assert.equal(result.editable_fields.hero_title, "Versjon B");
  assert.equal(versions.length, 1);
  assert.equal(versions[0].saved_at, "2026-07-01T08:00:00.000Z");
  assert.equal(versions[0].editable_fields.hero_title, "Versjon A");
  assert.deepEqual(versions[0].warnings, ["Sjekk åpningstider"]);
  assert.ok(versions[0].changed_fields.includes("hero_title"));
});

test("DemoSites import review save avoids duplicate unchanged versions", () => {
  const firstSave = buildVersionedImportReviewEditableFields({
    previous: {
      profile: { company_name: "Fjord Bistro" },
      editable_fields: { hero_title: "Versjon A" },
      warnings: [],
    },
    current: {
      profile: { company_name: "Fjord Bistro" },
      editable_fields: { hero_title: "Versjon B" },
      warnings: [],
    },
    now: new Date("2026-07-01T08:00:00.000Z"),
  });

  const unchangedSave = buildVersionedImportReviewEditableFields({
    previous: {
      profile: { company_name: "Fjord Bistro" },
      editable_fields: firstSave.editable_fields,
      warnings: [],
    },
    current: {
      profile: { company_name: "Fjord Bistro" },
      editable_fields: firstSave.editable_fields,
      warnings: [],
    },
    now: new Date("2026-07-01T09:00:00.000Z"),
  });

  assert.equal(unchangedSave.didAppendVersion, false);
  assert.equal(getImportReviewVersions(unchangedSave.editable_fields).length, 1);
});

test("DemoSites import review storage sanitizes nested history and caps arrays", () => {
  const sanitized = sanitizeImportReviewEditableFieldsForStorage({
    hero_title: "Aktiv versjon",
    import_review_versions: [
      {
        saved_at: "2026-07-01T08:00:00.000Z",
        profile: { image_urls: Array.from({ length: 60 }, (_, index) => `https://example.com/${index}.jpg`) },
        editable_fields: {
          hero_title: "Tidligere versjon",
          import_review_versions: [{ editable_fields: { hero_title: "Skal ikke nestes" } }],
        },
        warnings: Array.from({ length: 40 }, (_, index) => `Warning ${index}`),
      },
    ],
  });

  assert.equal(sanitized.error, undefined);
  const versions = getImportReviewVersions(sanitized.value);
  assert.equal(versions.length, 1);
  assert.equal(Array.isArray(versions[0].editable_fields.import_review_versions), false);
  assert.equal((versions[0].profile.image_urls as string[]).length, 30);
  assert.equal(versions[0].warnings.length, 20);
});
