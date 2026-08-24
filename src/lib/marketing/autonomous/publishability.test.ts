import assert from "node:assert/strict";
import test from "node:test";
import { contentPublishabilityGate } from "@/lib/marketing/autonomous";

// REGRESJON: den eksakte teksten som ble publisert på Instagram ved uhell.
test("REGRESJON: den faktiske Instagram-hendelsen blokkeres (NOT_PUBLISHABLE_META_TEXT)", () => {
  const incident = "Jeg setter opp Marketing Agent til å generere denne selgende SoMe-posten for Zen Eco Homes-eiendommen i Calpe.";
  const r = contentPublishabilityGate(incident);
  assert.equal(r.publishable, false);
  assert.equal(r.result, "NOT_PUBLISHABLE_META_TEXT");
});

test("intern instruksjon (jeg skal generere …) → INTERNAL_INSTRUCTION", () => {
  assert.equal(contentPublishabilityGate("Jeg skal generere en flott post om villaen.").result, "NOT_PUBLISHABLE_INTERNAL_INSTRUCTION");
});

test("«Here is your Instagram post:» → blokkeres", () => {
  const r = contentPublishabilityGate("Here is your Instagram post: Beautiful villa in Calpe.");
  assert.equal(r.publishable, false);
  assert.ok(r.result.startsWith("NOT_PUBLISHABLE"));
});

test("«As an AI …» → blokkeres", () => {
  assert.equal(contentPublishabilityGate("As an AI, I have prepared the following caption.").publishable, false);
});

test("tom tekst → NOT_PUBLISHABLE_EMPTY", () => {
  assert.equal(contentPublishabilityGate("   ").result, "NOT_PUBLISHABLE_EMPTY");
});

test("placeholder → NOT_PUBLISHABLE_PLACEHOLDER", () => {
  assert.equal(contentPublishabilityGate("TODO: skriv caption her").result, "NOT_PUBLISHABLE_PLACEHOLDER");
  assert.equal(contentPublishabilityGate("[caption]").result, "NOT_PUBLISHABLE_PLACEHOLDER");
});

test("normal eiendoms-caption → PUBLISHABLE", () => {
  const good = "Nyd livet i denne moderne villaen i Calpe med panoramautsikt over havet. Book en visning i dag.";
  const r = contentPublishabilityGate(good);
  assert.equal(r.publishable, true);
  assert.equal(r.result, "PUBLISHABLE");
});

test("REGRESJON: uverifisert lenke i bio/profil blokkeres deterministisk", () => {
  for (const s of [
    "Book en gratis boligsamtale med oss i dag – lenk finner du i profilen vår.",
    "Book i dag — lenke i bio.",
    "Klikk på lenken i profilen for mer informasjon.",
    "Link in bio for details.",
    "Click the link in our profile for more information.",
  ]) {
    const r = contentPublishabilityGate(s);
    assert.equal(r.publishable, false, `slapp gjennom: ${s}`);
    assert.equal(r.result, "NOT_PUBLISHABLE_UNVERIFIED_LINK_CLAIM");
  }
});

test("vanlig CTA uten bio-påstand forblir PUBLISHABLE", () => {
  for (const s of [
    "Book en gratis boligsamtale med oss i dag.",
    "Kontakt oss for mer informasjon om boligen.",
  ]) {
    assert.equal(contentPublishabilityGate(s).publishable, true, `blokkerte feilaktig: ${s}`);
  }
});

// ── FALSKE POSITIVE: korte markører må ikke treffe inne i vanlige ord ────────
test("legitime ord med 'llm' som delstreng forblir PUBLISHABLE", () => {
  for (const s of [
    "Nyd fullmånen over Middelhavet fra terrassen.",
    "Villmark og natur rett utenfor døren.",
    "Fullmåne i kveld — magisk stemning på kysten.",
  ]) {
    const r = contentPublishabilityGate(s);
    assert.equal(r.publishable, true, `blokkerte feilaktig: ${s} (${r.result} ${r.matched ?? ""})`);
  }
});

test("profesjonell matlaging og annen vanlig kundevendt copy → PUBLISHABLE", () => {
  for (const s of [
    "Profesjonell matlaging på det nye kjøkkenet.",
    "Et promptende salg venter ikke — men denne villaen er verdt å vente på.",
    "Awesome poster-vegg i stuen? Her er det plass til alt.",
  ]) {
    assert.equal(contentPublishabilityGate(s).publishable, true, `blokkerte feilaktig: ${s}`);
  }
});

// ── EKTE meta-fraser skal fortsatt blokkeres ────────────────────────────────
test("ekte agent-/LLM-fraser forblir blokkert", () => {
  for (const s of [
    "LLM workflow for content generation.",
    "Dette er en AI agent som lager innhold.",
    "Marketing Agent genererer denne posten.",
    "As an AI, here is your caption.",
  ]) {
    const r = contentPublishabilityGate(s);
    assert.equal(r.publishable, false, `slapp gjennom: ${s}`);
    assert.ok(r.result.startsWith("NOT_PUBLISHABLE"));
  }
});
