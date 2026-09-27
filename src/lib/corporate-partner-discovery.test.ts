import assert from "node:assert/strict";
import test from "node:test";
import {
  corporatePartnerProfiles,
  partnerCandidateFromBrreg,
} from "@/lib/corporate-partner-discovery";

const membership = corporatePartnerProfiles.find((profile) => profile.type === "business_membership");
if (!membership) throw new Error("business_membership profile missing");

test("Broad business membership organisations stay high priority", () => {
  const candidate = partnerCandidateFromBrreg({
    organisasjonsnummer: "999111222",
    navn: "NORSK ARBEIDSGIVER- OG NÆRINGSFORENING",
    hjemmeside: "https://example.no",
    antallAnsatte: 80,
    registrertIForetaksregisteret: true,
    sisteInnsendteAarsregnskap: "2025",
    naeringskode1: { kode: "94.110", beskrivelse: "Næringslivs- og arbeidsgiverorganisasjoner" },
    forretningsadresse: { landkode: "NO", poststed: "OSLO" },
  }, membership);

  assert.ok(candidate);
  assert.equal(candidate?.fit_tier, "A");
  assert.ok((candidate?.fit_reasons || []).some((reason) => reason.includes("Bred arbeidsgiver-/nærings-/profesjonsrelevans")));
});

test("Narrow sector membership organisations are not automatically A-fit", () => {
  const candidate = partnerCandidateFromBrreg({
    organisasjonsnummer: "999111223",
    navn: "NORSK SVINEAVL FORENING",
    hjemmeside: "https://example.no",
    antallAnsatte: 80,
    registrertIForetaksregisteret: true,
    sisteInnsendteAarsregnskap: "2025",
    naeringskode1: { kode: "94.110", beskrivelse: "Næringslivs- og arbeidsgiverorganisasjoner" },
    forretningsadresse: { landkode: "NO", poststed: "HAMAR" },
  }, membership);

  assert.ok(candidate);
  assert.notEqual(candidate?.fit_tier, "A");
  assert.ok((candidate?.evidence_gaps || []).includes("Smal bransjeorganisasjon – lavere henvisningsprioritet"));
});
