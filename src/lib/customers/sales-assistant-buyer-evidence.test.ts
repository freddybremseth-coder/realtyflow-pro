import assert from "node:assert/strict";
import test from "node:test";
import { buildBuyerProfileEvidencePreview } from "@/lib/nexus/buyer-profile-evidence";

function preview(note: string, propertyInterest: string | null = null) {
  return buildBuyerProfileEvidencePreview({
    email: "buyer@example.com",
    phone: "+34123456789",
    pipeline_value: 450000,
    property_interest: propertyInterest,
    next_followup: "2026-09-22T10:00:00.000Z",
    notes: note,
    interactions: [],
  });
}

test("sales assistant note yields structured review evidence for type, bedrooms and purchase timeline", () => {
  const result = preview("Kunden ønsker villa med minst 3 soverom og vil kjøpe innen 6 måneder.");
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(
    result.candidates.map((item) => [item.key, item.otherKey, item.operator, item.value]),
    [
      ["property_type", null, "eq", "villa"],
      ["bedrooms", null, "gte", 3],
      ["other", "purchase timeline", "eq", "within_6_months"],
    ],
  );
  assert.equal(result.safeForAutoPersistence, false);
  assert.equal(result.readOnly, true);
});

test("existing CRM evidence conflict prevents a clean review recommendation", () => {
  const result = preview("Kunden sier nå at han kun ønsker villa.", "Ser etter leilighet nær stranden");
  assert.ok(result.conflicts.some((item) => item.field === "property_type"));
});
