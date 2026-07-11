import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClosingPackDeal,
  CLOSING_DOCUMENTS,
  sortClosingPackDeals,
  summarizeClosingPacks,
} from "./closing-pack";

const now = new Date("2026-07-11T12:00:00.000Z");

function contact(overrides: Record<string, any> = {}) {
  return {
    id: "contact-1",
    name: "Harald Flagtvedt",
    email: "harald@example.com",
    phone: "+4790000000",
    pipeline_status: "NEGOTIATION",
    pipeline_value: 750000,
    property_interest: "Leilighet i Albir",
    brand_id: "soleada",
    interactions: [],
    ...overrides,
  };
}

function documentEvent(documentId: string, status: string, overrides: Record<string, any> = {}) {
  return {
    id: crypto.randomUUID(),
    type: "closing_pack",
    action: "closing_document_updated",
    date: overrides.date || "2026-07-10T10:00:00.000Z",
    metadata: {
      document_id: documentId,
      status,
      responsible_role: overrides.responsibleRole || "ADVISOR",
      due_date: overrides.dueDate || null,
      document_url: overrides.documentUrl || null,
      note: overrides.note || null,
      updated_by: "freddy.bremseth@gmail.com",
    },
  };
}

test("negotiation pack requires reservation, identity, legal and finance documents", () => {
  const deal = buildClosingPackDeal(contact(), now);
  assert.ok(deal);
  const required = deal.documents.filter((item) => item.required);
  assert.equal(required.length, CLOSING_DOCUMENTS.filter((item) => item.requiredFrom === "NEGOTIATION").length);
  assert.equal(deal.completionPercent, 0);
  assert.equal(deal.risk, "HIGH");
  assert.ok(deal.criticalBlockers.includes("Reservasjonsavtale"));
  assert.equal(deal.documents.find((item) => item.id === "signing_appointment")?.required, false);
});

test("won pack adds signing and handover documents", () => {
  const deal = buildClosingPackDeal(contact({ pipeline_status: "WON" }), now);
  assert.ok(deal);
  assert.equal(deal.documents.filter((item) => item.required).length, CLOSING_DOCUMENTS.length);
  assert.equal(deal.documents.find((item) => item.id === "handover_protocol")?.required, true);
});

test("latest immutable event controls document state", () => {
  const interactions = [
    documentEvent("reservation_contract", "REQUESTED", { date: "2026-07-08T10:00:00.000Z" }),
    documentEvent("reservation_contract", "REVIEWED", {
      date: "2026-07-10T10:00:00.000Z",
      documentUrl: "https://drive.google.com/example",
      note: "Signert kopi kontrollert",
    }),
  ];
  const deal = buildClosingPackDeal(contact({ interactions }), now);
  const reservation = deal?.documents.find((item) => item.id === "reservation_contract");
  assert.equal(reservation?.status, "REVIEWED");
  assert.equal(reservation?.complete, true);
  assert.equal(reservation?.documentUrl, "https://drive.google.com/example");
  assert.equal(reservation?.note, "Signert kopi kontrollert");
});

test("overdue required documents raise high risk", () => {
  const deal = buildClosingPackDeal(contact({
    interactions: [documentEvent("reservation_contract", "REQUESTED", { dueDate: "2026-07-01" })],
  }), now);
  assert.equal(deal?.documents.find((item) => item.id === "reservation_contract")?.overdue, true);
  assert.ok((deal?.overdueCount || 0) > 0);
  assert.equal(deal?.risk, "HIGH");
});

test("not applicable is complete but still auditable", () => {
  const deal = buildClosingPackDeal(contact({
    interactions: [documentEvent("inventory_list", "NOT_APPLICABLE", { note: "Boligen selges uten møbler" })],
  }), now);
  const inventory = deal?.documents.find((item) => item.id === "inventory_list");
  assert.equal(inventory?.complete, true);
  assert.equal(inventory?.note, "Boligen selges uten møbler");
});

test("non-https links are ignored", () => {
  const deal = buildClosingPackDeal(contact({
    interactions: [documentEvent("buyer_identity", "RECEIVED", { documentUrl: "http://unsafe.example/passport.pdf" })],
  }), now);
  assert.equal(deal?.documents.find((item) => item.id === "buyer_identity")?.documentUrl, null);
});

test("pack review timestamp is derived from timeline", () => {
  const deal = buildClosingPackDeal(contact({
    interactions: [{
      id: "review-1",
      type: "closing_pack",
      action: "closing_pack_reviewed",
      date: "2026-07-11T09:00:00.000Z",
      metadata: { source: "closing-pack-workspace" },
    }],
  }), now);
  assert.equal(deal?.lastPackReviewAt, "2026-07-11T09:00:00.000Z");
});

test("sorting prioritizes risk, overdue documents and value", () => {
  const low = buildClosingPackDeal(contact({
    id: "low",
    name: "Low",
    pipeline_value: 300000,
    interactions: CLOSING_DOCUMENTS
      .filter((item) => item.requiredFrom === "NEGOTIATION")
      .map((item) => documentEvent(item.id, "REVIEWED")),
  }), now)!;
  const high = buildClosingPackDeal(contact({ id: "high", name: "High", pipeline_value: 900000 }), now)!;
  const sorted = sortClosingPackDeals([low, high]);
  assert.equal(sorted[0].id, "high");
  const summary = summarizeClosingPacks(sorted);
  assert.equal(summary.totalDeals, 2);
  assert.equal(summary.highRisk, 1);
  assert.equal(summary.pipelineValue, 1200000);
});

test("contacts outside negotiation and won are excluded", () => {
  assert.equal(buildClosingPackDeal(contact({ pipeline_status: "QUALIFIED" }), now), null);
});
