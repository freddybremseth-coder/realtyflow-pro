import assert from "node:assert/strict";
import test from "node:test";
import {
  brregEntityToProspect,
  isUsableBrregCorporateEntity,
  matchesBrregIndustryProfile,
} from "@/lib/corporate-brreg";

const entity = {
  organisasjonsnummer: "999999999",
  navn: "Eksempel Teknologi AS",
  hjemmeside: "example.no",
  antallAnsatte: 85,
  harRegistrertAntallAnsatte: true,
  organisasjonsform: { kode: "AS", beskrivelse: "Aksjeselskap" },
  naeringskode1: { kode: "62.010", beskrivelse: "Programmeringstjenester" },
  forretningsadresse: { poststed: "OSLO", kommune: "OSLO", landkode: "NO" },
  registrertIForetaksregisteret: true,
  registrertIMvaregisteret: true,
  konkurs: false,
  underAvvikling: false,
  underTvangsavviklingEllerTvangsopplosning: false,
};

test("Brreg adapter identifies target-industry companies", () => {
  assert.equal(matchesBrregIndustryProfile(entity, "technology"), true);
  assert.equal(matchesBrregIndustryProfile(entity, "construction"), false);
  assert.equal(isUsableBrregCorporateEntity(entity), true);
});

test("Brreg adapter maps official company facts into a scored prospect", () => {
  const prospect = brregEntityToProspect(entity);

  assert.equal(prospect.organization_number, "999999999");
  assert.equal(prospect.domain, "example.no");
  assert.equal(prospect.employee_count, 85);
  assert.equal(prospect.industry, "Programmeringstjenester");
  assert.equal(prospect.source_type, "brreg_open_data");
  assert.equal(prospect.fit_tier, "A");
  assert.ok(prospect.fit_score >= 75);
});

test("Brreg adapter rejects bankrupt or deleted company records", () => {
  assert.equal(isUsableBrregCorporateEntity({ ...entity, konkurs: true }), false);
  assert.equal(isUsableBrregCorporateEntity({ ...entity, slettedato: "2025-01-01" }), false);
});
