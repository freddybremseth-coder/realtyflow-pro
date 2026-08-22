import assert from "node:assert/strict";
import test from "node:test";
import { ToolRegistry, type ToolContext } from "@/lib/agentic/tool-registry";
import {
  applyHardFilters,
  buildFindPropertiesTool,
  type PropertyCandidate,
} from "@/services/tools/property/find-properties";
import { buildCreateDraftTool } from "@/services/tools/communications/create-draft";
import { buildRequestApprovalTool } from "@/services/tools/crm/request-approval";
import {
  recordApprovalOutcome,
  runLeadIntake,
  type ExtractionResult,
  type LeadIntakeDeps,
  type RawInquiry,
  type WorkflowEvent,
} from "@/services/workflows/lead-intake";
import type { AgentRun } from "@/lib/agentic/schemas";

const INVENTORY: PropertyCandidate[] = [
  { id: "p1", title: "Villa Albir", priceEur: 420_000, area: "Albir", propertyType: "villa", bedrooms: 3 },
  { id: "p2", title: "Apartment Finestrat", priceEur: 380_000, area: "Finestrat", propertyType: "apartment", bedrooms: 2 },
  { id: "p3", title: "Villa Polop", priceEur: 595_000, area: "Polop", propertyType: "villa", bedrooms: 4 },
  { id: "p4", title: "Townhouse Albir", priceEur: 445_000, area: "Albir", propertyType: "townhouse", bedrooms: 3 },
  { id: "p5", title: "Ukjent pris", priceEur: null, area: "Albir" },
];

const PROFILE = { budgetMaxEur: 450_000, areas: ["Albir", "Finestrat"], bedroomsMin: 2, mustHaves: [], exclusions: [] };

const INQUIRY: RawInquiry = {
  externalId: "abc123",
  source: "website",
  message: "Ser etter villa i Albir, budsjett rundt 450k",
  contactName: "Harald",
  contactEmail: "harald@example.com",
};

function harness(overrides: Partial<{
  extractProfile: LeadIntakeDeps["extractProfile"];
  saveDraft: () => Promise<{ id: string }>;
  inventory: PropertyCandidate[];
  findExistingRun: (k: string) => Promise<AgentRun | null>;
}> = {}) {
  const events: WorkflowEvent[] = [];
  const drafts = new Map<string, string>();
  const approvals = new Map<string, string>();
  let seq = 0;

  const registry = new ToolRegistry();
  registry.register(buildFindPropertiesTool({ queryInventory: async () => overrides.inventory ?? INVENTORY }));
  registry.register(
    buildCreateDraftTool({
      findExisting: async (cid) => (drafts.has(cid) ? { id: drafts.get(cid)! } : null),
      saveDraft: overrides.saveDraft
        ? overrides.saveDraft
        : async (input) => {
            const id = `draft-${seq++}`;
            drafts.set(input.correlationId, id);
            return { id };
          },
    }),
  );
  registry.register(
    buildRequestApprovalTool({
      findExisting: async (cid) => (approvals.has(cid) ? { id: approvals.get(cid)! } : null),
      saveApproval: async (input) => {
        const id = `appr-${seq++}`;
        approvals.set(input.correlationId, id);
        return { id };
      },
    }),
  );

  const deps: LeadIntakeDeps = {
    registry,
    extractProfile:
      overrides.extractProfile ??
      (async () => ({ profile: { ...PROFILE }, confidence: 0.9, model: "stub", tokens: 500 } as ExtractionResult)),
    publishEvent: async (e) => {
      events.push(e);
    },
    findExistingRun: overrides.findExistingRun,
    now: () => new Date("2026-08-22T20:00:00Z"),
    genId: (() => { let n = 0; return () => `id${n++}`; })(),
  };
  return { deps, events, drafts, approvals };
}

const outcomes = (events: WorkflowEvent[]) => events.map((e) => `${e.eventType}:${e.outcome}`);

/* -------- prinsipp 7: hard filters -------- */
test("hard filters: €450k maks utelukker €595k og manglende pris", () => {
  const eligible = applyHardFilters(INVENTORY, {
    budgetMaxEur: 450_000, areas: ["Albir", "Finestrat"], exclusions: [], bedroomsMin: 2, limit: 5,
  });
  const ids = eligible.map((p) => p.id).sort();
  assert.deepEqual(ids, ["p1", "p2", "p4"]);
  assert.ok(!ids.includes("p3"), "€595k skal utelukkes");
  assert.ok(!ids.includes("p5"), "manglende pris skal utelukkes");
});

