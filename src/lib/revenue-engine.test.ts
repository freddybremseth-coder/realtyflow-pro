import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRevenueDailyWorklist,
  buildRevenueOpportunities,
  buildRevenueSummary,
  getDefaultRevenueCampaign,
  getRevenueStageLabel,
  getRevenueSuggestedFollowUpDate,
  type RevenueEngineImport,
  type RevenueEngineLead,
  type RevenueEngineOpportunity,
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
  assert.equal(opportunity.nextPlay.channelLabel, "E-post");
  assert.equal(opportunity.nextPlay.primaryCopyLabel, "E-post 1");
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
  assert.equal(opportunity.nextPlay.primaryCopyLabel, "Ingen outreach");
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

test("Revenue Engine uses lead workflow metadata for follow-up focus", () => {
  const leads: RevenueEngineLead[] = [
    {
      id: "lead-1",
      company_name: "Kontaktet AI AS",
      website_url: "https://kontaktet-ai.no",
      contact_phone: "12345678",
      industry: "AI service",
      lead_status: "contacted",
      outreach_status: "sent",
      metadata: {
        revenue_engine: {
          next_follow_up_at: "2026-07-05",
          note: "Ring daglig leder etter at preview er sett.",
        },
      },
    },
    {
      id: "lead-2",
      company_name: "Ikke Fit AS",
      website_url: "https://ikkefit.no",
      lead_status: "not_fit",
    },
  ];

  const opportunities = buildRevenueOpportunities([], [], leads);
  const followUp = opportunities.find((item) => item.id === "lead-1");
  const worklist = buildRevenueDailyWorklist(opportunities);

  assert.equal(followUp?.stage, "follow_up");
  assert.equal(followUp?.followUpAt, "2026-07-05");
  assert.equal(followUp?.workflowNote, "Ring daglig leder etter at preview er sett.");
  assert.equal(followUp?.nextPlay.channelLabel, "Telefon");
  assert.equal(followUp?.nextPlay.primaryCopyLabel, "Telefon");
  assert.equal(worklist[0]?.id, "lead-1");
  assert.equal(worklist[0]?.urgency, "scheduled");
  assert.equal(worklist[0]?.urgencyLabel, "Planlagt");
  assert.equal(worklist[0]?.channelLabel, "Telefon");
  assert.match(worklist[0]?.playTitle || "", /Ring/);
  assert.equal(worklist.some((item) => item.id === "lead-2"), false);
});

test("Revenue Engine daily worklist prioritizes due manual follow-ups", () => {
  const baseOpportunity: RevenueEngineOpportunity = {
    id: "base",
    companyName: "Base AS",
    websiteUrl: "https://base.no",
    industry: "Lokale bedrifter",
    templateSlug: "local-service",
    stage: "demo_ready",
    priorityScore: 95,
    confidenceScore: 80,
    previewUrl: "",
    claimUrl: "",
    source: "lead",
    reasons: [],
    risks: [],
    nextAction: "Godkjenn outreach.",
    nextPlay: {
      title: "Godkjenn outreach.",
      channel: "email",
      channelLabel: "E-post",
      primaryCopyLabel: "E-post 1",
      timing: "I dag",
      rationale: "Test opportunity.",
      checklist: [],
    },
    sessionBrief: {
      hook: "",
      problems: [],
      improvements: [],
      agenda: [],
      closeQuestion: "",
    },
    outreach: {
      emailSubject: "",
      emailOne: "",
      emailTwo: "",
      emailThree: "",
      emailFour: "",
      dm: "",
      callOpener: "",
    },
  };
  const opportunities: RevenueEngineOpportunity[] = [
    {
      ...baseOpportunity,
      id: "high-priority-demo",
      companyName: "High Priority Demo AS",
      stage: "demo_ready",
      priorityScore: 100,
    },
    {
      ...baseOpportunity,
      id: "future-follow-up",
      companyName: "Future Followup AS",
      stage: "follow_up",
      priorityScore: 70,
      followUpAt: "2026-07-09",
    },
    {
      ...baseOpportunity,
      id: "today-follow-up",
      companyName: "Today Followup AS",
      stage: "follow_up",
      priorityScore: 60,
      followUpAt: "2026-07-03",
    },
    {
      ...baseOpportunity,
      id: "overdue-follow-up",
      companyName: "Overdue Followup AS",
      stage: "follow_up",
      priorityScore: 55,
      followUpAt: "2026-07-01",
    },
  ];

  const worklist = buildRevenueDailyWorklist(
    opportunities,
    4,
    new Date("2026-07-03T12:00:00.000Z"),
  );

  assert.deepEqual(worklist.map((item) => item.id), [
    "overdue-follow-up",
    "today-follow-up",
    "high-priority-demo",
    "future-follow-up",
  ]);
  assert.equal(worklist[0]?.urgency, "overdue");
  assert.equal(worklist[0]?.urgencyLabel, "Forfalt");
  assert.equal(worklist[1]?.urgency, "today");
  assert.equal(worklist[1]?.urgencyLabel, "I dag");
});

test("Revenue Engine suggests follow-up dates by stage using business days", () => {
  const friday = new Date("2026-07-03T12:00:00.000Z");

  assert.equal(getRevenueSuggestedFollowUpDate("outreach_ready", friday), "2026-07-07");
  assert.equal(getRevenueSuggestedFollowUpDate("demo_ready", friday), "2026-07-07");
  assert.equal(getRevenueSuggestedFollowUpDate("follow_up", friday), "2026-07-06");
  assert.equal(getRevenueSuggestedFollowUpDate("session_booked", friday), "2026-07-06");
  assert.equal(getRevenueSuggestedFollowUpDate("analysis_ready", friday), "");
  assert.equal(getRevenueSuggestedFollowUpDate("won", friday), "");
});

test("Revenue Engine maps lead-only session and won statuses", () => {
  const opportunities = buildRevenueOpportunities([], [], [
    { id: "lead-session", company_name: "Session AS", website_url: "https://session.no", lead_status: "responded" },
    { id: "lead-won", company_name: "Vunnet AS", website_url: "https://vunnet.no", lead_status: "converted" },
  ]);

  assert.equal(opportunities.find((item) => item.id === "lead-session")?.stage, "session_booked");
  assert.equal(opportunities.find((item) => item.id === "lead-won")?.stage, "won");
});
