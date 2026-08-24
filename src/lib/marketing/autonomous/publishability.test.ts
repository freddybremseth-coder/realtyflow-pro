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
