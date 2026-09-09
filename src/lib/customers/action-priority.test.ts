import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerListAction, normalizeRealEstateStage } from "./action-priority";

const now = new Date("2026-08-26T12:00:00.000Z");

test("customer list triage makes missing contact channel high, not critical", () => {
  const result = buildCustomerListAction({ pipeline_status: "NEW" }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.score, 88);
  assert.match(result.reason, /mangler både e-post og telefon/i);
});

test("customer list triage keeps ordinary overdue follow-up high, not critical", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    next_followup: "2026-08-25T09:00:00.000Z",
  }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.label, "Følg opp");
});

test("future explicit waiting state suppresses action noise without changing pipeline stage", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "MATCHING",
    waiting_on: "customer",
    waiting_reason: "Kunden avklarer finansiering",
    waiting_until: "2026-10-01T09:00:00.000Z",
    next_followup: "2026-10-01T09:00:00.000Z",
  }, now);
  assert.equal(result.priority, "LOW");
  assert.equal(result.needsAction, false);
  assert.equal(result.label, "Venter på kunden");
  assert.equal(result.reason, "Kunden avklarer finansiering");
});

test("expired waiting state becomes high resume action without false critical alarm", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    waiting_on: "third_party",
    waiting_until: "2026-08-25T09:00:00.000Z",
  }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.score, 89);
  assert.equal(result.label, "Gjenoppta oppfølging");
  assert.match(result.reason, /tredjepart/i);
});

test("waiting state without resume date is surfaced as incomplete", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    waiting_on: "customer",
  }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.label, "Sett dato for ventetilstand");
});

test("negotiation remains the genuine critical commercial stage", () => {
  const negotiation = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "NEGOTIATION",
  }, now);
  const viewing = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "VIEWING",
  }, now);
  assert.ok(negotiation.score > viewing.score);
  assert.equal(negotiation.priority, "CRITICAL");
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

test("STOPP and suppression override stale overdue follow-up", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "CONTACT",
    do_not_contact: true,
    email_suppressed: true,
    next_followup: "2026-08-20T09:00:00.000Z",
    communication: { status: "STOPPED" },
  }, now);
  assert.equal(result.priority, "LOW");
  assert.equal(result.needsAction, false);
  assert.equal(result.label, "Kontakt stoppet");
});

test("customer reply is handled without duplicating hot-lead SLA as critical CRM noise", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "CONTACT",
    next_followup: "2026-08-20T09:00:00.000Z",
    communication: { status: "REPLIED", hasReplyAfterLastSend: true },
  }, now);
  assert.equal(result.priority, "MEDIUM");
  assert.equal(result.needsAction, true);
  assert.equal(result.label, "Behandle kundesvar");
});

test("paused communication suppresses action noise", () => {
  const result = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "QUALIFIED",
    next_followup: "2026-08-20T09:00:00.000Z",
    communication: { status: "PAUSED" },
  }, now);
  assert.equal(result.priority, "LOW");
  assert.equal(result.needsAction, false);
});
