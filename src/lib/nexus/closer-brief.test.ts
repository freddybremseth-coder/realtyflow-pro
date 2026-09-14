import assert from "node:assert/strict";
import test from "node:test";
import { buildCloserBrief, sortCloserBriefs } from "./closer-brief";

const NOW = new Date("2026-09-15T09:00:00.000Z");

function contact(overrides: Record<string, any> = {}) {
  return {
    id: "contact-1",
    name: "Kari Kjøper",
    email: "kari@example.com",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 500000,
    sale_price: 490000,
    commission_percent: 5,
    commission_amount: null,
    property_interest: "Villa i Altea",
    brand_id: "zeneco",
    interactions: [],
    next_followup: "2026-09-17T10:00:00.000Z",
    ...overrides,
  };
}

function closingDoc(documentId: string, status = "REVIEWED", dueDate: string | null = null) {
  return {
    action: "closing_document_updated",
    date: "2026-09-14T10:00:00.000Z",
    metadata: {
      document_id: documentId,
      status,
      due_date: dueDate,
      responsible_role: "ADVISOR",
    },
  };
}

test("Closer Brief uses recorded commission percent and sale price, not gross pipeline value", () => {
  const brief = buildCloserBrief(contact(), NOW);
  assert.ok(brief);
  assert.equal(brief.stage, "NEGOTIATION");
  assert.equal(brief.propertyValueEur, 490000);
  assert.equal(brief.commission.confirmed, true);
  assert.equal(brief.commission.percent, 5);
  assert.equal(brief.commission.amountEur, 24500);
  assert.equal(brief.commission.basisSource, "sale_price");
  assert.equal(brief.commission.weightedCommissionEur, 19600);
  assert.equal(brief.safety.readOnly, true);
});

test("Closer Brief never invents fallback commission when terms are missing", () => {
  const brief = buildCloserBrief(contact({ commission_percent: null, commission_amount: null }), NOW);
  assert.ok(brief);
  assert.equal(brief.commission.confirmed, false);
  assert.equal(brief.commission.amountEur, null);
  assert.equal(brief.commission.weightedCommissionEur, null);
  assert.match(brief.commission.issue || "", /Ingen fallback-provisjon/i);
  assert.ok(brief.closingPack.criticalBlockers.includes("Provisjonsgrunnlag mangler"));
});

test("explicit commission amount is authoritative even without a percentage", () => {
  const brief = buildCloserBrief(contact({ commission_amount: 18000, commission_percent: null, sale_price: null }), NOW);
  assert.ok(brief);
  assert.equal(brief.commission.confirmed, true);
  assert.equal(brief.commission.amountEur, 18000);
  assert.equal(brief.commission.percent, null);
  assert.equal(brief.commission.basisSource, "commission_amount");
});

test("RESERVED remains a distinct closer stage and gets reserved-stage weighting", () => {
  const brief = buildCloserBrief(contact({ pipeline_status: "RESERVED", commission_amount: 20000 }), NOW);
  assert.ok(brief);
  assert.equal(brief.stage, "RESERVED");
  assert.equal(brief.commission.stageProbabilityModel, 0.9);
  assert.equal(brief.commission.weightedCommissionEur, 18000);
  assert.match(brief.nextAction, /reservasjon/i);
});

test("Closer Brief surfaces document deadlines and recent objections", () => {
  const brief = buildCloserBrief(contact({
    interactions: [
      closingDoc("reservation_contract", "REQUESTED", "2026-09-14"),
      { content: "Kunden er fortsatt bekymret for finansiering og bankens tidslinje.", date: "2026-09-15T08:00:00.000Z" },
    ],
  }), NOW);
  assert.ok(brief);
  assert.equal(brief.closingPack.overdueCount >= 1, true);
  assert.equal(brief.closingPack.nextDeadlines[0]?.documentId, "reservation_contract");
  assert.match(brief.latestObjections[0] || "", /finansiering/i);
  assert.equal(brief.risk, "HIGH");
});

test("Closer Brief is read-only and excludes non-closing stages", () => {
  assert.equal(buildCloserBrief(contact({ pipeline_status: "VIEWING" }), NOW), null);
  const brief = buildCloserBrief(contact(), NOW)!;
  assert.deepEqual(brief.safety, {
    readOnly: true,
    customerSend: false,
    pipelineMutation: false,
    priceCommitment: false,
    offerCommitment: false,
    contractCommitment: false,
  });
});

test("sorting prioritizes closing risk before weighted confirmed commission", () => {
  const low = buildCloserBrief(contact({ id: "low", name: "Low", commission_amount: 30000, interactions: [] }), NOW)!;
  const high = buildCloserBrief(contact({
    id: "high",
    name: "High",
    commission_amount: 10000,
    interactions: [closingDoc("reservation_contract", "REQUESTED", "2026-09-10")],
  }), NOW)!;
  assert.equal(sortCloserBriefs([low, high])[0]?.contactId, "high");
});
