import assert from "node:assert/strict";
import test from "node:test";
import { decideAutonomy } from "@/lib/agentic/policy-engine";
import type { ActionContext } from "@/lib/agentic/schemas";

const base: Partial<ActionContext> = {
  agentId: "test",
  agentConfidence: 95,
  historicalAccuracy: 0.95,
  dataQuality: 0.9,
  reversibility: "reversible",
  permission: "allowed",
};

test("klassifisere lead → live (auto)", () => {
  const d = decideAutonomy({ ...base, actionClass: "classify", recipients: 1 } as ActionContext);
  assert.equal(d.mode, "live");
  assert.equal(d.risk, "low");
});

test("legge CRM-tag → live (auto)", () => {
  const d = decideAutonomy({ ...base, actionClass: "tag", recipients: 1 } as ActionContext);
  assert.equal(d.mode, "live");
});

test("finne boliger → live (auto)", () => {
  const d = decideAutonomy({ ...base, actionClass: "match", agentConfidence: 91 } as ActionContext);
  assert.equal(d.mode, "live");
});

test("lage kundemail → draft-first", () => {
  const d = decideAutonomy({ ...base, actionClass: "draft", channel: "email", involvesPersonalData: true, agentConfidence: 93 } as ActionContext);
  assert.equal(d.mode, "draft-first");
});

test("500-personers kampanje → manual-review (approval)", () => {
  const d = decideAutonomy({ ...base, actionClass: "send_bulk", channel: "email", recipients: 500, agentConfidence: 98 } as ActionContext);
  assert.equal(d.mode, "manual-review");
});

test("endre pris → alltid menneske", () => {
  const d = decideAutonomy({ ...base, actionClass: "price_change", agentConfidence: 99 } as ActionContext);
  assert.equal(d.mode, "human-required");
  assert.equal(d.risk, "critical");
  assert.ok(d.hardGate);
});

test("godta bud → alltid menneske", () => {
  const d = decideAutonomy({ ...base, actionClass: "offer_response", agentConfidence: 99.9, financialImpactEur: 4_800_000 } as ActionContext);
  assert.equal(d.mode, "human-required");
});

test("forbudt handling → human-required uansett score", () => {
  const d = decideAutonomy({ ...base, actionClass: "draft", permission: "forbidden" } as ActionContext);
  assert.equal(d.mode, "human-required");
});

test("høy confidence overstyrer ikke lav reversibilitet + høy risiko", () => {
  const d = decideAutonomy({
    ...base,
    actionClass: "publish_listing",
    agentConfidence: 99,
    reversibility: "irreversible",
    recipients: 1,
    channel: "portal",
    financialImpactEur: 60_000,
  } as ActionContext);
  assert.notEqual(d.mode, "live");
});
