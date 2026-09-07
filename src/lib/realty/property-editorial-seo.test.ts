import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPropertyEditorialSeo, type PropertyEditorialNo } from "./property-editorial-no";
import { buildPropertyEditorialFallback } from "./property-editorial-no";

type Source = Parameters<typeof buildPropertyEditorialSeo>[0];

function source(overrides: Partial<Source> = {}): Source {
  return {
    type: "Villa",
    beds: 3,
    baths: 2,
    area: "Polop",
    m2: null,
    floor: "Ikke angitt",
    features: [],
    epc: "Ikke angitt",
    price: null,
    rawDescription: "",
    facing: "",
    usage: "",
    ...overrides,
  } as Source;
}

test("SEO title is factual, no branding, no ALL CAPS", () => {
  const seo = buildPropertyEditorialSeo(source());
  assert.equal(seo.meta_title_no, "Villa med 3 soverom i Polop");
  assert.ok(!/zen eco homes/i.test(seo.meta_title_no), "no branding in title");
  assert.ok(!/[A-ZÆØÅ]{4,}/.test(seo.meta_title_no), "no ALL CAPS run");
  assert.ok(seo.meta_title_no.length <= 60);
});

test("ALL CAPS feed type is normalised to sentence case", () => {
  const seo = buildPropertyEditorialSeo(source({ type: "VILLA" }));
  assert.equal(seo.meta_title_no, "Villa med 3 soverom i Polop");
});

test("missing facts are omitted, never invented", () => {
  assert.equal(buildPropertyEditorialSeo(source({ area: "Ikke angitt" })).meta_title_no, "Villa med 3 soverom");
  assert.equal(buildPropertyEditorialSeo(source({ beds: null })).meta_title_no, "Villa i Polop");
});

test("meta description is factual and within length bounds", () => {
  const seo = buildPropertyEditorialSeo(source());
  assert.ok(seo.meta_description_no.startsWith("Villa med 3 soverom i Polop."));
  assert.ok(/Se pris, kjøpskostnader, viktige sjekkpunkter og Zen Eco Homes' vurdering\./.test(seo.meta_description_no));
  assert.ok(seo.meta_description_no.length <= 160, "meta description <= 160 chars");
});

test("deterministic fallback includes SEO fields", () => {
  const editorial: PropertyEditorialNo = buildPropertyEditorialFallback({
    property_type: "Villa",
    bedrooms: 3,
    bathrooms: 2,
    location: "Polop",
  });
  assert.equal(typeof editorial.meta_title_no, "string");
  assert.ok(editorial.meta_title_no.length > 0);
  assert.equal(typeof editorial.meta_description_no, "string");
  assert.ok(editorial.meta_description_no.length > 0);
});
