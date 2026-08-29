import assert from "node:assert/strict";
import test from "node:test";
import { inferPersonaBackfillCandidate, prioritizePersonaBackfill } from "./persona-backfill";

test("strong investment language proposes investor with evidence", () => {
  const result = inferPersonaBackfillCandidate({
    id: "1",
    notes: "Ønsker investering med realistisk utleie og avkastning. Ser på langtidsutleie.",
    pipeline_value: 450000,
    preferred_location: "Alicante",
  });
  assert.equal(result.persona, "investor");
  assert.ok(result.confidence >= 70);
  assert.ok(result.evidence.some((item) => item.signal.includes("investment")));
  assert.equal(result.requiresHumanReview, true);
});

test("explicit permanent relocation proposes permanent resident", () => {
  const result = inferPersonaBackfillCandidate({
    id: "2",
    property_interest: "Vil flytte fast til Spania og trenger helårsliv og tjenester i hverdagen.",
    pipeline_value: 520000,
  });
  assert.equal(result.persona, "permanent_resident");
  assert.ok(result.confidence >= 70);
});

test("family evidence outranks generic coastal preference", () => {
  const result = inferPersonaBackfillCandidate({
    id: "3",
    notes: "Familie med barn. Skole og aktiviteter er viktig. Vil gjerne være nær strand.",
    property_interest: "3 soverom i Albir",
  });
  assert.equal(result.persona, "family");
  assert.ok(result.evidence.length > 0);
});

test("weak generic area evidence produces no persona", () => {
  const result = inferPersonaBackfillCandidate({
    id: "4",
    property_interest: "Leilighet i Altea",
  });
  assert.equal(result.persona, null);
  assert.ok(result.confidence < 50);
  assert.ok(result.missingInformation.includes("tydelig formål med boligkjøpet"));
});

test("conflicting strong signals require human clarification rather than forced persona", () => {
  const result = inferPersonaBackfillCandidate({
    id: "5",
    notes: "Feriebolig som også skal brukes som investering og utleie.",
  });
  assert.equal(result.persona, null);
  assert.match(result.reason, /svake eller motstridende/i);
});

test("backfill queue prioritizes usable candidates before unknowns", () => {
  const rows = prioritizePersonaBackfill([
    { id: "unknown", notes: "Vil vite mer om Spania." },
    { id: "family", notes: "Familie med barn, skole og barnehage er avgjørende.", pipeline_value: 400000 },
  ]);
  assert.equal(rows[0].contact.id, "family");
  assert.equal(rows[0].candidate.persona, "family");
  assert.equal(rows[1].candidate.persona, null);
});
