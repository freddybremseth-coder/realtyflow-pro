/**
 * Phase 6 — Experiment Engine-adapter (bak DI, byggetrygg) + Hardening 1.1.
 *
 * Persisterer mot EKSISTERENDE public.social_growth_experiments — ikke et
 * parallelt system. Varianter + metrics + genome lever i evidence-jsonb.
 *
 * Hardening: (3) needs_more_data holder status "running" (stopper ikke en test
 * som trenger mer data); (4) en klar vinner mates til Learning som eget
 * EVIDENCE-signal (marketing_experiment_evidence) — ikke som syntetisk content
 * som dobbelttelller revenue; (5) feil i tilbakeføringen svelges ikke: logges
 * med experimentId, eksponeres som fedToLearning:false og publiseres som
 * observability-hendelse; (6) start valideres og låses (fingeravtrykk).
 */

import { insertRevenueEvent, type RevenueEventsSupabaseLike } from "@/lib/revenue/events";
import {
  evaluateExperiment,
  experimentEvidence,
  structuralFingerprint,
  validateExperimentDefinition,
  type ExperimentDefinition,
  type ExperimentResult,
} from "@/lib/marketing/experiment";
import type { ExperimentEvidence } from "@/lib/marketing/learning";
import { channelLearningScope } from "@/lib/marketing/learning-scope";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface CreateExperimentInput {
  brandId: string;
  hypothesis: string;
  successMetric?: ExperimentDefinition["successMetric"];
  variants: ExperimentDefinition["variants"];
  controlVariantId?: string;
  minimumSampleSize?: number;
  minLift?: number;
  equalExposure?: boolean;
  autoLearnMinEvidence?: ExperimentDefinition["autoLearnMinEvidence"];
  primaryVariable?: ExperimentDefinition["primaryVariable"];
  minRuntimeHours?: number;
  platform?: string;
}

function experimentScope(brandId: string, platform: unknown): string {
  const channel = String(platform ?? "multi").trim().toLowerCase();
  return channel && channel !== "multi"
    ? channelLearningScope(brandId, channel)
    : brandId;
}

function defFromRow(row: any): ExperimentDefinition {
  const ev = row.evidence ?? {};
  const brandId = String(row.brand_id ?? "");
  return {
    experimentId: String(row.id),
    hypothesis: row.hypothesis,
    successMetric: row.success_metric ?? ev.successMetric ?? "business_value",
    variants: ev.variants ?? [],
    controlVariantId: ev.controlVariantId,
    minimumSampleSize: row.minimum_sample_size ?? 5,
    minLift: ev.minLift,
    equalExposure: ev.equalExposure,
    autoLearnMinEvidence: ev.autoLearnMinEvidence,
    primaryVariable: ev.primaryVariable,
    minRuntimeHours: ev.minRuntimeHours,
    startedAt: row.started_at ?? null,
    scope: experimentScope(brandId, row.platform),
  };
}

