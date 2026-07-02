import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRevenueOpportunities,
  buildRevenueSummary,
  getDefaultRevenueCampaign,
  getRevenueStageLabel,
  type RevenueEngineImport,
  type RevenueEngineLead,
  type RevenueEngineOrder,
} from "@/lib/revenue-engine";

test("Revenue Engine prioritizes demo-ready imports and creates manual outreach drafts", () => {
  const imports: RevenueEngineImport[] = [
    {
      id: "import-1",
      website_url: "https://eidskogdekk.no",
      company_name: "Eidskog Dekk",
      detected_industry: "Dekk og bilverksted",
      recommended_template_slug: "dekk",
      confidence_score: 84,
      status: "created_demo",
      created_order_id: "order-1",
      editable_fields: {
        services: ["Dekkskift", "Hjulhotell", "Dekk og felg"],
        products: ["Sommerdekk", "Vinterdekk"],
        prices: ["Dekkskift fra 690 NOK"],
        trust_points: ["Lokalt verksted", "Rask timebestilling"],
        call_to_action: "Få tilbud på dekk",
        contact_text: "Kontakt verkstedet for pris og time.",
        logo_url: "https://eidskogdekk.no/logo.png",
        gallery_images: ["https://eidskogdekk.no/verksted.jpg"],
      },
      profile: {
        company_name: "Eidskog Dekk",
        website_url: "https://eidskogdekk.no",
        contact: { phone: "12345678" },
      },
    },
  ];
  const orders: RevenueEngineOrder[] = [
    {
      id: "order-1",
      company_name: "Eidskog Dekk",
      website_url: "https://eidskogdekk.no",
      template_slug: "dekk",
      status: "in_setup",
      preview_url: "https://realtyflow.test/demosites/preview/token-1",
      claim_url: "https://realtyflow.test/demosites/claim/token-1",
    },
  ];

  const [opportunity] = buildRevenueOpportunities(imports, orders, [], getDefaultRevenueCampaign());

  assert.equal(opportunity.companyName, "Eidskog Dekk");
  assert.equal(opportunity.stage, "demo_ready");
  assert.equal(opportunity.orderId, "order-1");
  assert.equal(opportunity.previewUrl, "https://realtyflow.test/demosites/preview/token-1");
  assert.equal(opportunity.confidenceScore, 84);
  assert.ok(opportunity.priorityScore >= 80);
  assert.match(opportunity.sessionBrief.hook, /privat demo/i);
  assert.match(opportunity.outreach.emailOne, /Eidskog Dekk/);
  assert.match(opportunity.outreach.emailOne, /private? demo|privat demo/i);
  assert.match(opportunity.outreach.emailOne, /https:\/\/realtyflow\.test\/demosites\/preview\/token-1/);
});

test("Revenue Engine keeps lead-only opportunities manual and analysis-ready", () => {
  const leads: RevenueEngineLead[] = [
    {
      id: "lead-1",
      company_name: "Nordic AI Studio",
      website_url: "https://nordicaistudio.no",
      industry: "AI service",
      lead_status: "new",
      outreach_status: "draft",
    },
  ];

  const [opportunity] = buildRevenueOpportunities([], [], leads);

  assert.equal(opportunity.source, "lead");
  assert.equal(opportunity.stage, "analysis_ready");
  assert.equal(opportunity.templateSlug, "local-service");
  assert.equal(opportunity.priorityScore, 35);
  assert.ok(opportunity.risks.some((risk) => risk.includes("Ingen importanalyse")));
  assert.match(opportunity.outreach.dm, /Vil du se den/);
});

test("Revenue Engine summary counts stages and high-priority opportunities", () => {
  const imports: RevenueEngineImport[] = [
    {
      id: "import-1",
      website_url: "https://klar-demo.no",
      company_name: "Klar Demo",
      confidence_score: 90,
      status: "created_demo",
      created_order_id: "order-1",
      editable_fields: {
        services: ["A", "B", "C"],
        prices: ["Pakke"],
        trust_points: ["Trygg", "Rask"],
        call_to_action: "Book demo",
        contact_text: "Kontakt oss.",
        logo_url: "https://klar-demo.no/logo.png",
        gallery_images: ["https://klar-demo.no/bilde.jpg"],
      },
      profile: { contact: { email: "hei@klar-demo.no" } },
    },
    {
      id: "import-2",
      website_url: "https://kontaktet.no",
      company_name: "Kontaktet AS",
      confidence_score: 60,
    },
  ];
  const orders: RevenueEngineOrder[] = [{ id: "order-1", website_url: "https://klar-demo.no", status: "in_setup" }];
  const leads: RevenueEngineLead[] = [
    { id: "lead-2", company_name: "Kontaktet AS", website_url: "https://kontaktet.no", lead_status: "contacted" },
  ];

  const summary = buildRevenueSummary(buildRevenueOpportunities(imports, orders, leads));

  assert.equal(summary.total, 2);
  assert.equal(summary.demoReady, 1);
  assert.equal(summary.followUp, 1);
  assert.equal(summary.highPriority, 1);
  assert.equal(getRevenueStageLabel("follow_up"), "Følg opp");
});
