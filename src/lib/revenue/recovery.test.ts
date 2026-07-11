import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecoveryLead,
  buildRecoveryWorkspace,
  inferLossReason,
  normalizeRecoveryStage,
  sortRecoveryLeads,
} from "./recovery";

const NOW = new Date("2026-07-11T12:00:00.000Z");

function dormant(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    name: "Dormant lead",
    pipeline_status: "LOST",
    pipeline_value: 500_000,
    email: "lead@example.com",
    updated_at: "2026-04-01T10:00:00.000Z",
    last_contact: "2026-04-01T10:00:00.000Z",
    interactions: [],
    ...overrides,
  };
}

test("normalizes dormant status aliases", () => {
  assert.equal(normalizeRecoveryStage("tapt"), "LOST");
  assert.equal(normalizeRecoveryStage("på vent"), "ON_HOLD");
  assert.equal(normalizeRecoveryStage("NEGOTIATION"), null);
});

test("excludes active and won contacts", () => {
  assert.equal(buildRecoveryLead(dormant({ pipeline_status: "QUALIFIED" }), NOW), null);
  assert.equal(buildRecoveryLead(dormant({ pipeline_status: "WON" }), NOW), null);
});

test("infers timing and budget reasons from CRM text", () => {
  assert.deepEqual(inferLossReason(dormant({ notes: "Kunden er ikke klar før neste år" })), {
    reason: "TIMING",
    source: "INFERRED",
  });
  assert.equal(inferLossReason(dormant({ notes: "Boligene var for dyr og over budsjett" })).reason, "PRICE_BUDGET");
});

test("explicit reason overrides inferred text", () => {
  const result = inferLossReason(dormant({
    notes: "Ingen svar",
    interactions: [{
      action: "recovery_reason_set",
      date: "2026-07-01T10:00:00.000Z",
      metadata: { reason: "FINANCING" },
    }],
  }));
  assert.deepEqual(result, { reason: "FINANCING", source: "EXPLICIT" });
});

test("on-hold timing lead with advanced stage signal is high recovery potential", () => {
  const item = buildRecoveryLead(dormant({
    pipeline_status: "ON_HOLD",
    notes: "Visning gjennomført. Kunden vil vente til etter sommeren.",
    updated_at: "2026-05-01T10:00:00.000Z",
  }), NOW);
  assert.ok(item);
  assert.equal(item.disposition, "RECOVER_NOW");
  assert.equal(item.priority, "HIGH");
  assert.equal(item.reason, "TIMING");
  assert.equal(item.priorStageSignal, "Visning");
});

test("bought elsewhere and invalid leads are not pursued", () => {
  const bought = buildRecoveryLead(dormant({ notes: "Kunden kjøpte annet sted gjennom annen megler" }), NOW);
  const invalid = buildRecoveryLead(dormant({ notes: "Duplikat og feil nummer" }), NOW);
  assert.equal(bought?.disposition, "DO_NOT_PURSUE");
  assert.equal(bought?.recoveryScore, 0);
  assert.equal(invalid?.disposition, "DO_NOT_PURSUE");
});

test("explicit do-not-pursue event overrides otherwise recoverable lead", () => {
  const item = buildRecoveryLead(dormant({
    pipeline_status: "ON_HOLD",
    notes: "Kunden vil vente til høsten",
    interactions: [{ action: "recovery_do_not_pursue", date: "2026-07-01T10:00:00.000Z" }],
  }), NOW);
  assert.equal(item?.disposition, "DO_NOT_PURSUE");
  assert.equal(item?.doNotPursue, true);
});

test("overdue dormant lead is due now", () => {
  const item = buildRecoveryLead(dormant({
    notes: "Kunden manglet riktig bolig",
    next_followup: "2026-06-01T10:00:00.000Z",
  }), NOW);
  assert.equal(item?.overdue, true);
  assert.equal(item?.dueNow, true);
  assert.match(item?.issues.join(" ") || "", /forsinket/);
});

test("workspace separates recovery outcomes and values", () => {
  const result = buildRecoveryWorkspace([
    dormant({ id: "recover", pipeline_status: "ON_HOLD", notes: "Visning gjennomført, venter til høsten", pipeline_value: 700_000 }),
    dormant({ id: "nurture", notes: "Ingen svar", pipeline_value: 300_000, next_followup: "2026-08-01T10:00:00.000Z" }),
    dormant({ id: "closed", notes: "Kjøpte annet sted", pipeline_value: 450_000 }),
  ], NOW);
  assert.equal(result.summary.dormantLeads, 3);
  assert.equal(result.summary.recoverNow, 1);
  assert.equal(result.summary.doNotPursue, 1);
  assert.equal(result.summary.highPotentialValue, 700_000);
  assert.equal(result.summary.totalDormantValue, 1_450_000);
});

test("sorts recover-now and due leads before nurture and closed leads", () => {
  const recover = buildRecoveryLead(dormant({ id: "recover", pipeline_status: "ON_HOLD", notes: "Visning, venter til høsten" }), NOW)!;
  const nurture = buildRecoveryLead(dormant({ id: "nurture", notes: "Ingen svar", next_followup: "2026-08-01T10:00:00.000Z" }), NOW)!;
  const closed = buildRecoveryLead(dormant({ id: "closed", notes: "Kjøpte annet sted" }), NOW)!;
  assert.deepEqual(sortRecoveryLeads([closed, nurture, recover]).map((item) => item.id), ["recover", "nurture", "closed"]);
});
