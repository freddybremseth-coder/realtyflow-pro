/**
 * Phase 6 — Experiment Engine-adapter (bak DI, byggetrygg).
 *
 * Persisterer mot EKSISTERENDE public.social_growth_experiments — ikke et
 * parallelt system. Varianter + metrics + genome lever i evidence-jsonb;
 * status/result/*_value bruker tabellens egne kolonner. Når en test kårer en
 * vinner, lukkes sløyfen: vinnerens genome upsertes som marketing_content og
 * en experiment_completed-hendelse registreres, slik at refreshLearningRules
 * teller den beviste vinneren neste gang.
 */

import {
  evaluateExperiment,
  experimentToLearningObservation,
  type ExperimentDefinition,
  type ExperimentResult,
} from "@/lib/marketing/experiment";
import { makeMarketingStore, type MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface CreateExperimentInput {
  brandId: string;
  hypothesis: string;
  successMetric?: ExperimentDefinition["successMetric"];
  variants: ExperimentDefinition["variants"];
  controlVariantId?: string;
  minimumSampleSize?: number;
  minLift?: number;
  platform?: string;
}

function defFromRow(row: any): ExperimentDefinition {
  const ev = row.evidence ?? {};
  return {
    experimentId: String(row.id),
    hypothesis: row.hypothesis,
    successMetric: row.success_metric ?? ev.successMetric ?? "business_value",
    variants: ev.variants ?? [],
    controlVariantId: ev.controlVariantId,
    minimumSampleSize: row.minimum_sample_size ?? 5,
    minLift: ev.minLift,
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
        variants: input.variants,
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(`createExperiment failed: ${error.message}`);
  return { id: String(data.id) };
}

export async function startExperiment(supabase: MarketingSupabaseLike, id: string): Promise<void> {
  const { error } = await supabase
    .from("social_growth_experiments")
    .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`startExperiment failed: ${error.message}`);
}

/**
 * Evaluér en løpende test og skriv resultatet tilbake. Ved klar vinner lukkes
 * lærings-sløyfen (upsert genome som content + experiment_completed-hendelse).
 */
export async function evaluateAndPersist(
  supabase: MarketingSupabaseLike,
  id: string,
): Promise<{ result: ExperimentResult; fedToLearning: boolean }> {
  const { data: row, error: selErr } = await supabase.from("social_growth_experiments").select("*").eq("id", id).single();
  if (selErr || !row) throw new Error(`evaluateAndPersist: fant ikke eksperiment ${id}`);

  const def = defFromRow(row);
  const result = evaluateExperiment(def);
  const brandId = row.brand_id as string;

  const winner = result.variants.find((v) => v.isWinner);
  const { error: updErr } = await supabase
    .from("social_growth_experiments")
    .update({
      status: "evaluated",
      result: result.outcome,
      baseline_value: result.variants.find((v) => v.isControl)?.metricValue ?? null,
      result_value: winner?.metricValue ?? null,
      evidence: { ...(row.evidence ?? {}), result },
      evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw new Error(`evaluateAndPersist update failed: ${updErr.message}`);

  // Tilbakeføring til Learning: kun ved klar vinner med genome.
  const obs = experimentToLearningObservation(def, result);
  let fedToLearning = false;
  if (obs) {
    const store = makeMarketingStore(supabase);
    try {
      await store.upsertContent(String(obs.contentId ?? result.winnerVariantId), brandId, obs.genome);
      await store.recordEvent({
        eventType: "experiment_completed",
        brandId,
        contentId: obs.contentId ?? result.winnerVariantId,
        channel: obs.genome.channel,
        genome: obs.genome,
        metrics: obs.metrics,
        correlationId: `experiment:${id}`,
        metadata: { experimentId: id, finding: result.finding, winnerLift: result.winnerLift },
      });
      fedToLearning = true;
    } catch {
      /* læringssignal feiler stille; resultatet er lagret */
    }
  }
  return { result, fedToLearning };
}
