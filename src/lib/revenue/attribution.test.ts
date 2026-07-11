import test from "node:test";
import assert from "node:assert/strict";
import {
  attributionSpendStorageKey,
  buildAttributionWorkspace,
  extractAttribution,
} from "./attribution";

const month = "2026-07-01";
const now = new Date("2026-07-20T12:00:00.000Z");

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    name: "Test Lead",
    brand_id: "soleada",
    pipeline_status: "NEW",
    created_at: "2026-07-05T10:00:00.000Z",
    pipeline_value: 300000,
    ...overrides,
  };
}

test("extracts structured UTM source and campaign with high confidence", () => {
  const result = extractAttribution(contact({ utm_source: "google cpc", utm_campaign: "summer-villas" }));
  assert.equal(result.sourceId, "google-ads");
  assert.equal(result.campaign, "summer-villas");
  assert.equal(result.confidence, "HIGH");
});

test("parses UTM evidence from notes when structured fields are absent", () => {
  const result = extractAttribution(contact({ source: null, notes: "Brand: Soleada\nUTM: instagram / albir-july\nMelding: Hei" }));
  assert.equal(result.sourceId, "instagram");
  assert.equal(result.campaign, "albir-july");
  assert.equal(result.confidence, "LOW");
});

test("uses an earlier interaction source before a later structured source", () => {
  const result = extractAttribution(contact({
    created_at: "2026-07-10T10:00:00.000Z",
    source: "direct",
    interactions: [{ date: "2026-07-02T08:00:00.000Z", metadata: { utm_source: "facebook paid", utm_campaign: "early" } }],
  }));
  assert.equal(result.sourceId, "facebook");
  assert.equal(result.campaign, "early");
});

test("monthly cohort excludes leads attributed outside the selected month", () => {
  const workspace = buildAttributionWorkspace({
    contacts: [
      contact({ source: "website", created_at: "2026-07-05T10:00:00.000Z" }),
      contact({ source: "website", created_at: "2026-06-30T23:59:59.000Z" }),
    ],
    scope: "all",
    periodStart: month,
    now,
  });
  assert.equal(workspace.summary.leads, 1);
});

test("confirmed commission excludes fallback estimates from ROAS", () => {
  const workspace = buildAttributionWorkspace({
    contacts: [
      contact({ source: "google ads", pipeline_status: "WON", commission_amount: 12000, commission_paid_date: "2026-07-18" }),
      contact({ source: "google ads", pipeline_status: "WON", commission_amount: null, commission_percent: null, pipeline_value: 500000 }),
    ],
    scope: "all",
    periodStart: month,
    now,
    spend: [{ sourceId: "google-ads", spendEur: 2000 }],
  });
  const google = workspace.sources.find((row) => row.sourceId === "google-ads");
  assert.ok(google);
  assert.equal(google.confirmedCommission, 12000);
  assert.equal(google.collectedCommission, 12000);
  assert.equal(google.unknownCommissionWins, 1);
  assert.equal(google.earnedRoas, 6);
  assert.equal(workspace.summary.confirmedCommissionCoveragePercent, 50);
});

test("calculates CPL and CAC only from manually supplied spend", () => {
  const workspace = buildAttributionWorkspace({
    contacts: [
      contact({ source: "referral", pipeline_status: "WON", commission_amount: 10000 }),
      contact({ source: "referral", pipeline_status: "QUALIFIED" }),
    ],
    scope: "all",
    periodStart: month,
    now,
    spend: [{ sourceId: "referral", spendEur: 500 }],
  });
  const referral = workspace.sources.find((row) => row.sourceId === "referral");
  assert.ok(referral);
  assert.equal(referral.costPerLead, 250);
  assert.equal(referral.customerAcquisitionCost, 500);
  assert.equal(referral.earnedRoas, 20);
});

test("keeps scope isolated by brand", () => {
  const contacts = [
    contact({ brand_id: "soleada", source: "website" }),
    contact({ brand_id: "zeneco", source: "website" }),
    contact({ brand_id: "donaanna", source: "website" }),
  ];
  const soleada = buildAttributionWorkspace({ contacts, scope: "soleada", periodStart: month, now });
  const all = buildAttributionWorkspace({ contacts, scope: "all", periodStart: month, now });
  assert.equal(soleada.summary.leads, 1);
  assert.equal(all.summary.leads, 2);
});

test("spend without attributed leads creates a critical recommendation", () => {
  const workspace = buildAttributionWorkspace({
    contacts: [],
    scope: "all",
    periodStart: month,
    now,
    spend: [{ sourceId: "meta", spendEur: 900 }],
  });
  assert.equal(workspace.sources[0].sourceId, "meta");
  assert.equal(workspace.sources[0].leads, 0);
  assert.equal(workspace.recommendations[0].priority, "CRITICAL");
});

test("unknown source remains explicit and lowers data quality", () => {
  const workspace = buildAttributionWorkspace({
    contacts: [contact({ source: null, notes: null, interactions: [] })],
    scope: "all",
    periodStart: month,
    now,
  });
  assert.equal(workspace.sources[0].sourceId, "unknown");
  assert.equal(workspace.summary.knownSourceSharePercent, 0);
  assert.ok(workspace.recommendations.some((item) => item.id === "unknown-source"));
});

test("storage key isolates scope and month", () => {
  assert.equal(attributionSpendStorageKey("soleada", "2026-07-01"), "revenue-attribution:soleada:2026-07");
  assert.notEqual(attributionSpendStorageKey("soleada", "2026-07-01"), attributionSpendStorageKey("soleada", "2026-08-01"));
});
