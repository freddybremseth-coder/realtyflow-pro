import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAgentRunStore } from "@/lib/agentic/run-store";
import { ToolRegistry, type ToolContext } from "@/lib/agentic/tool-registry";
import {
  applyHardFilters,
  buildFindPropertiesTool,
  type PropertyCandidate,
} from "@/services/tools/property/find-properties";
import { buildCreateDraftTool } from "@/services/tools/communications/create-draft";
import { buildRequestApprovalTool, type RequestApprovalInput } from "@/services/tools/crm/request-approval";
import { buildSaveBuyerProfileTool } from "@/services/tools/crm/save-buyer-profile";
import {
  recordApprovalOutcome,
  runLeadIntake,
  type ExtractionResult,
  type LeadIntakeDeps,
  type RawInquiry,
  type WorkflowEvent,
} from "@/services/workflows/lead-intake";

const INVENTORY: PropertyCandidate[] = [
  { id: "p1", title: "Villa Albir", priceEur: 420_000, area: "Albir", propertyType: "villa", bedrooms: 3 },
  { id: "p2", title: "Apartment Finestrat", priceEur: 380_000, area: "Finestrat", propertyType: "apartment", bedrooms: 2 },
  { id: "p3", title: "Villa Polop", priceEur: 595_000, area: "Polop", propertyType: "villa", bedrooms: 4 },
  { id: "p4", title: "Townhouse Albir", priceEur: 445_000, area: "Albir", propertyType: "townhouse", bedrooms: 3 },
  { id: "p5", title: "Ukjent pris", priceEur: null, area: "Albir" },
];

const PROFILE = { budgetMaxEur: 450_000, areas: ["Albir", "Finestrat"], bedroomsMin: 2, mustHaves: [], exclusions: [] };
const INQUIRY: RawInquiry = { externalId: "abc123", source: "website", message: "Villa i Albir, budsjett 450k", contactName: "Harald", contactEmail: "harald@example.com" };

function harness(overrides: Partial<{
  extractProfile: LeadIntakeDeps["extractProfile"];
  saveDraft: () => Promise<{ id: string }>;
  inventory: PropertyCandidate[];
  role: LeadIntakeDeps["role"];
}> = {}) {
  const events: WorkflowEvent[] = [];
  const drafts = new Map<string, string>();
  const approvals = new Map<string, string>();
  const profiles = new Map<string, { id: string; version: number; status: string }>();
  const savedApprovals: RequestApprovalInput[] = [];
  let seq = 0;

  const registry = new ToolRegistry();
  registry.register(buildFindPropertiesTool({ queryInventory: async () => overrides.inventory ?? INVENTORY }));
  registry.register(buildCreateDraftTool({
    findExisting: async (k) => (drafts.has(k) ? { id: drafts.get(k)! } : null),
    saveDraft: overrides.saveDraft ? overrides.saveDraft : async (input) => { const id = `draft-${seq++}`; drafts.set(input.idempotencyKey, id); return { id }; },
  }));
  registry.register(buildRequestApprovalTool({
    findExisting: async (k) => (approvals.has(k) ? { id: approvals.get(k)! } : null),
    saveApproval: async (input) => { const id = `appr-${seq++}`; approvals.set(input.idempotencyKey, id); savedApprovals.push(input); return { id }; },
  }));
  registry.register(buildSaveBuyerProfileTool({
    findExisting: async (k) => profiles.get(k) ?? null,
    saveProfile: async (input) => { const rec = { id: `bp-${seq++}`, version: 1, status: input.status }; profiles.set(input.idempotencyKey, rec); return rec; },
  }));

  const runStore = new InMemoryAgentRunStore();
  const deps: LeadIntakeDeps = {
    registry,
    runStore,
    role: overrides.role ?? "OWNER",
    extractProfile: overrides.extractProfile ?? (async () => ({ profile: { ...PROFILE }, confidence: 0.9, model: "stub", tokens: 500 } as ExtractionResult)),
    publishEvent: async (e) => { events.push(e); },
    now: () => new Date("2026-08-23T20:00:00Z"),
  };
  return { deps, registry, runStore, events, drafts, approvals, profiles, savedApprovals };
}

