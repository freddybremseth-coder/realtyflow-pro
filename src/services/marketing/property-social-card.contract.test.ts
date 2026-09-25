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