/** Opprett en planlagt test. Varianter/genome lagres i evidence-jsonb. */
export async function createExperiment(supabase: MarketingSupabaseLike, input: CreateExperimentInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("social_growth_experiments")
    .insert({
      brand_id: input.brandId,
      platform: input.platform ?? "multi",
      hypothesis: input.hypothesis,
      success_metric: input.successMetric ?? "business_value",
      minimum_sample_size: input.minimumSampleSize ?? 5,
      status: "planned",
      evidence: {
        successMetric: input.successMetric ?? "business_value",
        controlVariantId: input.controlVariantId,
        minLift: input.minLift,
        equalExposure: input.equalExposure,
        autoLearnMinEvidence: input.autoLearnMinEvidence,
        primaryVariable: input.primaryVariable,
        minRuntimeHours: input.minRuntimeHours,
        variants: input.variants,
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(`createExperiment failed: ${error.message}`);
  return { id: String(data.id) };
}

/** Start en test: valider guardrails, lås designet (fingeravtrykk), sett running. */
export async function startExperiment(supabase: MarketingSupabaseLike, id: string): Promise<void> {
  const { data: row, error: selErr } = await supabase.from("social_growth_experiments").select("*").eq("id", id).single();
  if (selErr || !row) throw new Error(`startExperiment: fant ikke eksperiment ${id}`);
  const def = defFromRow(row);
  const v = validateExperimentDefinition(def);
  if (!v.ok) throw new Error(`Guardrail-brudd, kan ikke starte: ${v.violations.join(" ")}`);

  const { error } = await supabase
    .from("social_growth_experiments")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      evidence: { ...(row.evidence ?? {}), designFingerprint: structuralFingerprint(def), warnings: v.warnings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`startExperiment failed: ${error.message}`);
}

async function logLearningFailure(supabase: MarketingSupabaseLike, id: string, brandId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[experiment ${id}] læringssignal feilet: ${message}`);
  try {
    await insertRevenueEvent(supabase as RevenueEventsSupabaseLike, {
      eventType: "note",
      actorType: "system",
      brandId,
      title: "Experiment learning-feedback feilet",
      metadata: { observability: true, experiment_id: id, correlation_id: `experiment:${id}`, error: message },
    });
  } catch {
    /* observability best-effort — original feil er allerede logget */
  }
}

/**
 * Evaluér en løpende test og skriv resultatet tilbake.
 *  - needs_more_data → behold status "running" (ikke stopp testen).
 *  - won/inconclusive → "evaluated" + evaluated_at.
 *  - klar vinner (>= reliable) → eget evidence-signal til Learning (idempotent,
 *    ingen revenue-dobbelttelling).
 */
export async function evaluateAndPersist(
  supabase: MarketingSupabaseLike,
  id: string,
  now: Date | string = new Date(),
): Promise<{ result: ExperimentResult; fedToLearning: boolean; error?: string; invalidated?: boolean }> {
  const { data: row, error: selErr } = await supabase.from("social_growth_experiments").select("*").eq("id", id).single();
  if (selErr || !row) throw new Error(`evaluateAndPersist: fant ikke eksperiment ${id}`);

  const def = defFromRow(row);

  // Guardrail (punkt 6): designet skal ikke ha endret seg etter start.
  const lockedFp = row.evidence?.designFingerprint as string | undefined;
  if (lockedFp && structuralFingerprint(def) !== lockedFp) {
    await supabase.from("social_growth_experiments").update({
      status: "cancelled",
      result: "inconclusive",
      evidence: { ...(row.evidence ?? {}), invalidated: "design endret etter start" },
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    throw new Error(`evaluateAndPersist: testdesign endret etter start — testen er invalidert (${id}).`);
  }

  const result = evaluateExperiment(def, now);
  const brandId = row.brand_id as string;
  const isFinal = result.outcome !== "needs_more_data";
  const winner = result.variants.find((v) => v.isWinner);

  const { error: updErr } = await supabase
    .from("social_growth_experiments")
    .update({
      status: isFinal ? "evaluated" : "running",
      result: result.outcome,
      baseline_value: result.variants.find((v) => v.isControl)?.metricPerObservation ?? null,
      result_value: winner?.metricPerObservation ?? null,
      evidence: { ...(row.evidence ?? {}), result },
      evaluated_at: isFinal ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw new Error(`evaluateAndPersist update failed: ${updErr.message}`);

  // Tilbakeføring til Learning: eget evidence-signal, kun ved klar vinner (>= reliable).
  const ev = experimentEvidence(def, result);
  let fedToLearning = false;
  let error: string | undefined;
  if (ev) {
    try {
      const { error: evErr } = await supabase.from("marketing_experiment_evidence").upsert(
        {
          experiment_id: id,
          brand_id: brandId,
          scope: ev.scope,
          source: "experiment",
          dimension: ev.dimension,
          tested_value: ev.value,
          success_metric: result.successMetric,
          control_value: winner ? result.variants.find((v) => v.isControl)?.metricPerObservation ?? null : null,
          variant_value: winner?.metricPerObservation ?? null,
          normalized_lift: ev.normalizedLift,
          evidence_level: ev.evidence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "experiment_id" },
      );
      if (evErr) throw new Error(evErr.message);
      fedToLearning = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await logLearningFailure(supabase, id, brandId, e);
    }
  }
  return { result, fedToLearning, error };
}

/** Last eksperiment-evidens for å slå den inn i Learning (recommendForGeneration). */
export async function loadExperimentEvidence(supabase: MarketingSupabaseLike, opts: { scope?: string } = {}): Promise<ExperimentEvidence[]> {
  let q = supabase.from("marketing_experiment_evidence").select("*");
  if (opts.scope) q = q.eq("scope", opts.scope);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({
    scope: r.scope,
    dimension: r.dimension,
    value: r.tested_value,
    normalizedLift: typeof r.normalized_lift === "number" ? r.normalized_lift : Number(r.normalized_lift) || 0,
    evidence: r.evidence_level,
    experimentId: String(r.experiment_id),
  }));
}