/* -------- 1. happy path -------- */
test("happy path: draft + approval + events", async () => {
  const { deps, events, drafts, approvals } = harness();
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(run.status, "waiting_approval");
  assert.equal(drafts.size, 1);
  assert.equal(approvals.size, 1);
  assert.deepEqual(outcomes(events), [
    "lead_created:recommended",
    "draft_created:executed",
    "automation_recommended:recommended",
  ]);
  // Action trace inneholder funnel + policy-beslutning, ingen CoT.
  assert.ok(run.steps.some((s) => s.label === "TOOL find_properties"));
  assert.ok(run.steps.some((s) => s.label === "POLICY send_personal" && s.decisionMode));
});

/* -------- 2. mangler budsjett -------- */
test("mangler budsjett: ingen draft, approval for avklaring", async () => {
  const { deps, events, drafts } = harness({
    extractProfile: async () => ({ profile: { ...PROFILE, budgetMaxEur: undefined }, confidence: 0.9 }),
  });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(drafts.size, 0);
  assert.equal(run.status, "waiting_approval");
  assert.ok(outcomes(events).includes("automation_recommended:recommended"));
  assert.ok(!outcomes(events).includes("draft_created:executed"));
});

/* -------- 3. ingen boligmatch -------- */
test("ingen boligmatch: ingen draft", async () => {
  const { deps, drafts, events } = harness({
    extractProfile: async () => ({ profile: { ...PROFILE, budgetMaxEur: 200_000 }, confidence: 0.9 }),
  });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(drafts.size, 0);
  assert.equal(run.status, "waiting_approval");
  assert.ok(!outcomes(events).includes("draft_created:executed"));
});

/* -------- 4. lav confidence -------- */
test("lav confidence: ingen auto-draft", async () => {
  const { deps, drafts } = harness({
    extractProfile: async () => ({ profile: { ...PROFILE }, confidence: 0.4 }),
  });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(drafts.size, 0);
  assert.equal(run.status, "waiting_approval");
});

/* -------- 5. duplikat webhook (idempotens) -------- */
test("duplikat webhook: returnerer eksisterende run, ingen nye events", async () => {
  const existing: AgentRun = { id: "lead:website:abc123", agentId: "lead-intake", goal: "", status: "waiting_approval", startedAt: "", steps: [] };
  const { deps, events } = harness({ findExistingRun: async () => existing });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(run, existing);
  assert.equal(events.length, 0);
});

test("tool-idempotens: samme correlationId gir ikke duplikat draft/approval", async () => {
  const { deps, drafts, approvals } = harness();
  await runLeadIntake(INQUIRY, deps);
  await runLeadIntake(INQUIRY, deps); // ingen findExistingRun → tools må selv deduppe
  assert.equal(drafts.size, 1);
  assert.equal(approvals.size, 1);
});

/* -------- 6. Supabase-feil -------- */
test("Supabase-feil under create_draft: run failed, ingen krasj", async () => {
  const { deps, events } = harness({
    saveDraft: async () => { throw new Error("supabase timeout"); },
  });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(run.status, "failed");
  assert.ok(outcomes(events).some((o) => o === "automation_recommended:failed"));
});

/* -------- 7. AI-provider-feil -------- */
test("AI-provider-feil under ekstraksjon: run failed", async () => {
  const { deps } = harness({
    extractProfile: async () => { throw new Error("anthropic 529 overloaded"); },
  });
  const run = await runLeadIntake(INQUIRY, deps);
  assert.equal(run.status, "failed");
  assert.ok(run.steps.some((s) => s.label === "PROFILE_EXTRACTION_FAILED"));
});

/* -------- 8. approval rejected -------- */
test("approval rejected: publiserer rejected-utfall", async () => {
  const events: WorkflowEvent[] = [];
  const ctx: ToolContext = { correlationId: "lead:website:abc123" };
  await recordApprovalOutcome({ publishEvent: async (e) => { events.push(e); } }, ctx, {
    runId: "lead:website:abc123", outcome: "rejected", title: "Avvist av megler",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].outcome, "rejected");
});
