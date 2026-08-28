import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectStoreListing } from "./direct-store";

test("direct-store listing preserves project canon and retailer metadata", () => {
  const listing = buildDirectStoreListing({
    id: "11111111-1111-4111-8111-111111111111",
    brand_id: "freddypublishing",
    title: "The Cables Beneath the World",
    subtitle: "Infrastructure, Power and Risk",
    language: "en",
    genre: "geopolitics",
    series_name: "The Chokepoints of Power",
    metadata_plan: {
      description_html: "<p>A documented account of undersea infrastructure.</p>",
      keywords: ["submarine cables", "infrastructure"],
      categories: ["Political Science / Geopolitics"],
      direct_store: { price_eur: 6.49 },
      image_plan: { cover: { image_url: "https://example.test/cover.jpg" } },
    },
  });

  assert.equal(listing.title, "The Cables Beneath the World");
  assert.equal(listing.series_name, "The Chokepoints of Power");
  assert.equal(listing.description, "A documented account of undersea infrastructure.");
  assert.equal(listing.price, 6.49);
  assert.equal(listing.currency, "EUR");
  assert.equal(listing.format, "epub");
  assert.deepEqual(listing.keywords, ["submarine cables", "infrastructure"]);
});

test("direct-store listing uses a guarded default price", () => {
  const listing = buildDirectStoreListing({ id: "p1", title: "Book", language: "no", metadata_plan: {} });
  assert.equal(listing.price, 5);
  assert.equal(listing.marketplace, "books.freddybremseth.com");
});
