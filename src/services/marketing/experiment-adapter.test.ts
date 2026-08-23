import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAndPersist, startExperiment } from "@/services/marketing/experiment-adapter";

/** Minimal fake Supabase som dekker chainene adapteret bruker. */
function makeFake(state: any) {
  const calls: any = { updates: [], upserts: [], inserts: [] };
  state.stores = state.stores ?? {};
  function make(table: string) {
    let op: string | null = null;
    let payload: any = null;
    const api: any = {
      select() { return api; },
      eq() { return api; },
      single() { return Promise.resolve(resolveSingle()); },
      maybeSingle() { return Promise.resolve(resolveSingle()); },
      insert(p: any) { op = "insert"; payload = p; calls.inserts.push({ table, p }); return api; },
      update(p: any) { op = "update"; payload = p; calls.updates.push({ table, p }); return api; },
      upsert(p: any, o: any) {
        op = "upsert"; payload = p; calls.upserts.push({ table, p, o });
        if (o?.onConflict && !state.failEvidence) (state.stores[table] ??= new Map()).set(p[o.onConflict], p);
        return api;
      },
      then(res: any, rej: any) { return Promise.resolve(resolveWrite()).then(res, rej); },
    };
    function resolveSingle() {
      if (op === "insert" && table === "revenue_events") return { data: { id: "rev1" }, error: null };
      const row = state.rows?.[table];
      return row ? { data: row, error: null } : { data: null, error: { message: "not found" } };
    }
    function resolveWrite() {
      if (op === "upsert" && table === "marketing_experiment_evidence" && state.failEvidence) return { error: { message: "boom" } };
      return { error: null };
    }
    return api;
  }
  return { supabase: { from: make } as any, calls, state };
}

const wonRow = () => ({
  id: "exp1", brand_id: "b1", hypothesis: "price_first vinner", success_metric: "business_value",
  minimum_sample_size: 5, started_at: "2026-08-01T10:00:00Z",
  evidence: {
    successMetric: "business_value", controlVariantId: "A", primaryVariable: "hookType",
    variants: [
      { variantId: "A", genome: { brandId: "b1", channel: "instagram", format: "reel", hookType: "question" }, metrics: { leads: 10 }, sample: 30 },
      { variantId: "B", genome: { brandId: "b1", channel: "instagram", format: "reel", hookType: "price_first" }, metrics: { leads: 40, qualifiedLeads: 20 }, sample: 30 },
    ],
  },
});

test("needs_more_data holder status running og setter ikke evaluated_at", async () => {
  const row = wonRow();
  row.evidence.variants = row.evidence.variants.map((v: any) => ({ ...v, sample: 2 }));
  const { supabase, calls } = makeFake({ rows: { social_growth_experiments: row } });
  const res = await evaluateAndPersist(supabase, "exp1");
  assert.equal(res.result.outcome, "needs_more_data");
  const upd = calls.updates.find((u: any) => u.table === "social_growth_experiments")!;
  assert.equal(upd.p.status, "running");
  assert.equal(upd.p.evaluated_at, null);
  assert.equal(res.fedToLearning, false);
});

test("won → evaluated, mater learning-evidens (ikke syntetisk content)", async () => {
  const { supabase, calls, state } = makeFake({ rows: { social_growth_experiments: wonRow() } });
  const res = await evaluateAndPersist(supabase, "exp1");
  assert.equal(res.result.outcome, "won");
  assert.equal(res.fedToLearning, true);
  const upd = calls.updates.find((u: any) => u.table === "social_growth_experiments")!;
  assert.equal(upd.p.status, "evaluated");
  assert.ok(upd.p.evaluated_at);
  // Evidens skrevet til evidence-tabellen, IKKE til marketing_content/marketing_events.
  assert.ok(calls.upserts.some((u: any) => u.table === "marketing_experiment_evidence"));
  assert.ok(!calls.upserts.some((u: any) => u.table === "marketing_content"));
  assert.ok(!calls.inserts.some((i: any) => i.table === "marketing_events"));
  const ev = calls.upserts.find((u: any) => u.table === "marketing_experiment_evidence")!;
  assert.equal(ev.p.dimension, "hookType");
  assert.equal(ev.p.tested_value, "price_first");
  assert.equal(ev.o.onConflict, "experiment_id");
});

test("gjentatt evaluering dupliserer ikke learning-evidens (idempotent)", async () => {
  const { supabase, state } = makeFake({ rows: { social_growth_experiments: wonRow() } });
  await evaluateAndPersist(supabase, "exp1");
  await evaluateAndPersist(supabase, "exp1");
  assert.equal(state.stores["marketing_experiment_evidence"].size, 1); // én rad, ikke to
});

test("learning-feedback-feil svelges ikke: fedToLearning=false + observability-event", async () => {
  const { supabase, calls } = makeFake({ rows: { social_growth_experiments: wonRow() }, failEvidence: true });
  const res = await evaluateAndPersist(supabase, "exp1");
  assert.equal(res.fedToLearning, false);
  assert.ok(res.error && res.error.includes("boom"));
  // Resultatet ble likevel lagret …
  assert.ok(calls.updates.some((u: any) => u.table === "social_growth_experiments" && u.p.status === "evaluated"));
  // … og feilen ble eksponert som observability-hendelse.
  const obs = calls.inserts.find((i: any) => i.table === "revenue_events");
  assert.ok(obs && obs.p.metadata?.observability === true && obs.p.metadata?.experiment_id === "exp1");
});

test("design endret etter start → invalidert (cancelled) + kaster", async () => {
  const row = wonRow();
  (row.evidence as any).designFingerprint = "STALE_FINGERPRINT_FROM_START";
  const { supabase, calls } = makeFake({ rows: { social_growth_experiments: row } });
  await assert.rejects(() => evaluateAndPersist(supabase, "exp1"), /invalidert/);
  assert.ok(calls.updates.some((u: any) => u.table === "social_growth_experiments" && u.p.status === "cancelled"));
});

test("startExperiment håndhever guardrails (ulik kanal uten primaryVariable=channel)", async () => {
  const row = {
    id: "exp2", brand_id: "b1", hypothesis: "h", success_metric: "business_value", minimum_sample_size: 5, started_at: null,
    evidence: {
      controlVariantId: "A", primaryVariable: "hookType",
      variants: [
        { variantId: "A", genome: { brandId: "b1", channel: "instagram", format: "reel", hookType: "question" }, metrics: {}, sample: 5 },
        { variantId: "B", genome: { brandId: "b1", channel: "youtube", format: "reel", hookType: "price_first" }, metrics: {}, sample: 5 },
      ],
    },
  };
  const { supabase } = makeFake({ rows: { social_growth_experiments: row } });
  await assert.rejects(() => startExperiment(supabase, "exp2"), /Guardrail-brudd/);
});
