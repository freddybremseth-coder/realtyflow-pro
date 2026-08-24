import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptGenomeToChannel,
  channelFormatFitness,
  contentQualityGate,
  findProductionDirection,
  routeContentFormat,
} from "@/lib/marketing/autonomous";
import type { GeneratedAsset } from "@/lib/marketing/autonomous";

// Det faktiske reel-manuset som havnet som «FINAL INSTAGRAM CAPTION».
const REEL_SCRIPT = [
  "HOOK (0–2 sek): Drømmer du om et hjem i solen?",
  "SCENE 1: Bilde: Panoramautsikt over Middelhavet.",
  "Tekst-overlay: Energieffektive nybygg på Costa Blanca.",
  "CTA-SCENE: Book gratis boligsamtale.",
].join("\n");

const CLEAN_CAPTION =
  "Drømmer du om et hjem i solen? Våre energieffektive nybygg på Costa Blanca gir deg norsk oppfølging hele veien. Book gratis boligsamtale.";

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

// 1) Statisk bilde → format="post", ALDRI reel bare fordi kanal=instagram.
test("routeContentFormat: statisk bilde → post; video → reel; carousel → carousel", () => {
  assert.equal(routeContentFormat("https://cdn.example.com/hjem.jpg"), "post");
  assert.equal(routeContentFormat({ imageUrl: "https://cdn.example.com/hjem.jpg" }), "post");
  assert.equal(routeContentFormat("https://cdn.example.com/tour.mp4"), "reel");
  assert.equal(routeContentFormat({ videoUrl: "https://cdn.example.com/tour.mp4" }), "reel");
  assert.equal(routeContentFormat({ imageUrls: ["a.jpg", "b.jpg"] }), "carousel");
  assert.equal(routeContentFormat(undefined), undefined);
  // adaptGenomeToChannel skal ikke tvinge reel for instagram når media er bilde.
  const g = adaptGenomeToChannel({ brandId: "b1" } as any, "instagram", routeContentFormat("https://x/hjem.jpg"));
  assert.equal(g.format, "post");
});

// 2) Instagram-post med produksjonsanvisninger blokkeres FØR approval.
test("channelFormatFitness: caption med HOOK/SCENE/Tekst-overlay → CHANNEL_FORMAT_MISMATCH", () => {
  const fit = channelFormatFitness(REEL_SCRIPT);
  assert.equal(fit.ok, false);
  assert.ok(fit.reason.startsWith("CHANNEL_FORMAT_MISMATCH"));
  assert.deepEqual(new Set(findProductionDirection(REEL_SCRIPT)).has("HOOK"), true);
});

// 3) Ren caption passerer fitness-porten.
test("channelFormatFitness: ren kundevendt caption → ok", () => {
  const fit = channelFormatFitness(CLEAN_CAPTION);
  assert.equal(fit.ok, true);
  assert.deepEqual(findProductionDirection(CLEAN_CAPTION), []);
});

// 4) quality_score kan ALDRI bli 100 når captionen bryter kanalformatet.
test("contentQualityGate: reel-manus i caption → formatClean=false og score < 100", () => {
  const dirty = contentQualityGate(assetWith(REEL_SCRIPT));
  assert.equal(dirty.checks.formatClean, false);
  assert.ok(dirty.score < 100, `score var ${dirty.score}`);
  assert.ok(dirty.reasons.some((r) => r.startsWith("CHANNEL_FORMAT_MISMATCH")));
});

// 5) Ren caption kan nå full formatpoeng (formatClean=true).
test("contentQualityGate: ren caption → formatClean=true", () => {
  const clean = contentQualityGate(assetWith(CLEAN_CAPTION));
  assert.equal(clean.checks.formatClean, true);
  assert.ok(!clean.reasons.some((r) => r.startsWith("CHANNEL_FORMAT_MISMATCH")));
});

// 6) Store bokstaver (HOOK/SCENE) må fanges selv om annen logikk lowercaser.
test("findProductionDirection: fanger uppercase-markører og norske manus-etiketter", () => {
  assert.ok(findProductionDirection("HOOK: se her").includes("HOOK"));
  assert.ok(findProductionDirection("Bilde: villa").includes("Bilde:"));
  assert.ok(findProductionDirection("Voiceover: rolig stemme").includes("Voiceover:"));
  assert.ok(findProductionDirection("Klipp: 3 sek").includes("Klipp:"));
  // Vanlige ord skal IKKE gi falske treff.
  assert.deepEqual(findProductionDirection("Book en visning i solen på kysten."), []);
});
