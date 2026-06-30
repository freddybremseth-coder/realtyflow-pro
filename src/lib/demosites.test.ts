import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_SITE_TEMPLATE_SEEDS, analyzeDemoSiteProfile, getDemoSiteTemplateDefaults } from "./demosites";

const REQUIRED_TEMPLATE_SLUGS = [
  "elektro",
  "dekk",
  "frakt",
  "renhold",
  "local-service",
  "restaurant",
  "restaurant-cafe",
  "frisor",
  "frisør",
  "tannlege",
  "bilverksted",
  "rorlegger",
  "rørlegger",
  "snekker",
  "eiendomsmegler",
  "real-estate-agent",
  "advokat",
  "fysioterapi",
  "klinikk",
  "skjønnhet",
  "hotell",
  "overnatting",
  "kafe",
  "kafé",
  "bygg",
  "bygg-anlegg",
];

const FORBIDDEN_ELECTRO_WORDS = ["elektriker", "strøm", "el-sjekk", "installasjon"];

function assertCompleteDefaults(slug: string) {
  const defaults = getDemoSiteTemplateDefaults(slug, "Testbedriften");

  assert.ok(defaults.template_slug);
  assert.ok(defaults.template_name);
  assert.ok(defaults.hero_title);
  assert.ok(defaults.hero_subtitle);
  assert.ok(defaults.intro_text);
  assert.ok(defaults.call_to_action);
  assert.ok(defaults.contact_text);
  assert.match(defaults.brand_color, /^#[0-9a-f]{6}$/i);
  assert.match(defaults.secondary_color, /^#[0-9a-f]{6}$/i);
  assert.match(defaults.accent_color, /^#[0-9a-f]{6}$/i);
  assert.ok(defaults.services.length > 0);
  assert.ok(defaults.products.length > 0);
  assert.ok(defaults.prices.length > 0);
  assert.ok(defaults.trust_points.length > 0);
  assert.ok(defaults.faq.length > 0);
}

test("DemoSites selectable and alias template slugs have complete defaults", () => {
  for (const template of DEMO_SITE_TEMPLATE_SEEDS) {
    assertCompleteDefaults(template.slug);
  }

  for (const slug of REQUIRED_TEMPLATE_SLUGS) {
    assertCompleteDefaults(slug);
  }
});

test("restaurant defaults do not fall back to elektro wording", () => {
  const restaurant = getDemoSiteTemplateDefaults("restaurant", "Cafe Test");
  const restaurantText = JSON.stringify(restaurant).toLowerCase();

  assert.equal(restaurant.template_slug, "restaurant");
  assert.match(restaurantText, /restaurant|meny|bord|server/);
  for (const word of FORBIDDEN_ELECTRO_WORDS) {
    assert.equal(restaurantText.includes(word), false);
  }
});

test("unknown DemoSites template slug falls back to generic local-service defaults", () => {
  const fallback = getDemoSiteTemplateDefaults("unknown-category", "Lokal Test");
  const fallbackText = JSON.stringify(fallback).toLowerCase();

  assert.equal(fallback.template_slug, "local-service");
  assert.match(fallbackText, /lokale kunder|tilbud|chatgenius/);
  for (const word of FORBIDDEN_ELECTRO_WORDS) {
    assert.equal(fallbackText.includes(word), false);
  }
});

test("DemoSites profile analysis recommends restaurant or local-service without elektro fallback", () => {
  const restaurant = analyzeDemoSiteProfile({
    companyName: "Fjord Bistro",
    websiteUrl: "https://fjordbistro.example",
    industry: "Restaurant med meny, lunsj, middag og bordbestilling",
    notes: "Selskaper og catering",
  });
  const unknown = analyzeDemoSiteProfile({
    companyName: "Nordvik Partner AS",
    websiteUrl: "https://nordvik.example",
    industry: "Lokal rådgivning og praktisk koordinering",
    notes: "Kundeoppfølging og service",
  });

  assert.equal(restaurant.templateSlug, "restaurant");
  assert.equal(unknown.templateSlug, "local-service");
});

test("DemoSites profile analysis recognizes tire and workshop wording", () => {
  const pointSLike = analyzeDemoSiteProfile({
    companyName: "Point S",
    websiteUrl: "https://www.point-s.no",
    industry: "Dekk, felg, hjulhotell, dekkskift og bilverksted",
    notes: "Dekkhotell, dekkskift, EU-kontroll og verkstedtjenester for bilen din.",
  });

  assert.ok(["dekk", "bilverksted"].includes(pointSLike.templateSlug));
});
