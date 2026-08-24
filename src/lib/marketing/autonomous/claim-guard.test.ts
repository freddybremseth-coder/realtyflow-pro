import assert from "node:assert/strict";
import test from "node:test";
import {
  contentQualityGate,
  findOutcomeClaims,
  findOwnershipClaims,
  brandSupportsOwnership,
  unsupportedOutcomeClaims,
  parseBrandContext,
} from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

// Captionen som eksponerte det første gapet: kvalitativ/komparativ utfallspåstand uten tall.
const ENERGY_CLAIM =
  "Disse boligene bidrar til lavere energikostnader og gir deg norsk oppfølging. Book gratis boligsamtale.";
const CLEAN_QUALITATIVE =
  "Drømmer du om et hjem i solen? Energieffektive boliger på Costa Blanca med norsk oppfølging hele veien. Book gratis boligsamtale.";
const CANARY_ABSOLUTE_TREND =
  "Forestill deg sol året rundt. Flere nordmenn ser i dag mot Costa Blanca. Ingen skjulte overraskelser, ingen språkbarrierer.";

function assetWith(body: string, extra: Partial<GeneratedAsset> = {}): GeneratedAsset {
  return {
    contentId: "c1",
    creativeVariantId: "c1_v1",
    campaignId: "camp1",
    channel: "instagram",
    genome: { brandId: "b1", channel: "instagram", format: "post", hookType: "price_first", ctaType: "book_viewing", goal: "leads" } as GeneratedAsset["genome"],
    headline: undefined,
    body,
    cta: "Book gratis boligsamtale",
    factSources: [],
    generator: { model: "sonnet", costEur: 0 },
    ...extra,
  } as GeneratedAsset;
}

// ── Rene detektorer ──────────────────────────────────────────────────────
test("findOutcomeClaims: fanger «lavere energikostnader» (kvalitativ, ingen tall)", () => {
  assert.deepEqual(findOutcomeClaims(ENERGY_CLAIM), ["lavere energikostnader"]);
  // Trygg posisjonering er IKKE en utfallspåstand.
  assert.deepEqual(findOutcomeClaims("Energieffektive boliger med norsk oppfølging."), []);
});

test("findOutcomeClaims: fanger trend- og absolutte canary-påstander", () => {
  assert.deepEqual(findOutcomeClaims(CANARY_ABSOLUTE_TREND), [
    "more Norwegians looking to Costa Blanca",
    "sun year-round",
    "no hidden surprises",
    "no language barriers",
  ]);
});

test("unsupportedOutcomeClaims: factSources=[] → udekket; matchende kilde → dekket", () => {
  assert.deepEqual(unsupportedOutcomeClaims(ENERGY_CLAIM, []), ["lavere energikostnader"]);
  const sourced = unsupportedOutcomeClaims(ENERGY_CLAIM, [
    { claim: "lavere energikostnader dokumentert i energisertifikat (A)", source: "energisertifikat" },
  ]);
  assert.deepEqual(sourced, []);
});

test("unsupportedOutcomeClaims: trendpåstand krever uavhengig trendkilde", () => {
  const caption = "Flere nordmenn ser i dag mot Costa Blanca.";
  assert.deepEqual(unsupportedOutcomeClaims(caption, []), ["more Norwegians looking to Costa Blanca"]);
  assert.deepEqual(
    unsupportedOutcomeClaims(caption, [
      { claim: "Flere nordmenn ser mot Costa Blanca ifølge dokumentert markedsanalyse", source: "market-report" },
    ]),
    [],
  );
});

test("findOwnershipClaims: «våre boliger» treffer, formidler-formulering treffer ikke", () => {
  assert.deepEqual(findOwnershipClaims("Utforsk våre boliger på Costa Blanca."), ["våre boliger"]);
  assert.deepEqual(findOwnershipClaims("Utforsk boligene vi hjelper deg å finne på Costa Blanca."), []);
  assert.deepEqual(findOwnershipClaims("Se boligene vi formidler."), []);
});

test("brandSupportsOwnership: default (rådgiver) = false; ownsInventory=true = true", () => {
  const advisor = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes" });
  assert.equal(brandSupportsOwnership(advisor), false);
  const developer = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes", ownsInventory: true });
  assert.equal(brandSupportsOwnership(developer), true);
});

// ── Quality-gate: utfall/trend/absoluttpåstander ──────────────────────────
test("gate: generert «lavere energikostnader» uten kilde → claimsVerified=false, score<100, CLAIM_NOT_VERIFIED", () => {
  const r = contentQualityGate(assetWith(ENERGY_CLAIM));
  assert.equal(r.checks.claimsVerified, false);
  assert.deepEqual(r.unsupportedOutcomeClaims, ["lavere energikostnader"]);
  assert.ok(r.score < 100, `score var ${r.score}`);
  assert.ok(r.reasons.some((x) => x.startsWith("CLAIM_NOT_VERIFIED")));
});

