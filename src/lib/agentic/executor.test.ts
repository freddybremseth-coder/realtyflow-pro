import assert from "node:assert/strict";
import test from "node:test";
import { executeApproval, type ExecutorDeps, type ExecutorStore, type GatewayExecutedEvent } from "@/lib/agentic/executor";
import type { ApprovalItem } from "@/lib/agentic/approval-gateway";

function setup(itemOver: Partial<ApprovalItem> = {}, opts: { sendFails?: boolean; dryRun?: boolean; hasDraft?: boolean } = {}) {
  const item: ApprovalItem = {
    id: "a1", runId: "run_1", title: "Send oppfølging", gatedActionClass: "send_personal",
    subjectType: "message_draft", subjectRef: "d1", draftId: "d1", status: "approved",
    risk: "high", estimatedOpportunityEur: 14000, ...itemOver,
  };
  const events: GatewayExecutedEvent[] = [];
  let executed: { at: string; detail: string; by: string } | null = null;
  const store: ExecutorStore = {
    get: async () => (executed ? { ...item, status: "executed" } : { ...item }),
    getDraft: async () => (opts.hasDraft === false ? null : { id: "d1", contactRef: "kunde@example.com", subject: "Hei", body: "Tekst" }),
    markExecuted: async (_id, at, detail, by) => { executed = { at, detail, by }; },
  };
  const deps: ExecutorDeps = {
    store,
    sender: { sendEmail: async ({ to }) => { if (opts.sendFails) throw new Error("smtp nede"); return { detail: `msg-1 → ${to}`, dryRun: opts.dryRun ?? true }; } },
    publishEvent: async (e) => { events.push(e); },
    now: () => new Date("2026-08-23T22:00:00Z"),
  };
  return { deps, events, getExecuted: () => executed };
}

test("approved → executed (dry-run), publiserer executed-utfall", async () => {
  const { deps, events, getExecuted } = setup();
  const res = await executeApproval(deps, { id: "a1", executedBy: "system" });
  assert.equal(res.ok, true);
  assert.equal(res.executed, true);
  assert.match(res.detail ?? "", /DRY-RUN/);
  assert.ok(getExecuted());
  assert.equal(events[0].outcome, "executed");
});

test("live-modus (dryRun=false) gir ekte send-detalj", async () => {
  const { deps } = setup({}, { dryRun: false });
  const res = await executeApproval(deps, { id: "a1", executedBy: "system" });
  assert.match(res.detail ?? "", /E-post sendt/);
});

test("idempotent: allerede executed → skip, ingen event", async () => {
  const { deps, events } = setup({ status: "executed" });
  const res = await executeApproval(deps, { id: "a1", executedBy: "system" });
  assert.equal(res.alreadyExecuted, true);
  assert.equal(events.length, 0);
});

test("ikke godkjent (pending) → feil, utfører ikke", async () => {
  const { deps, getExecuted } = setup({ status: "pending" });
  const res = await executeApproval(deps, { id: "a1", executedBy: "system" });
  assert.equal(res.ok, false);
  assert.equal(getExecuted(), null);
});

test("ukjent handlingsklasse → skipped", async () => {
  const { deps } = setup({ gatedActionClass: "price_change" });
  const res = await executeApproval(deps, { id: "a1", executedBy: "system" });
  assert.equal(res.skipped, true);
});

test("send feiler → ok=false, ikke markert executed", async () => {
  const { deps, getExecuted } = setup({}, { sendFails: true });
  const res = await executeApproval(deps, { id: "a1", executedBy: "system" });
  assert.equal(res.ok, false);
  assert.equal(getExecuted(), null);
});

test("mangler utkast → feil", async () => {
  const { deps } = setup({}, { hasDraft: false });
  const res = await executeApproval(deps, { id: "a1", executedBy: "system" });
  assert.equal(res.ok, false);
});
