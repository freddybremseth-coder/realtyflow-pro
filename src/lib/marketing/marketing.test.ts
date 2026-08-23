import assert from "node:assert/strict";
import test from "node:test";
import { genomeSignature, parseGenome } from "@/lib/marketing/genome";
import { businessValueScore, evidenceLevel, qualifiedLeadRate } from "@/lib/marketing/value-score";
import { normalizeMarketingEvent, revenueEventForMarketing } from "@/lib/marketing/events";

/* ---- Content Genome (Phase 2) ---- */
test("genome: parser + normaliserer fritekst til slug", () => {
  const r = parseGenome({ brandId: "zenecohomes", channel: "instagram", format: "reel", hookType: "price_first", area: "Finestrat", language: "NO", audience: "Norwegian buyers 45-65" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.genome.area, "finestrat");
    assert.equal(r.genome.language, "no");
    assert.equal(r.genome.audience, "norwegian_buyers_45-65");
  }
});

test("genome: ugyldig kanal avvises", () => {
  const r = parseGenome({ brandId: "x", channel: "myspace", format: "reel" });
  assert.equal(r.ok, false);
});

test("genome: signatur grupperer læringsdimensjoner", () => {
  const r = parseGenome({ brandId: "x", channel: "instagram", format: "reel", hookType: "price_first", propertyType: "villa", language: "no", area: "finestrat" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(genomeSignature(r.genome), "instagram|reel|price_first|villa|no|finestrat");
});

/* ---- Business Value Score ---- */
test("value: post med salg slår viral post uten leads", () => {
  const viral = businessValueScore({ views: 100_000, leads: 0 });
  const seller = businessValueScore({ views: 8_000, leads: 19, qualifiedLeads: 7, viewings: 4, sales: 1, commissionEur: 14500 });
  assert.ok(seller > viral, `seller=${seller} viral=${viral}`);
});

test("value: qualifiedLeadRate per 1000 visninger", () => {
  assert.equal(qualifiedLeadRate({ views: 10_000, qualifiedLeads: 5 }), 0.5);
  assert.equal(qualifiedLeadRate({ views: 0, qualifiedLeads: 5 }), 0);
});

test("value: evidence-nivå fra utvalgsstørrelse", () => {
  assert.equal(evidenceLevel(3), "insufficient");
  assert.equal(evidenceLevel(12), "promising");
  assert.equal(evidenceLevel(80), "strong");
});

/* ---- Marketing Event Backbone (Phase 1) ---- */
test("event: normaliserer + beregner business value + kanal fra genome", () => {
  const p = normalizeMarketingEvent({
    eventType: "content_published", brandId: "zenecohomes",
    genome: { brandId: "zenecohomes", channel: "youtube", format: "video" },
    metrics: { views: 5000, leads: 3, qualifiedLeads: 2 },
  });
  assert.equal(p.event_type, "content_published");
  assert.equal(p.channel, "youtube");
  assert.ok(p.business_value > 0);
});

test("event: ukjent type kaster", () => {
  assert.throws(() => normalizeMarketingEvent({ eventType: "bogus" as any, brandId: "x" }));
});

test("bridge: lead_attributed → revenue_events lead_created; publisert → null", () => {
  const bridged = revenueEventForMarketing({ eventType: "lead_attributed", brandId: "zenecohomes", revenueImpactEur: 14000, channel: "instagram", contentId: "ig_483" });
  assert.ok(bridged);
  assert.equal(bridged!.eventType, "lead_created");
  assert.equal(bridged!.actorType, "external");
  assert.equal((bridged!.metadata as any).marketing_source, true);

  const none = revenueEventForMarketing({ eventType: "content_published", brandId: "x" });
  assert.equal(none, null);
});
