import test from "node:test";
import assert from "node:assert/strict";
import { verifyZenEcoPublishedMetadataHtml } from "./seo-zeneco-publisher";

const path = "/bolig-i-spania";
const title = "Bolig i Spania | Finn riktig område med norsk rådgiver";
const description = "Vurderer du bolig i Spania? Utforsk områder på Costa Blanca og få hjelp til å sammenligne nybygg, villaer og leiligheter, finansiering og kjøpsprosess.";
const canonical = "https://www.zenecohomes.com" + path;
function html(t = title, d = description, url = canonical) {
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"/><title>${t}</title><meta name="description" content="${d}"/><link rel="canonical" href="${url}"/><meta property="og:description" content="${d}"/></head><body>Contents</body></html>`;
}

test("Only correct public title, meta description and canonical pass SEO publication verification", () => {
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(), path, title, description), true);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(title + " | Zen Eco Homes"), path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html("Old title"), path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(title, "Old description"), path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml(html(title, description, "https://www.zenecohomes.com/other"),
    path, title, description), false);
});

test("Mention in page body or OpenGraph metadata cannot simulate a published SEO head", () => {
  const fake = `<head><title>Old title</title><meta name="description" content="Old"/><meta property="og:title" content="${title}"/><meta property="og:description" content="${description}"/><link rel="canonical" href="${canonical}"/></head><body>${title}${description}</body>`;
  assert.equal(verifyZenEcoPublishedMetadataHtml(fake, path, title, description), false);
  assert.equal(verifyZenEcoPublishedMetadataHtml("<title>" + title + "</title>", path, title, description), false);
});
