/**
 * Marketing Growth OS — Phase 6: Experiment Engine.
 *
 * Fra "vi tror" til "vi vet": hypotese → varianter → måling på FORRETNINGSVERDI
 * → vinner → tilbake til Learning Engine. Vinner avgjøres på business value
 * (leads/salg >> views), aldri på vanity-metrics, og aldri før det er nok
 * evidens (needs_more_data-vakt hindrer for tidlige konklusjoner).
 *
 * Ren logikk (DI/byggetrygg). Persistens (mot eksisterende
 * social_growth_experiments) ligger i adapteret — ingen parallelt system.
 */

import type { ContentGenome } from "./genome";
import { businessValueScore, evidenceLevel, type ContentMetrics } from "./value-score";
import type { LearningObservation } from "./learning";

/** Suksessmetrikker en test kan avgjøres på. business_value er default. */
export const EXPERIMENT_METRICS = ["business_value", "qualified_leads", "leads", "sales", "commission_eur"] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

export interface ExperimentVariant {
  variantId: string;
  label?: string;
  genome?: ContentGenome | null;
  metrics: ContentMetrics;
  /** Antall uavhengige observasjoner bak varianten (innhold/konverteringer). */
  sample: number;
}

export interface ExperimentDefinition {
  experimentId: string;
  hypothesis: string;
  successMetric?: ExperimentMetric;
  variants: ExperimentVariant[];
  /** Kontroll-arm; default første variant. */
  controlVariantId?: string;
  minimumSampleSize?: number;
  /** Minste relative løft over kontroll for å kåre en vinner (default 1.1 = +10%). */
  minLift?: number;
}

export type ExperimentOutcome = "won" | "inconclusive" | "needs_more_data";

export interface VariantResult {
  variantId: string;
  label?: string;
  metricValue: number;
  businessValue: number;
  sample: number;
  isControl: boolean;
  isWinner: boolean;
  liftVsControl: number;
}

export interface ExperimentResult {
  experimentId: string;
  successMetric: ExperimentMetric;
  outcome: ExperimentOutcome;
  controlVariantId: string;
  winnerVariantId: string | null;
  winnerLift: number;
  confidence: ReturnType<typeof evidenceLevel>;
  variants: VariantResult[];
  finding: string;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function metricValue(m: ContentMetrics, metric: ExperimentMetric): number {
  switch (metric) {
    case "business_value": return businessValueScore(m);
    case "qualified_leads": return n(m.qualifiedLeads);
    case "leads": return n(m.leads);
    case "sales": return n(m.sales);
    case "commission_eur": return n(m.commissionEur);
  }
}

/**
 * Evaluér en test. Kårer vinner på suksessmetrikk, men holder igjen til det er
 * nok evidens og et reelt løft over kontroll.
 */
export function evaluateExperiment(def: ExperimentDefinition): ExperimentResult {
  if (def.variants.length < 2) throw new Error("Et eksperiment trenger minst 2 varianter");
  const metric = def.successMetric ?? "business_value";
  const minSample = def.minimumSampleSize ?? 5;
  const minLift = def.minLift ?? 1.1;
  const controlId = def.controlVariantId ?? def.variants[0].variantId;
  const control = def.variants.find((v) => v.variantId === controlId) ?? def.variants[0];
  const controlValue = metricValue(control.metrics, metric);

  // Beste variant på metrikk.
  const best = def.variants.reduce((a, b) => (metricValue(b.metrics, metric) > metricValue(a.metrics, metric) ? b : a));
  const bestValue = metricValue(best.metrics, metric);
  const winnerLift = controlValue > 0 ? Number((bestValue / controlValue).toFixed(2)) : bestValue > 0 ? Infinity : 0;

  const minObserved = Math.min(...def.variants.map((v) => v.sample));
  const confidence = evidenceLevel(minObserved);
  const enoughEvidence = minObserved >= minSample && confidence !== "insufficient";

  let outcome: ExperimentOutcome;
  let winnerVariantId: string | null;
  if (!enoughEvidence) {
    outcome = "needs_more_data";
    winnerVariantId = null;
  } else if (best.variantId !== controlId && winnerLift >= minLift) {
    outcome = "won";
    winnerVariantId = best.variantId;
  } else if (best.variantId === controlId && def.variants.some((v) => v.variantId !== controlId && controlValue > 0 && metricValue(v.metrics, metric) / controlValue <= 1 / minLift)) {
    // Kontroll slår utfordreren klart → kontroll er "vinneren" (behold nåværende).
    outcome = "won";
    winnerVariantId = controlId;
  } else {
    outcome = "inconclusive";
    winnerVariantId = null;
  }

  const variants: VariantResult[] = def.variants.map((v) => {
    const val = metricValue(v.metrics, metric);
    return {
      variantId: v.variantId,
      label: v.label,
      metricValue: val,
      businessValue: businessValueScore(v.metrics),
      sample: v.sample,
      isControl: v.variantId === controlId,
      isWinner: v.variantId === winnerVariantId,
      liftVsControl: controlValue > 0 ? Number((val / controlValue).toFixed(2)) : val > 0 ? Infinity : 1,
    };
  });

  return {
    experimentId: def.experimentId,
    successMetric: metric,
    outcome,
    controlVariantId: controlId,
    winnerVariantId,
    winnerLift: outcome === "won" ? winnerLift : 0,
    confidence,
    variants,
    finding: buildFinding(def, metric, outcome, winnerVariantId, winnerLift, confidence, minObserved),
  };
}

function buildFinding(
  def: ExperimentDefinition,
  metric: ExperimentMetric,
  outcome: ExperimentOutcome,
  winnerId: string | null,
  lift: number,
  confidence: ReturnType<typeof evidenceLevel>,
  minObserved: number,
): string {
  if (outcome === "needs_more_data") return `⏳ Trenger mer data (minste arm: ${minObserved} obs, ${confidence}) — «${def.hypothesis}»`;
  if (outcome === "inconclusive") return `➖ Uavklart på ${metric} — ingen variant slår kontroll nok. «${def.hypothesis}»`;
  const w = def.variants.find((v) => v.variantId === winnerId);
  const liftTxt = Number.isFinite(lift) ? `${lift.toFixed(2)}×` : "∞";
  return `🏆 Vinner: ${w?.label ?? winnerId} (${liftTxt} kontroll på ${metric}, ${confidence}) — «${def.hypothesis}»`;
}

/**
 * Tilbakeføring til Learning Engine: en avgjort test med vinner blir en
 * forsterkende observasjon (vinnerens genome + metrics). Uavklarte/for-tidlige
 * tester gir ingen signal — vi lærer bare av det som faktisk vant.
 */
export function experimentToLearningObservation(def: ExperimentDefinition, result: ExperimentResult): LearningObservation | null {
  if (result.outcome !== "won" || !result.winnerVariantId) return null;
  const winner = def.variants.find((v) => v.variantId === result.winnerVariantId);
  if (!winner?.genome) return null;
  return { genome: winner.genome, metrics: winner.metrics, contentId: winner.variantId };
}