const outcomes = (events: WorkflowEvent[]) => events.map((e) => `${e.eventType}:${e.outcome}`);
const draftCtx = (over: Partial<ToolContext> = {}): ToolContext => ({ role: "OWNER", correlationId: "rf_x", ...over });
const draftInput = (over: Record<string, unknown> = {}) => ({ correlationId: "rf_x", idempotencyKey: "K1", body: "hei", ...over });

/* -------- prinsipp 7 -------- */
test("hard filters: €450k utelukker €595k og manglende pris", () => {
  const eligible = applyHardFilters(INVENTORY, { budgetMaxEur: 450_000, areas: ["Albir", "Finestrat"], exclusions: [], bedroomsMin: 2, limit: 5 });
  assert.deepEqual(eligible.map((p) => p.id).sort(), ["p1", "p2", "p4"]);
});

/* -------- 1. happy path -------- */
test("happy path: profil + draft + approval + events + persistert run", async () => {
  const { deps, events, drafts, approvals, profiles, runStore } = harness();
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(run.status, "waiting_approval");
  assert.equal(run.outcome, "recommended");
  assert.equal(profiles.size, 1);
  assert.equal(drafts.size, 1);
  assert.equal(approvals.size, 1);
  assert.deepEqual(outcomes(events), ["lead_created:recommended", "draft_created:executed", "automation_recommended:recommended"]);
  // Run er persistert og kan lastes (durabelt).
  const loaded = await runStore.load(run.id);
  assert.ok(loaded && loaded.steps.length > 0 && loaded.outcome === "recommended");
});

/* -------- 2-4. feilscenarier -------- */
test("mangler budsjett: ingen draft", async () => {
  const { deps, drafts } = harness({ extractProfile: async () => ({ profile: { ...PROFILE, budgetMaxEur: undefined }, confidence: 0.9 }) });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(drafts.size, 0);
  assert.equal(run.status, "waiting_approval");
});

test("ingen boligmatch: ingen draft", async () => {
  const { deps, drafts } = harness({ extractProfile: async () => ({ profile: { ...PROFILE, budgetMaxEur: 200_000 }, confidence: 0.9 }) });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(drafts.size, 0);
  assert.equal(run.status, "waiting_approval");
});

test("lav confidence: ingen auto-draft, profil merket needs_review", async () => {
  const { deps, drafts, profiles } = harness({ extractProfile: async () => ({ profile: { ...PROFILE }, confidence: 0.4 }) });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(drafts.size, 0);
  assert.equal(run.status, "waiting_approval");
  assert.equal([...profiles.values()][0].status, "needs_review");
});

/* -------- 5. run-level idempotens (restart-trygg) -------- */
test("duplikat webhook: samme intake gir samme run, ingen nye events", async () => {
  const { deps, events } = harness();
  const first = await runLeadIntake(INQUIRY, deps);
  const eventsAfterFirst = events.length;
  const second = await runLeadIntake(INQUIRY, deps);
  assert.equal(second.id, first.id);
  assert.equal(events.length, eventsAfterFirst); // ingen nye events
});

/* -------- punkt 4: operasjons-scoped idempotens -------- */
test("operasjons-idempotens: samme key deduppes, ulik key gir ny record", async () => {
  const { deps, drafts } = harness();
  await deps.registry.run("create_draft", draftInput({ idempotencyKey: "K1" }), draftCtx());
  await deps.registry.run("create_draft", draftInput({ idempotencyKey: "K1" }), draftCtx());
  assert.equal(drafts.size, 1, "samme key → én draft");
  await deps.registry.run("create_draft", draftInput({ idempotencyKey: "K2" }), draftCtx());
  assert.equal(drafts.size, 2, "flere drafts per run mulig med ulik key");
});

