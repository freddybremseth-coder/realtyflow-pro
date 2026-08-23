import assert from "node:assert/strict";
import test from "node:test";
import {
  listApprovalQueue,
  resolveApproval,
  type ApprovalGatewayStore,
  type ApprovalItem,
  type GatewayOutcomeEvent,
} from "@/lib/agentic/approval-gateway";

function makeStore(items: ApprovalItem[]) {
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  const store: ApprovalGatewayStore = {
    listPending: async () => [...map.values()].filter((i) => i.status === "pending"),
    get: async (id) => (map.has(id) ? { ...map.get(id)! } : null),
    markResolved: async (id, status, resolvedBy, at) => {
      const it = map.get(id);
      if (it) { it.status = status; (it as any).resolvedBy = resolvedBy; (it as any).resolvedAt = at; }
    },
  };
  return { store, map };
}

const item = (over: Partial<ApprovalItem> = {}): ApprovalItem => ({
  id: "a1", runId: "run_1", title: "Send oppfølging", gatedActionClass: "send_personal",
  subjectType: "message_draft", subjectRef: "draft-1", status: "pending",
  risk: "high", estimatedOpportunityEur: 14000, ...over,
});

test("kø sorteres etter risiko, deretter opportunity", async () => {
  const { store } = makeStore([
    item({ id: "low", risk: "low", estimatedOpportunityEur: 5000 }),
    item({ id: "crit", risk: "critical", estimatedOpportunityEur: 1000 }),
    item({ id: "high1", risk: "high", estimatedOpportunityEur: 8000 }),
    item({ id: "high2", risk: "high", estimatedOpportunityEur: 20000 }),
  ]);
  const q = await listApprovalQueue({ store });
  assert.deepEqual(q.map((i) => i.id), ["crit", "high2", "high1", "low"]);
});

test("approve: markeres approved + publiserer approved-utfall", async () => {
  const events: GatewayOutcomeEvent[] = [];
  const { store, map } = makeStore([item()]);
  const res = await resolveApproval({ store, publishEvent: async (e) => { events.push(e); }, now: () => new Date("2026-08-23T21:00:00Z") }, { id: "a1", decision: "approve", resolvedBy: "freddy" });
  assert.equal(res.ok, true);
  assert.equal(res.status, "approved");
  assert.equal(map.get("a1")!.status, "approved");
  assert.equal(events[0].outcome, "approved");
  assert.equal(events[0].subjectType, "message_draft");
  assert.equal(events[0].subjectRef, "draft-1");
});

test("reject: markeres rejected + publiserer rejected-utfall", async () => {
  const events: GatewayOutcomeEvent[] = [];
  const { store, map } = makeStore([item()]);
  const res = await resolveApproval({ store, publishEvent: async (e) => { events.push(e); } }, { id: "a1", decision: "reject", resolvedBy: "freddy" });
  assert.equal(res.status, "rejected");
  assert.equal(map.get("a1")!.status, "rejected");
  assert.equal(events[0].outcome, "rejected");
});

test("idempotent: allerede behandlet gir ingen dobbelt-event", async () => {
  const events: GatewayOutcomeEvent[] = [];
  const { store } = makeStore([item({ status: "approved" })]);
  const res = await resolveApproval({ store, publishEvent: async (e) => { events.push(e); } }, { id: "a1", decision: "approve", resolvedBy: "x" });
  assert.equal(res.alreadyResolved, true);
  assert.equal(events.length, 0);
});

test("ukjent id: NOT_FOUND", async () => {
  const { store } = makeStore([]);
  const res = await resolveApproval({ store, publishEvent: async () => {} }, { id: "nope", decision: "approve", resolvedBy: "x" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "NOT_FOUND");
});
