import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductionReadiness,
  buildRevenueDataHealth,
  canonicalPipelineStatus,
  canonicalRevenueBrand,
  isLegacyPipelineStatus,
} from "./data-quality";

const ready = buildProductionReadiness({
  environment: {
    supabaseUrl: true,
    serviceRole: true,
    sessionSecret: true,
    adminEmails: true,
    vercelEnv: "production",
    deploymentUrl: "realtyflow.example",
    commitSha: "abc123",
  },
  probes: [
    { id: "contacts", label: "Contacts", required: true, ok: true, count: 4 },
    { id: "brand-settings", label: "Brand settings", required: true, ok: true, count: 2 },
  ],
});

test("normalizes known brand aliases and legacy statuses", () => {
  assert.equal(canonicalRevenueBrand("Zen Eco Homes"), "zeneco");
  assert.equal(canonicalRevenueBrand("Pinoso Ecolife"), "pinosoecolife");
  assert.equal(canonicalPipelineStatus("Vunnet"), "WON");
  assert.equal(isLegacyPipelineStatus("Vunnet"), true);
  assert.equal(isLegacyPipelineStatus("WON"), false);
});

test("blocks readiness when required environment or table is missing", () => {
  const report = buildProductionReadiness({
    environment: {
      supabaseUrl: true,
      serviceRole: false,
      sessionSecret: false,
      adminEmails: false,
    },
    probes: [
      { id: "contacts", label: "Contacts", required: true, ok: false, detail: "missing" },
      { id: "drafts", label: "Message drafts", required: false, ok: false, detail: "optional" },
    ],
  });
  assert.equal(report.status, "BLOCKED");
  assert.ok(report.blockers.includes("Supabase service role"));
  assert.ok(report.blockers.includes("Contacts"));
  assert.ok(report.warnings.includes("Admin session secret"));
});

test("finds duplicates without merging them", () => {
  const report = buildRevenueDataHealth({
    readiness: ready,
    now: new Date("2026-07-11T10:00:00Z"),
    contacts: [
      { id: "a", name: "Anna", email: "anna@example.com", phone: "+47 999 11 222", brand_id: "soleada", source: "referral", pipeline_status: "CONTACT", next_followup: "2026-07-12" },
      { id: "b", name: "Anna B", email: "ANNA@example.com", phone: "99911222", brand_id: "soleada", source: "referral", pipeline_status: "CONTACT", next_followup: "2026-07-12" },
    ],
  });
  const duplicate = report.issues.find((item) => item.category === "DUPLICATE");
  assert.ok(duplicate);
  assert.deepEqual(duplicate?.contactIds, ["a", "b"]);
  assert.deepEqual(duplicate?.actions, ["MARK_DUPLICATE_REVIEWED"]);
});

test("uses documented source as a suggestion but does not write it automatically", () => {
  const report = buildRevenueDataHealth({
    readiness: ready,
    contacts: [{
      id: "source-1",
      name: "Lead",
      brand_id: "zeneco",
      pipeline_status: "NEW",
      next_followup: "2026-08-01",
      notes: "UTM: google-ads / villa-july",
      created_at: "2026-07-01",
      email: "lead@example.com",
    }],
  });
  const item = report.issues.find((issue) => issue.id === "source-structure:source-1");
  assert.equal(item?.suggestedValue, "google-ads");
  assert.deepEqual(item?.actions, ["APPLY_DETECTED_SOURCE"]);
});

test("flags active follow-up gaps and won financial gaps", () => {
  const report = buildRevenueDataHealth({
    readiness: ready,
    now: new Date("2026-07-11T10:00:00Z"),
    contacts: [
      { id: "neg", name: "Negotiation", brand_id: "soleada", source: "partner", pipeline_status: "NEGOTIATION", pipeline_value: 500000, email: "n@example.com" },
      { id: "won", name: "Winner", brand_id: "pinosoecolife", source: "website", pipeline_status: "WON", email: "w@example.com" },
    ],
  });
  assert.equal(report.issues.find((item) => item.id === "followup:neg")?.severity, "CRITICAL");
  assert.equal(report.issues.find((item) => item.id === "value:won")?.severity, "CRITICAL");
  assert.equal(report.issues.find((item) => item.id === "commission:won")?.severity, "CRITICAL");
  assert.equal(report.summary.wonCommissionCoveragePercent, 0);
  assert.equal(report.summary.wonValueCoveragePercent, 0);
});

test("detects incomplete active Keyholding agreement", () => {
  const report = buildRevenueDataHealth({
    readiness: ready,
    contacts: [{
      id: "kh",
      name: "Keyholding customer",
      brand_id: "keyholding",
      source: "referral",
      pipeline_status: "WON",
      pipeline_value: 400000,
      commission_amount: 12000,
      email: "kh@example.com",
      interactions: [{
        action: "keyholding_contract_started",
        date: "2026-06-01",
        metadata: {},
      }],
    }],
  });
  const item = report.issues.find((issue) => issue.category === "KEYHOLDING");
  assert.ok(item);
  assert.equal(item?.href, "/service-revenue");
});

test("keeps confirmed commission coverage separate from fallback estimates", () => {
  const report = buildRevenueDataHealth({
    readiness: ready,
    contacts: [
      { id: "confirmed", brand_id: "soleada", source: "website", pipeline_status: "WON", pipeline_value: 500000, commission_percent: 4, email: "a@x.com" },
      { id: "missing", brand_id: "soleada", source: "website", pipeline_status: "WON", pipeline_value: 300000, email: "b@x.com" },
    ],
  });
  assert.equal(report.summary.wonCommissionCoveragePercent, 50);
  assert.ok(report.issues.some((issue) => issue.id === "commission:missing"));
  assert.ok(!report.issues.some((issue) => issue.id === "commission:confirmed"));
});