/* -------- punkt 1: permission enforcement -------- */
test("permissions: OWNER ok, VIEWER forbidden, MARKETING delvis, ingen rolle avvist", async () => {
  const { deps } = harness();
  const owner = await deps.registry.run("create_draft", draftInput(), draftCtx({ role: "OWNER" }));
  assert.equal(owner.ok, true);

  const viewer = await deps.registry.run("create_draft", draftInput({ idempotencyKey: "V" }), draftCtx({ role: "VIEWER" }));
  assert.equal(viewer.ok, false);
  assert.match(viewer.error ?? "", /FORBIDDEN/);

  const mktFind = await deps.registry.run("find_properties", { areas: [] }, draftCtx({ role: "MARKETING" }));
  assert.equal(mktFind.ok, true, "MARKETING har customers.read");
  const mktDraft = await deps.registry.run("create_draft", draftInput({ idempotencyKey: "M" }), draftCtx({ role: "MARKETING" }));
  assert.equal(mktDraft.ok, false, "MARKETING mangler communications.write");

  const noRole = await deps.registry.run("create_draft", draftInput({ idempotencyKey: "N" }), { correlationId: "x" });
  assert.equal(noRole.ok, false);
  assert.match(noRole.error ?? "", /AUTHORIZATION_REQUIRED/);
});

/* -------- punkt 3: identitets-separasjon -------- */
test("identiteter: correlationId, runId og idempotencyKey er distinkte formater", async () => {
  const { deps } = harness();
  const run = await runLeadIntake(INQUIRY, deps);
  assert.match(run.correlationId ?? "", /^rf_/);
  assert.match(run.id, /^run_/);
  assert.match(run.idempotencyKey ?? "", /^intake_/);
  assert.notEqual(run.correlationId, run.id);
  assert.notEqual(run.id, run.idempotencyKey);
});

/* -------- punkt 5: durable replay etter "restart" -------- */
test("durable replay: run + trace + outcome rekonstrueres fra store", async () => {
  const { deps, runStore } = harness();
  const run = await runLeadIntake(INQUIRY, deps);
  // Simuler restart: nytt store-oppslag, ingen runtime-objekt.
  const replay = await runStore.load(run.id);
  assert.ok(replay);
  assert.equal(replay!.outcome, "recommended");
  assert.ok(replay!.steps.some((s) => s.label === "TOOL find_properties"));
  assert.ok(replay!.steps.some((s) => s.label === "APPROVAL_CREATED"));
});

/* -------- punkt 6: approval-unifisering -------- */
test("approval-unifisering: send-approval peker til message_draft-subjekt", async () => {
  const { deps, savedApprovals, drafts } = harness();
  await runLeadIntake(INQUIRY, deps);
  const sendAppr = savedApprovals.find((a) => a.gatedActionClass === "send_personal");
  assert.ok(sendAppr);
  assert.equal(sendAppr!.subjectType, "message_draft");
  assert.equal(sendAppr!.subjectRef, [...drafts.values()][0]);
});

/* -------- 6-7. system-feil -------- */
test("Supabase-feil under create_draft: run failed", async () => {
  const { deps, events } = harness({ saveDraft: async () => { throw new Error("supabase timeout"); } });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(run.status, "failed");
  assert.equal(run.outcome, "failed");
  assert.ok(outcomes(events).some((o) => o === "automation_recommended:failed"));
});

test("AI-provider-feil under ekstraksjon: run failed", async () => {
  const { deps } = harness({ extractProfile: async () => { throw new Error("anthropic 529"); } });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(run.status, "failed");
});

/* -------- 8. approval rejected -------- */
test("approval rejected: publiserer rejected-utfall", async () => {
  const events: WorkflowEvent[] = [];
  await recordApprovalOutcome({ publishEvent: async (e) => { events.push(e); } }, { correlationId: "x" }, { runId: "run_x", outcome: "rejected", title: "Avvist" });
  assert.equal(events[0].outcome, "rejected");
});
