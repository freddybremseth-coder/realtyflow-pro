import assert from "node:assert/strict";
import test from "node:test";
import {
  pronunciationInstructionsForText,
  type VoicePronunciationRule,
} from "./voice-pronunciations";

const rule = (overrides: Partial<VoicePronunciationRule> = {}): VoicePronunciationRule => ({
  id: "00000000-0000-0000-0000-000000000001",
  organization_id: "00000000-0000-0000-0000-000000000002",
  brand_id: null,
  language: "Norwegian",
  term: "Doña Anna",
  pronunciation: "Donja Anna",
  notes: null,
  active: true,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  ...overrides,
});

test("pronunciation dictionary matches accented and ASCII spelling without duplicates", () => {
  const instructions = pronunciationInstructionsForText([
    rule(),
    rule({ id: "00000000-0000-0000-0000-000000000003", term: "Dona Anna" }),
  ], "Dona Anna, premium spansk økologisk olivenolje.");

  assert.match(instructions, /Pronounce “Doña Anna” as “Donja Anna”/);
  assert.equal((instructions.match(/Pronounce/g) || []).length, 1);
});

test("pronunciation dictionary ignores unrelated and inactive rules", () => {
  const instructions = pronunciationInstructionsForText([
    rule({ active: false }),
    rule({ id: "00000000-0000-0000-0000-000000000004", term: "Altea", pronunciation: "Al-te-a" }),
  ], "Velkommen til Benidorm.");

  assert.equal(instructions, "");
});
