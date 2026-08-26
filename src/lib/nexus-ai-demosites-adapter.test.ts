import assert from "node:assert/strict";
import { test } from "node:test";
import { demoSiteOrderToAiOpportunity, type DemoSiteEventInput, type DemoSiteOrderInput } from "@/lib/nexus-ai-demosites-adapter";

function order(overrides: Partial<DemoSiteOrderInput> = {}): DemoSiteOrderInput {
  return {
    id: "demo-1",
    status: "preview_ready",
    billing_status: "not_invoiced",
    customer_name: "Ada",
    company_name: "Ada AS",
    package_id: "standard",
    setup_fee_nok: 9900,
    monthly_fee_nok: 990,
    currency: "NOK",
    created_at: "2026-08-25T10:00:00Z",
    updated_at: "2026-08-26T10:00:00Z",
    ...overrides,
  };
}

function event(event_type: string, overrides: Partial<DemoSiteEventInput> = {}): DemoSiteEventInput {
  return { order_id: "demo-1", event_type, created_at: "2026-08-26T10:30:00Z", ...overrides };
}

test("preview_ready maps to AI demo/solution, never real-estate viewing", () => {
  const opportunity = demoSiteOrderToAiOpportunity(order(), []);
  assert.ok(opportunity);
  assert.equal(opportunity.pipelineId, "ai_products_services");
  assert.equal(opportunity.stageId, "demo_or_solution");
});

test("real demo inquiry makes a preview materially hotter and requests personal follow-up", () => {
  const normal = demoSiteOrderToAiOpportunity(order(), []);
  const hot = demoSiteOrderToAiOpportunity(order(), [event("demo_inquiry")]);
  assert.ok(normal && hot);
  assert.ok(hot.priorityScore > normal.priorityScore);
  assert.match(hot.reason || "", /ekte kundehenvendelse/i);
  assert.match(hot.nextAction, /kontakt kunden personlig/i);
});

test("claimed demo moves into proposal/pilot closing stage", () => {
  const opportunity = demoSiteOrderToAiOpportunity(order({ status: "approved", claimed_at: "2026-08-26T11:00:00Z" }), [event("demo_claimed")]);
  assert.equal(opportunity?.stageId, "proposal_or_pilot");
  assert.match(opportunity?.nextAction || "", /closer/i);
});

test("checkout started is a high-priority proposal/pilot opportunity", () => {
  const opportunity = demoSiteOrderToAiOpportunity(order({ billing_status: "pending" }), [event("demo_checkout_started")]);
  assert.equal(opportunity?.stageId, "proposal_or_pilot");
  assert.ok((opportunity?.priorityScore || 0) >= 90);
});

test("paid or deployed order maps to won and Customer Success-compatible delivery phase", () => {
  const opportunity = demoSiteOrderToAiOpportunity(order({ status: "deployed", billing_status: "paid" }), [event("payment_paid")]);
  assert.equal(opportunity?.stageId, "won");
  assert.equal(opportunity?.phase, "delivery");
  assert.match(opportunity?.nextAction || "", /onboarding|retention/i);
});

test("existing automatic follow-up events do not create a second send instruction", () => {
  const opportunity = demoSiteOrderToAiOpportunity(order(), [event("demo_followup_sent")]);
  assert.ok(opportunity);
  assert.doesNotMatch(opportunity.nextAction, /send e-post|send email|send follow-up/i);
});
