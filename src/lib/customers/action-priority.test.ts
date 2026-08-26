import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerListAction } from "./action-priority";

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
    next_followup: "2026-08-27T09:00:00.000Z",
  }, now);
  const viewing = buildCustomerListAction({
    email: "buyer@example.com",
    pipeline_status: "VIEWING",
    next_followup: "2026-08-27T09:00:00.000Z",
  }, now);
  assert.ok(negotiation.score > viewing.score);
  assert.equal(negotiation.label, "Fremdrift i forhandling");
  assert.equal(viewing.label, "Følg opp visningen");
});

test("active customer without follow-up receives a high priority date action", () => {
  const result = buildCustomerListAction({ email: "buyer@example.com", pipeline_status: "CONTACT" }, now);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.label, "Sett neste oppfølging");
});

test("closed customers are not presented as active actions", () => {
  const result = buildCustomerListAction({ email: "buyer@example.com", pipeline_status: "WON" }, now);
  assert.equal(result.needsAction, false);
  assert.equal(result.priority, "LOW");
});
