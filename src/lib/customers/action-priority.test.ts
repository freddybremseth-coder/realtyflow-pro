import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerListAction, normalizeRealEstateStage } from "./action-priority";

const now = new Date("2026-08-26T12:00:00.000Z");

test("customer list triage makes missing contact channel critical", () => {
  const result = buildCustomerListAction({ pipeline_status: "NEW" }, now);
  assert.equal(result.priority, "CRITICAL");
  assert.equal(result.score, 100);
  assert.match(result.reason, /mangler både e-post og telefon/i);
});

test("customer list triage prioritizes overdue follow-up", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    next_followup: "2026-08-25T09:00:00.000Z",
  }, now);
  assert.equal(result.priority, "CRITICAL");
  assert.equal(result.label, "Følg opp nå");
});

test("negotiation outranks viewing when neither is overdue", () => {
  const negotiation = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "NEGOTIATION",
  }, now);
  const viewing = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "VIEWING",
  }, now);
  assert.ok(negotiation.score > viewing.score);
  assert.equal(negotiation.label, "Fremdrift i forhandling");
  assert.equal(viewing.label, "Følg opp visningen");
});

test("future follow-up suppresses action noise for ordinary active customers", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "CONTACT",
    next_followup: "2026-09-10T09:00:00.000Z",
  }, now);
  assert.equal(result.priority, "LOW");
  assert.equal(result.needsAction, false);
  assert.equal(result.label, "Oppfølging er planlagt");
});

test("on-hold customer with resume date is not shown as requiring action", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "ON_HOLD",
    next_followup: "2026-10-01T09:00:00.000Z",
  }, now);
  assert.equal(result.needsAction, false);
  assert.equal(result.label, "På vent til avtalt dato");
});

test("on-hold customer without resume date requires one", () => {
  const result = buildCustomerListAction({ email: "buyer@example.com", pipeline_status: "ON_HOLD" }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.label, "Sett dato for gjenopptakelse");
});

test("matching and reserved are canonical commercial stages", () => {
  const matching = buildCustomerListAction({ email: "buyer@example.com", pipeline_status: "PROPERTY_MATCHING" }, now);
  const reserved = buildCustomerListAction({ email: "buyer@example.com", pipeline_status: "RESERVATION" }, now);
  assert.equal(matching.label, "Finn og kvalitetssikre boliger");
  assert.equal(reserved.label, "Sikre closing-fremdrift");
  assert.equal(normalizeRealEstateStage("property matching"), "MATCHING");
  assert.equal(normalizeRealEstateStage("reservert"), "RESERVED");
});

test("stale active customer is surfaced for reactivation", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    last_contact: "2026-05-01T09:00:00.000Z",
    updated_at: "2026-05-01T09:00:00.000Z",
  }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.label, "Reaktiver eller avklar status");
  assert.ok(result.score >= 90);
});

test("active customer without follow-up receives a high priority date action", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "CONTACT",
    updated_at: "2026-08-25T09:00:00.000Z",
  }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.label, "Sett neste oppfølging");
});

test("closed customers are not presented as active actions", () => {
  const result = buildCustomerListAction({ email: "buyer@example.com", pipeline_status: "WON" }, now);
  assert.equal(result.needsAction, false);
  assert.equal(result.priority, "LOW");
});
