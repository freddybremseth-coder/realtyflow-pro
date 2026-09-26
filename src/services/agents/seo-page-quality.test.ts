import test from "node:test";
import assert from "node:assert/strict";
import { inspectPageQuality } from "./seo-page-quality";

test("static signals accept decorative alt and do not inspect script or comment markup", () => {
  const result = inspectPageQuality(`<html lang='nb'><meta content='width=device-width, initial-scale=1' name='viewport'>
    <img src='decorative' alt=''><img src='real' alt='Bolig'><img src='missing'>
    <!-- <img src='comment'> --><script>const fake = '<img src="fake"><form>';</script>
    <script type='application/ld+json'>{"@type":"Organization"}</script>
    <script type='application/ld+json'>{oops}</script><a href='/kontakt'>Kontakt</a></html>`);
  assert.equal(result.language, "nb");
  assert.equal(result.mobileViewport, true);
  assert.equal(result.images, 3);
  assert.equal(result.imagesWithoutAlt, 1);
  assert.equal(result.structuredDataBlocks, 2);
  assert.equal(result.invalidStructuredDataBlocks, 1);
  assert.equal(result.contactLinkPresent, true);
  assert.equal(result.formPresent, false);
});

test("absence stays a static signal, never an invented schema, CTA or accessibility score", () => {
  const result = inspectPageQuality('<html><img data-alt="not-alt"><a href="/blog/contact-strategy">Story</a></html>');
  assert.equal(result.language, null);
  assert.equal(result.mobileViewport, false);
  assert.equal(result.imagesWithoutAlt, 1);
  assert.equal(result.contactLinkPresent, false);
  assert.equal(result.invalidStructuredDataBlocks, 0);
});
