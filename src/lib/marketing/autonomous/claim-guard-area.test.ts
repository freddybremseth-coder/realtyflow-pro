import assert from "node:assert/strict";
import test from "node:test";
import { findOutcomeClaims, unsupportedOutcomeClaims } from "@/lib/marketing/autonomous";

test("area prestige claims require explicit factSource", () => {
  const caption = "Dette ligger i et av Costa Blanca Norths ettertraktede boligområder.";
  assert.deepEqual(findOutcomeClaims(caption), ["sought-after area"]);
  assert.deepEqual(unsupportedOutcomeClaims(caption, []), ["sought-after area"]);
  assert.deepEqual(
    unsupportedOutcomeClaims(caption, [
      { claim: "Dokumentert ettertraktet boligområde", source: "market-report" },
    ]),
    [],
  );
});

test("popular / attractive / prestigious area variants are detected", () => {
  for (const caption of [
    "Et av de mest populære boligområdene på Costa Blanca.",
    "Et av de mest attraktive boligområdene på kysten.",
    "Et prestisjefylt boligområde nær sjøen.",
  ]) {
    assert.ok(findOutcomeClaims(caption).length > 0, caption);
  }
});
