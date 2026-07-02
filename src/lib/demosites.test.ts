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
  "ai-teknologi",
  "ai",
  "teknologi",
  "teknobedrift",
  "tech",
  "software",
  "saas",
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

test("DemoSites profile analysis recognizes AI and technology wording", () => {
  const aiTech = analyzeDemoSiteProfile({
    companyName: "Nordic AI Studio",
    websiteUrl: "https://ai.example",
    industry: "Kunstig intelligens, software, dataplattform og API-integrasjoner",
    notes: "AI-workshop, automatisering, chatbot, MVP og pilotprosjekt for teknologibedrifter.",
  });
  const defaults = getDemoSiteTemplateDefaults(aiTech.templateSlug, "Nordic AI Studio");

  assert.equal(aiTech.templateSlug, "ai-teknologi");
  assert.equal(aiTech.templateDetection.selected_template_slug, "ai-teknologi");
  assert.equal(aiTech.templateDetection.fallback_used, false);
  assert.ok(aiTech.templateDetection.matched_keywords.length > 0);
  assert.equal(defaults.template_slug, "ai-teknologi");
  assert.match(JSON.stringify(defaults).toLowerCase(), /ai|automatisering|pilot|integrasjon/);
});

test("DemoSites profile analysis does not confuse AI service wording with bygg", () => {
  const aiService = analyzeDemoSiteProfile({
    companyName: "Flow AI Service",
    websiteUrl: "https://flow-ai.example",
    industry: "AI service, generativ AI og automatisering for kundedialog",
    notes: "Vi bygger AI-løsninger, chatbots og integrasjoner for små og mellomstore bedrifter.",
  });
  const genericBuilder = analyzeDemoSiteProfile({
    companyName: "Nordic Digital",
    websiteUrl: "https://nordicdigital.example",
    industry: "Vi bygger digitale løsninger og moderne nettsider for bedrifter.",
    notes: "Prosjekt, rådgivning og kundeoppfølging uten tydelig bransje.",
  });
  const buildingContractor = analyzeDemoSiteProfile({
    companyName: "Vestfold Bygg",
    websiteUrl: "https://vestfoldbygg.example",
    industry: "Bygg og anlegg, entreprenør, grunnarbeid og totalentreprise",
    notes: "Nybygg, tilbygg og rehabilitering av bygg for private og bedrifter.",
  });

  assert.equal(aiService.templateSlug, "ai-teknologi");
  assert.equal(genericBuilder.templateSlug, "local-service");
  assert.equal(buildingContractor.templateSlug, "bygg");
});

test("DemoSites profile analysis requires clear industry evidence before selecting bygg", () => {
  const aiServicesThatBuild = analyzeDemoSiteProfile({
    companyName: "Nexa AI Services",
    websiteUrl: "https://nexa.example",
    industry: "AI service, automasjon, chatbots og integrasjoner for bedrifter.",
    notes: "Vi bygger digitale arbeidsflyter, AI-agenter og beslutningsstøtte for kundeservice.",
  });
  const generalDigitalService = analyzeDemoSiteProfile({
    companyName: "Digital Prosjektpartner",
    websiteUrl: "https://digitalpartner.example",
    industry: "Prosjektledelse, rådgivning og moderne nettsider.",
    notes: "Vi bygger gode kundeopplevelser og følger opp leveranser fra idé til lansering.",
  });
  const constructionCompany = analyzeDemoSiteProfile({
    companyName: "Fjord Byggmester",
    websiteUrl: "https://fjordbyggmester.example",
    industry: "Byggmester, bygg og anlegg, totalentreprise og rehabilitering av bygg.",
    notes: "Nybygg, tilbygg, grunnarbeid og prosjektledelse bygg for private og næring.",
  });

  assert.equal(aiServicesThatBuild.templateSlug, "ai-teknologi");
  assert.match(aiServicesThatBuild.templateDetection.reason, /AI|Neon|teknologi/i);
  assert.equal(generalDigitalService.templateSlug, "local-service");
  assert.equal(generalDigitalService.templateDetection.fallback_used, true);
  assert.match(generalDigitalService.templateDetection.reason, /standard moderne mal/i);
  assert.equal(constructionCompany.templateSlug, "bygg");
  assert.equal(constructionCompany.templateDetection.fallback_used, false);
});

test("DemoSites profile analysis ignores template words that only appear in the URL", () => {
  const urlOnlySignal = analyzeDemoSiteProfile({
    companyName: "Nordvik Partner AS",
    websiteUrl: "https://bygg-ai-restaurant.example",
    industry: "Lokal rådgivning og praktisk koordinering for bedrifter.",
    notes: "Kundeoppfølging, analyse og service uten tydelig bransje.",
  });

  assert.equal(urlOnlySignal.templateSlug, "local-service");
});
