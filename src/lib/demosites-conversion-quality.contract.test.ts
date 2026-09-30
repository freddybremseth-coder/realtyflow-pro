import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { evaluateDemoSiteQuality, sanitizeDemoGeneratedCopy } from "./demosites-enrichment";

const publicRequest = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/saas/demosites/request/route.ts"),
  "utf8",
);
const internalOrders = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/saas/demosites/route.ts"),
  "utf8",
);
const followup = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/demosites-followup/route.ts"),
  "utf8",
);
const classicRenderer = fs.readFileSync(
  path.join(process.cwd(), "src/components/demosites/demo-site-preview-renderer.tsx"),
  "utf8",
);
const signatureRenderer = fs.readFileSync(
  path.join(process.cwd(), "src/components/demosites/demo-signature-site-renderer.tsx"),
  "utf8",
);

test("public requests are customer initiated while internal demos default to seller generated", () => {
  assert.match(publicRequest, /order_origin: "customer_initiated"/);
  assert.match(publicRequest, /source_channel: "public_demo_request"/);
  assert.match(internalOrders, /order_origin: String\(incomingEditableFields\.order_origin \|\| "seller_generated"\)/);
  assert.match(internalOrders, /source_channel: String\(incomingEditableFields\.source_channel \|\| "realtyflow_internal"\)/);
});

test("unpaid internal demos never become started subscriptions or paid SaaS revenue", () => {
  assert.doesNotMatch(internalOrders, /subscription_started_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(internalOrders, /subscription_renews_at: plusOneMonthIso\(\)/);
  assert.match(internalOrders, /total_users: summary\.paidOrders/);
  assert.match(internalOrders, /total_revenue: summary\.paidRevenue/);
  assert.match(internalOrders, /mrr: summary\.paidMrr/);
  assert.match(internalOrders, /pipelineMrr/);
});

test("automatic nurture requires a customer-initiated, unpaid, quality-ready preview", () => {
  assert.match(followup, /getOrigin\(row\.editable_fields\) !== "customer_initiated"/);
  assert.match(followup, /!isQualityReady\(row\.editable_fields\)/);
  assert.match(followup, /\.neq\("billing_status", "paid"\)/);
  assert.match(followup, /Your website demo/);
  assert.match(followup, /Would you like us to launch/);
  assert.match(followup, /language: "en"/);
});

test("both renderer families enforce responsive typography and usable touch targets", () => {
  for (const source of [classicRenderer, signatureRenderer]) {
    assert.match(source, /demo-public-site/);
    assert.match(source, /min-height: 44px/);
    assert.match(source, /text-wrap: balance/);
    assert.match(source, /@media \(max-width: 767px\)/);
    assert.match(source, /@media \(min-width: 768px\) and \(max-width: 1023px\)/);
  }
});

test("generated copy is clamped and simplified before it reaches a customer demo", () => {
  const sanitized = sanitizeDemoGeneratedCopy({
    hero_title: "A very long headline that keeps going far beyond what a strong responsive hero should ever need to display on a phone",
    hero_subtitle: "  A concrete subtitle   with      excessive spacing. ",
    intro_text: "One concise sentence. Another concise sentence.",
    services: ["Service one", "Service one", "Service two", "Service three", "Service four", "Service five", "Service six", "Service seven"],
    trust_points: ["Clear process", "Clear process", "Direct contact", "Practical advice", "Simple booking"],
    faq: [
      { question: "Can I ask a question?", answer: "Yes, use the contact form and the business can follow up." },
      { question: "How does it work?", answer: "Send the relevant details and the business can respond." },
      { question: "Third?", answer: "Third answer." },
      { question: "Fourth?", answer: "Fourth answer." },
      { question: "Fifth?", answer: "Fifth answer." },
    ],
    call_to_action: "Contact us today and tell us absolutely everything",
    contact_text: "Send the essentials and we can take it from there.",
  });

  assert.ok((sanitized.hero_title || "").length <= 64);
  assert.equal(sanitized.services?.length, 6);
  assert.equal(sanitized.trust_points?.length, 4);
  assert.equal(sanitized.faq?.length, 4);
  assert.ok((sanitized.call_to_action || "").length <= 32);
});

test("quality gate blocks thin demos and approves complete responsive one-pagers", () => {
  const thin = evaluateDemoSiteQuality({
    hero_title: "Hello",
    hero_subtitle: "Too short",
    services: ["One"],
    gallery_images: ["one.jpg"],
    call_to_action: "Go",
  });
  assert.equal(thin.status, "needs_review");

  const ready = evaluateDemoSiteQuality({
    hero_title: "Trygg hjelp når du trenger det",
    hero_subtitle: "Få en tydelig oversikt over tjenestene og ta kontakt på få sekunder.",
    intro_text: "Vi gjør det enkelt å komme videre.",
    services: ["Tjeneste én", "Tjeneste to", "Tjeneste tre"],
    gallery_images: ["one.jpg", "two.jpg", "three.jpg"],
    call_to_action: "Be om tilbud",
  });
  assert.equal(ready.status, "ready");
  assert.ok(ready.score >= 83);
});
