import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const renderer = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/property-social-card.ts"), "utf8");

test("property social cards preserve the original listing image as the visual source", () => {
  assert.match(renderer, /download\(input\.sourceImageUrl/);
  assert.match(renderer, /scale=\$\{WIDTH\}:\$\{HEIGHT\}/);
  assert.doesNotMatch(renderer, /image-generate|createMediaJob|Gemini|OpenAI/);
});

test("property social cards only derive visible property facts from factSources", () => {
  assert.match(renderer, /safeFact\(facts, "Pris:"\)/);
  assert.match(renderer, /safeFact\(facts, "Soverom:"\)/);
  assert.match(renderer, /safeFact\(facts, "Boligareal:"\)/);
  assert.match(renderer, /factSources: FactSource\[\]/);
});

test("property social cards are uploaded as reusable public campaign assets", () => {
  assert.match(renderer, /storage\.from\("content-images"\)/);
  assert.match(renderer, /property-social/);
  assert.match(renderer, /upsert: true/);
  assert.match(renderer, /getPublicUrl/);
});


test("premium property cards use distinct compositions instead of one shared overlay", () => {
  assert.match(renderer, /PROPERTY_SOCIAL_CARD_VERSION = "psc-2\.0"/);
  assert.match(renderer, /case "minimal_premium"/);
  assert.match(renderer, /case "fact_card"/);
  assert.match(renderer, /case "question_hook"/);
  assert.match(renderer, /case "lifestyle"/);
  assert.match(renderer, /case "advisor"/);
  assert.match(renderer, /case "carousel"/);
  assert.match(renderer, /case "hero_property"/);
  assert.match(renderer, /w=460:h=ih/);
  assert.match(renderer, /x=54:y=390:w=972:h=440/);
  assert.match(renderer, /PROPERTY_SOCIAL_CARD_VERSION\}\|\$\{input\.brandId\}/);
});
