import assert from "node:assert/strict";
import test from "node:test";
import {
  isSvgLogoSource,
  sanitizeSvgFontsForReactPdf,
  svgToReactPdfDataUri,
} from "./svg-logo";

test("detects SVG logo URLs even when they contain a cache-busting query", () => {
  assert.equal(
    isSvgLogoSource("https://example.com/assets/brand.svg?v=20261006"),
    true,
  );
  assert.equal(isSvgLogoSource("https://example.com/assets/brand.png"), false);
});

test("normalizes browser font fallback stacks for React-PDF", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg">
    <style>.tag { font-family: Arial, Helvetica, sans-serif; }</style>
    <text font-family="Georgia, 'Times New Roman', serif">Zen Eco Homes</text>
  </svg>`;

  const sanitized = sanitizeSvgFontsForReactPdf(source);

  assert.doesNotMatch(sanitized, /Georgia|Times New Roman|Arial, Helvetica/i);
  assert.match(sanitized, /font-family="Helvetica"/);
  assert.match(sanitized, /font-family: Helvetica/);
});

test("encodes the sanitized SVG as a React-PDF-compatible data URI", () => {
  const uri = svgToReactPdfDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Georgia, serif">Logo</text></svg>`,
  );
  assert.match(uri, /^data:image\/svg\+xml;base64,/);
  const decoded = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
  assert.match(decoded, /font-family="Helvetica"/);
  assert.doesNotMatch(decoded, /Georgia/);
});