test("gate: samme påstand MED uavhengig factSource → claimsVerified=true (tillatt)", () => {
  const r = contentQualityGate(
    assetWith(ENERGY_CLAIM, {
      factSources: [{ claim: "lavere energikostnader dokumentert i energisertifikat (A)", source: "energisertifikat" }],
    }),
  );
  assert.equal(r.checks.claimsVerified, true);
  assert.deepEqual(r.unsupportedOutcomeClaims, []);
  assert.ok(!r.reasons.some((x) => x.startsWith("CLAIM_NOT_VERIFIED")));
});

test("gate: AI-canary med sol/trend/ingen-overraskelser/språkbarrierer → blokkbar og score<100", () => {
  const r = contentQualityGate(assetWith(CANARY_ABSOLUTE_TREND));
  assert.equal(r.checks.claimsVerified, false);
  assert.deepEqual(r.unsupportedOutcomeClaims, [
    "more Norwegians looking to Costa Blanca",
    "sun year-round",
    "no hidden surprises",
    "no language barriers",
  ]);
  assert.ok(r.score < 100, `score var ${r.score}`);
  assert.ok(r.reasons.some((x) => x.startsWith("CLAIM_NOT_VERIFIED")));
});

test("gate: «energieffektive boliger» (trygg posisjonering) → claimsVerified=true", () => {
  const r = contentQualityGate(assetWith(CLEAN_QUALITATIVE));
  assert.equal(r.checks.claimsVerified, true);
  assert.equal(r.checks.roleConsistent, true);
});

test("gate: trygg klimaspråk uten absolutt løfte passerer claim-gaten", () => {
  const r = contentQualityGate(assetWith("Drømmer du om et hjem i solen på Costa Blanca? Vi hjelper deg gjennom kjøpsprosessen. Book gratis boligsamtale."));
  assert.equal(r.checks.claimsVerified, true);
});

test("gate: «lavere energikostnader» støttet KUN av Brand Brain → fortsatt blokkert", () => {
  // Brand Brain-positionering teller ALDRI som uavhengig kilde for utfallspåstander.
  const brand = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes", allowedClaims: ["lavere energikostnader"] });
  const r = contentQualityGate(assetWith(ENERGY_CLAIM), { brand });
  assert.equal(r.checks.claimsVerified, false);
  assert.deepEqual(r.unsupportedOutcomeClaims, ["lavere energikostnader"]);
});

// ── Quality-gate: eierskap/rolle ─────────────────────────────────────────
test("gate: «våre boliger» med rådgiver-brand → roleConsistent=false, score<100, BRAND_ROLE_MISMATCH", () => {
  const brand = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes" });
  const r = contentQualityGate(assetWith("Utforsk våre boliger på Costa Blanca. Book gratis boligsamtale."), { brand });
  assert.equal(r.checks.roleConsistent, false);
  assert.deepEqual(r.roleViolations, ["våre boliger"]);
  assert.ok(r.score < 100, `score var ${r.score}`);
  assert.ok(r.reasons.some((x) => x.startsWith("BRAND_ROLE_MISMATCH")));
});

test("gate: «boligene vi hjelper deg å finne» → roleConsistent=true (tillatt)", () => {
  const brand = parseBrandContext({ brandId: "b1", brandName: "Zen Eco Homes" });
  const r = contentQualityGate(assetWith("Se boligene vi hjelper deg å finne. Book gratis boligsamtale."), { brand });
  assert.equal(r.checks.roleConsistent, true);
  assert.deepEqual(r.roleViolations, []);
});

test("gate: «våre boliger» tillatt når Brand Brain eksplisitt eier (ownsInventory=true)", () => {
  const developer = parseBrandContext({ brandId: "b1", brandName: "Utbygger AS", ownsInventory: true });
  const r = contentQualityGate(assetWith("Utforsk våre boliger. Book gratis boligsamtale."), { brand: developer });
  assert.equal(r.checks.roleConsistent, true);
});

// ── Legacy / menneske-forfattet self-sources ─────────────────────────────
test("gate: utfallspåstand i IKKE-generert (legacy) innhold → ikke flagget (self-source)", () => {
  const r = contentQualityGate(assetWith(ENERGY_CLAIM), { generated: false });
  assert.equal(r.checks.claimsVerified, true);
  assert.deepEqual(r.unsupportedOutcomeClaims, []);
});

// ── Point 4: uverifisert sensitiv faktapåstand kan aldri gi 100 ──────────
test("gate: uverifisert sensitiv faktapåstand (pris) → score<100", () => {
  const r = contentQualityGate(assetWith("Villa til pris 500000. Book gratis boligsamtale."));
  assert.ok(r.sensitiveClaimsWithoutSource.includes("pris"));
  assert.ok(r.score < 100, `score var ${r.score}`);
});
