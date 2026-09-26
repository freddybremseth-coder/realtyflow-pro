import test from "node:test";
import assert from "node:assert/strict";
import { addGrowthAttributionToCreative, makeDeterministicInventoryCreative } from "./campaign-production";

const brief = {
  contentId: "test_content",
  campaignId: "test_campaign",
  channel: "facebook",
  genome: {
    brandId: "zeneco",
    channel: "facebook",
    format: "post",
    hookType: "price_first",
    ctaType: "book_viewing",
    goal: "lead_generation",
  },
};

test("deterministic Inventory fallback keeps verified ZenEco property CTA", () => {
  const creative = makeDeterministicInventoryCreative(brief, {
    id: "1f923d8a-6c53-4890-89d8-fa6e823277f6",
    ref: "N5667",
    title: "Villa med 4 soverom i Costa Blanca nord",
    propertyType: "Villa",
    primaryImage: "https://example.com/property.jpg",
    factSources: [
      { claim: "Tittel: Villa med 4 soverom i Costa Blanca nord", source: "Inventory" },
      { claim: "Sted: Calpe", source: "Inventory" },
      { claim: "Pris: €1550000", source: "Inventory" },
      { claim: "Soverom: 4", source: "Inventory" },
      { claim: "Bad: 5", source: "Inventory" },
      { claim: "Boligtype: Villa", source: "Inventory" },
    ],
  } as any);

  assert.equal(
    creative.asset.cta,
    "Se boligen: https://www.zenecohomes.com/eiendommer/N5667\nKontakt oss om boligen: https://www.zenecohomes.com/eiendommer/N5667#kontakt",
  );
  assert.equal(creative.provenance.generatedBy, "deterministic-inventory-fallback");
});

test("deterministic Inventory fallback does not invent a CTA without a property ref", () => {
  const creative = makeDeterministicInventoryCreative(brief, {
    id: "property-without-ref",
    ref: null,
    title: "Inventory property",
    propertyType: "Villa",
    primaryImage: "https://example.com/property.jpg",
    factSources: [{ claim: "Boligtype: Villa", source: "Inventory" }],
  } as any);

  assert.equal(creative.asset.cta, undefined);
});

test("Pinoso fallback links to Pinoso, preserves verified plot pricing, never links to ZenEco", () => {
  const creative = makeDeterministicInventoryCreative({
    ...brief, genome: { ...brief.genome, brandId: "pinosoecolife" },
  }, {
    id: "pinoso-property",
    ref: "N9950",
    title: "Moderne villa med stor tomt",
    propertyType: "Villa",
    primaryImage: "https://example.com/pinoso.jpg",
    factSources: [
      { claim: "Tittel: Moderne villa med stor tomt", source: "Inventory" },
      { claim: "Tomt: 12555 m²", source: "Inventory" },
      { claim: "Tomt inkludert i oppgitt pris: nei", source: "Inventory" },
      { claim: "Separat tomtepris: €53000", source: "Inventory" },
    ],
  } as any);
  assert.match(creative.asset.cta ?? "", /^Se boligen: https:\/\/www\.pinosoecolife\.com\/eiendommer\/N9950/);
  assert.doesNotMatch(creative.asset.cta ?? "", /zenecohomes/i);
  assert.match(creative.asset.body, /Tomt inkludert i oppgitt pris: nei/);
  assert.match(creative.asset.body, /Separat tomtepris: €53000/);
});

test("unrecognized brand fails closed rather than redirecting to a different property site", () => {
  const creative = makeDeterministicInventoryCreative({
    ...brief, genome: { ...brief.genome, brandId: "anotherbrand" },
  }, {
    id: "other-property", ref: "X1", title: "Bolig", propertyType: "Villa",
    primaryImage: "https://example.com/p.jpg",
    factSources: [{ claim: "Tittel: Bolig", source: "Inventory" }],
  } as any);
  assert.equal(creative.asset.cta, undefined);
});


test("owned website CTAs receive deterministic growth attribution", () => {
  const creative = addGrowthAttributionToCreative({
    asset: {
      contentId: "content-123",
      creativeVariantId: "variant-1",
      campaignId: "campaign-123",
      channel: "facebook",
      genome: brief.genome,
      cta: "Se boligen: https://www.zenecohomes.com/eiendommer/N5667#kontakt",
      body: "Kort tekst",
      generator: {},
      factSources: [],
    },
    provenance: {
      generatedBy: "test",
      model: "test",
      promptVersion: "test",
      learningRulesUsed: [],
      factSources: [],
      propertyIds: [],
      createdAt: "2026-09-26T00:00:00.000Z",
      approvedBy: null,
      approvedAt: null,
    },
  } as any);
  const url = (creative.asset.cta || "").match(/https:\/\/\S+/)?.[0] || "";
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("utm_source"), "facebook");
  assert.equal(parsed.searchParams.get("utm_campaign"), "campaign-123");
  assert.equal(parsed.searchParams.get("utm_content"), "content-123");
  assert.equal(parsed.hash, "#kontakt");
});

test("external CTAs are not rewritten", () => {
  const original = "Listen: https://www.youtube.com/watch?v=abc123";
  const creative = addGrowthAttributionToCreative({
    asset: {
      contentId: "song-1",
      creativeVariantId: "variant-1",
      campaignId: "campaign-1",
      channel: "instagram",
      genome: { ...brief.genome, channel: "instagram" },
      cta: original,
      body: "Music",
      generator: {},
      factSources: [],
    },
    provenance: {
      generatedBy: "test",
      model: "test",
      promptVersion: "test",
      learningRulesUsed: [],
      factSources: [],
      propertyIds: [],
      createdAt: "2026-09-26T00:00:00.000Z",
      approvedBy: null,
      approvedAt: null,
    },
  } as any);
  assert.equal(creative.asset.cta, original);
});
