import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatGeniusServiceUpsertPayload,
  getChatGeniusServiceCatalog,
  summarizeChatGeniusServices,
} from "@/lib/chatgenius-services";

test("ChatGenius service catalog includes the AI training offer and app portfolio", () => {
  const services = getChatGeniusServiceCatalog();
  const training = services.find((service) => service.slug === "ai-opplaering-radgivning");
  const olivia = services.find((service) => service.slug === "olivia-farm-iot");
  const remaster = services.find((service) => service.slug === "remaster-freddy");

  assert.ok(training);
  assert.equal(training.price_amount, 890);
  assert.equal(training.currency, "NOK");
  assert.equal(training.billing_interval, "hour");
  assert.equal(training.metadata.expertise_since, "2022");

  assert.equal(olivia?.public_url, "https://olivia.donaanna.com");
  assert.deepEqual(olivia?.metadata.alternate_urls, ["https://olivia.chatgenius.pro"]);
  assert.equal(remaster?.metadata.controlled_by, "realtyflow.chatgenius.pro");
});

test("ChatGenius service summary exposes campaign, Stripe and budget signals", () => {
  const summary = summarizeChatGeniusServices(getChatGeniusServiceCatalog());

  assert.equal(summary.totalServices, 14);
  assert.equal(summary.publishedServices, 14);
  assert.ok(summary.campaignReady >= 10);
  assert.ok(summary.needsStripeSetup >= 4);
  assert.equal(summary.hourlyRateNok, 890);
  assert.ok(summary.monthlyBudgetNok > 60000);
  assert.ok(summary.channels.includes("Google Search"));
});

test("ChatGenius service upsert payload is Supabase-table friendly", () => {
  const service = getChatGeniusServiceCatalog()[0];
  const payload = buildChatGeniusServiceUpsertPayload(service);

  assert.equal(payload.id, undefined);
  assert.equal(payload.created_at, undefined);
  assert.equal(payload.updated_at, undefined);
  assert.equal(payload.brand_id, "chatgenius");
  assert.equal(payload.recommended_budget_amount, 7000);
  assert.ok(Array.isArray(payload.campaign_channels));
});

test("ChatGenius service migration locks direct browser access", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260820141351_chatgenius_service_catalog.sql"),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.chatgenius_services/);
  assert.doesNotMatch(migration, /saas_app_slug text references/);
  assert.match(migration, /alter table public\.chatgenius_services enable row level security/);
  assert.match(migration, /grant select, insert, update, delete on public\.chatgenius_services to service_role/);
  assert.match(migration, /chatgenius_services_deny_browser_direct/);
  assert.match(migration, /'ai-opplaering-radgivning'/);
  assert.match(migration, /'https:\/\/olivia\.donaanna\.com'/);
});
