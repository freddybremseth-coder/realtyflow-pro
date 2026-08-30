import assert from "node:assert/strict";
import test from "node:test";
import { inferPersonaBackfillCandidate, prioritizePersonaBackfill, validatePersonaBackfillApproval } from "./persona-backfill";

test("strong investment language proposes investor with evidence", () => {
  const result = inferPersonaBackfillCandidate({
    id: "1",
    notes: "Ønsker investering med realistisk utleie og avkastning. Ser på langtidsutleie.",
    pipeline_value: 450000,
    property_interest: "Alicante",
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

test("high-confidence matching Persona can be explicitly approved", () => {
  const result = validatePersonaBackfillApproval({
    id: "approve-investor",
    notes: "Investor søker investeringsbolig for langtidsutleie med fokus på yield og avkastning.",
    pipeline_value: 500000,
    property_interest: "Alicante investment apartment",
  }, "investor");
  assert.equal(result.ok, true);
  assert.equal(result.persona, "investor");
  assert.ok(result.candidate.confidence >= 80);
});

test("wrong requested Persona is rejected after server-side re-evaluation", () => {
  const result = validatePersonaBackfillApproval({
    id: "approve-family",
    notes: "Familie med barn, skole, barnehage og aktiviteter er avgjørende for boligvalget.",
    property_interest: "4 bedroom family home",
  }, "investor");
  assert.equal(result.ok, false);
  assert.equal(result.candidate.persona, "family");
  assert.match(result.reason, /samsvarer ikke/i);
});

test("weak evidence cannot be directly approved even when requested Persona is valid", () => {
  const result = validatePersonaBackfillApproval({
    id: "approve-weak",
    property_interest: "Leilighet i Altea",
  }, "coastal_social");
  assert.equal(result.ok, false);
  assert.equal(result.candidate.persona, null);
});

test("invalid Persona is rejected", () => {
  const result = validatePersonaBackfillApproval({
    id: "approve-invalid",
    notes: "Investor med utleie og avkastning som hovedmål.",
  }, "luxury_buyer");
  assert.equal(result.ok, false);
  assert.equal(result.persona, null);
});

test("approval threshold rejects otherwise usable candidate below configured confidence", () => {
  const contact = {
    id: "threshold",
    notes: "Pensjonist som ønsker å bo i Spania.",
    pipeline_value: 300000,
  };
  const candidate = inferPersonaBackfillCandidate(contact);
  assert.equal(candidate.persona, "retiree");
  const result = validatePersonaBackfillApproval(contact, "retiree", 96);
  assert.equal(result.ok, false);
  assert.match(result.reason, /minst 96%/i);
});
