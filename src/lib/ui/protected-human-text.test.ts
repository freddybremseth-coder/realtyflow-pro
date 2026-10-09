import assert from "node:assert/strict";
import test from "node:test";
import { protectHumanText } from "./protected-human-text";

const nbsp = "\u00A0";

test("protectHumanText keeps likely multi-word proper names together for display", () => {
  assert.equal(protectHumanText("Costa Blanca Nord er fint"), `Costa${nbsp}Blanca${nbsp}Nord er fint`);
  assert.equal(protectHumanText("Zen Eco Homes hjelper deg"), `Zen${nbsp}Eco${nbsp}Homes hjelper deg`);
  assert.equal(protectHumanText("Doña Anna produserer olje"), `Doña${nbsp}Anna produserer olje`);
  assert.equal(protectHumanText("Content Hub og SoMe Studio"), `Content${nbsp}Hub og SoMe${nbsp}Studio`);
  assert.equal(protectHumanText("Freddy Bremseth bor i Spania"), `Freddy${nbsp}Bremseth bor i Spania`);
});

test("protectHumanText leaves normal sentence spacing alone", () => {
  assert.equal(
    protectHumanText("Alicante er mer enn bare en vakker by"),
    "Alicante er mer enn bare en vakker by",
  );
  assert.equal(
    protectHumanText("Tre ideer, ikke tre omskrivninger"),
    "Tre ideer, ikke tre omskrivninger",
  );
});

test("protectHumanText is display-only and never mutates the input value", () => {
  const source = "Zen Eco Homes · Costa Blanca Nord";
  const display = protectHumanText(source);
  assert.equal(source, "Zen Eco Homes · Costa Blanca Nord");
  assert.notEqual(display, source);
});
