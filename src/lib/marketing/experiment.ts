/**
 * Marketing Growth OS — Phase 6: Experiment Engine (+ Hardening 1.1).
 *
 * Fra "vi tror" til "vi vet": hypotese → varianter → måling på FORRETNINGSVERDI
 * → vinner → tilbake til Learning Engine. Vinner avgjøres på verdi PER
 * OBSERVASJON (ikke rå totaler — ellers vinner bare den armen med størst
 * sample), aldri på vanity-metrics, og aldri før det er nok evidens.
 *
 * Hardening: (1) normalisering per eksponering, (2) autonom tilbakeføring krever
 * minst `reliable` evidens, (3) needs_more_data holder testen i gang,
 * (4) eksperiment mates som eget evidence-signal (ikke syntetisk content som
 * dobbelttelller revenue), (6) guardrails før start.
 *
 * Ren logikk (DI/byggetrygg). Persistens ligger i adapteret.
 */

import type { ContentGenome } from "./genome";
import { businessValueScore, evidenceLevel, evidenceRank, type ContentMetrics, type EvidenceLevel } from "./value-score";
import { genomeDimensionValue, LEARNING_DIMENSIONS, type ExperimentEvidence, type LearningDimension } from "./learning";

/** Suksessmetrikker en test kan avgjøres på. business_value er default. */
export const EXPERIMENT_METRICS = ["business_value", "qualified_leads", "leads", "sales", "commission_eur"] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

/** Dimensjoner som må være like mellom armer for at testen skal være rettferdig. */
const COMPARABILITY_DIMENSIONS: LearningDimension[] = ["channel", "audience"];

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
  /**
   * Sammenlign rå totaler i stedet for verdi-per-observasjon. Kun trygt når
   * eksponeringen per arm er lik by design. Default false (normalisert).
   */
  equalExposure?: boolean;
  /** Minste evidensnivå for AUTONOM tilbakeføring til Learning (default reliable). */
  autoLearnMinEvidence?: EvidenceLevel;
  /** Den ene variabelen A/B-testen isolerer (guardrail: kun én ad gangen). */
  primaryVariable?: LearningDimension;
  /** Minste kjøretid før evaluering teller (guardrail mot for tidlig stopp). */
  minRuntimeHours?: number;
  /** Satt av adapteret når testen startes (for runtime-guard). */
  startedAt?: string | null;
  scope?: string;
}

export type ExperimentOutcome = "won" | "inconclusive" | "needs_more_data";

export interface VariantResult {
  variantId: string;
  label?: string;
  /** Rå total på metrikken — for rapportering. */
  metricTotal: number;
  /** Metrikk per observasjon — grunnlaget for winner-selection. */
  metricPerObservation: number;
  businessValueTotal: number;
  businessValuePerObservation: number;
  sample: number;
  isControl: boolean;
  isWinner: boolean;
  /** Normalisert løft (per observasjon) mot kontroll. */
  liftVsControl: number;
}

export interface ExperimentResult {
  experimentId: string;
  successMetric: ExperimentMetric;
  outcome: ExperimentOutcome;
  normalized: boolean;
  controlVariantId: string;
  winnerVariantId: string | null;
  /** Normalisert løft for vinneren (per observasjon). */
  winnerLift: number;
  confidence: EvidenceLevel;
  /** Oppfyller resultatet terskelen for autonom tilbakeføring til Learning? */
  canAutoLearn: boolean;
  variants: VariantResult[];
  finding: string;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function metricTotal(m: ContentMetrics, metric: ExperimentMetric): number {
  switch (metric) {
    case "business_value": return businessValueScore(m);
    case "qualified_leads": return n(m.qualifiedLeads);
    case "leads": return n(m.leads);
    case "sales": return n(m.sales);
    case "commission_eur": return n(m.commissionEur);
  }
}

// ── Guardrails (punkt 6) ───────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * Valider en testdefinisjon FØR start. Håndhever: minst 2 armer, gyldig
 * kontroll, sammenlignbare armer (samme kanal/målgruppe med mindre det er den
 * testede variabelen), og — når primaryVariable er satt — at armene skiller seg
 * KUN på den ene variabelen.
 */
export function validateExperimentDefinition(def: ExperimentDefinition): ValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  if (def.variants.length < 2) violations.push("Trenger minst 2 varianter (kontroll + utfordrer).");
  const ids = new Set(def.variants.map((v) => v.variantId));
  if (ids.size !== def.variants.length) violations.push("Variant-IDer må være unike.");

  const controlId = def.controlVariantId ?? def.variants[0]?.variantId;
  const control = def.variants.find((v) => v.variantId === controlId);
  if (def.controlVariantId && !control) violations.push(`Kontroll-variant ${def.controlVariantId} finnes ikke.`);
  if ((def.minimumSampleSize ?? 5) < 1) violations.push("minimumSampleSize må være >= 1.");

  if (control?.genome) {
    for (const chal of def.variants) {
      if (chal.variantId === controlId || !chal.genome) continue;
      const diffs = LEARNING_DIMENSIONS.filter((d) => genomeDimensionValue(control.genome!, d) !== genomeDimensionValue(chal.genome!, d));
      // Sammenlignbarhet: samme kanal/målgruppe med mindre det er selve testvariabelen.
      for (const cmp of COMPARABILITY_DIMENSIONS) {
        if (def.primaryVariable === cmp) continue;
        if (genomeDimensionValue(control.genome!, cmp) !== genomeDimensionValue(chal.genome!, cmp)) {
          violations.push(`Armene har ulik ${cmp} (${chal.variantId}) — ikke sammenlignbart. Sett primaryVariable=${cmp} hvis det er tilsiktet.`);
        }
      }
      if (def.primaryVariable) {
        const offVar = diffs.filter((d) => d !== def.primaryVariable);
        if (!diffs.includes(def.primaryVariable)) violations.push(`${chal.variantId} skiller seg ikke på primærvariabelen ${def.primaryVariable}.`);
        if (offVar.length > 0) violations.push(`${chal.variantId} endrer flere variabler enn primærvariabelen: ${offVar.join(", ")}.`);
      } else if (diffs.length > 1) {
        warnings.push(`${chal.variantId} skiller seg på ${diffs.length} dimensjoner (${diffs.join(", ")}) — vurder primaryVariable for ren A/B.`);
      }
    }
  }

  return { ok: violations.length === 0, violations, warnings };
}

/**
 * Strukturelt fingeravtrykk av testDESIGNET (hypotese, metrikk, arm-IDer +
 * genome, kontroll, primærvariabel) — IKKE metrics/sample (som er data testen
 * samler). Endres dette etter start, er testen invalidert (punkt 6).
 */
export function structuralFingerprint(def: ExperimentDefinition): string {
  const arms = [...def.variants]
    .map((v) => `${v.variantId}:${v.genome ? JSON.stringify(sortedGenome(v.genome)) : ""}`)
    .sort()
    .join("|");
  return [def.hypothesis.trim(), def.successMetric ?? "business_value", def.controlVariantId ?? "", def.primaryVariable ?? "", arms].join("§");
}

function sortedGenome(g: ContentGenome): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(g).sort()) out[k] = (g as Record<string, unknown>)[k];
  return out;
}

// ── Evaluering (punkt 1 + 2 + 3) ───────────────────────────────────────────

/**
 * Evaluér en test. Kårer vinner på metrikk PER OBSERVASJON (med mindre
 * equalExposure), holder igjen til nok evidens (needs_more_data) og til minste
 * kjøretid er nådd, og krever et reelt løft over kontroll.
 */
export function evaluateExperiment(def: ExperimentDefinition, now: Date | string = new Date()): ExperimentResult {
  if (def.variants.length < 2) throw new Error("Et eksperiment trenger minst 2 varianter");
  const metric = def.successMetric ?? "business_value";
  const minSample = def.minimumSampleSize ?? 5;
  const minLift = def.minLift ?? 1.1;
  const normalized = !def.equalExposure;
  const autoLearnMin = def.autoLearnMinEvidence ?? "reliable";
  const controlId = def.controlVariantId ?? def.variants[0].variantId;
  const control = def.variants.find((v) => v.variantId === controlId) ?? def.variants[0];

  // Sammenligningsverdi = per observasjon (default) eller total (equalExposure).
  const cmp = (v: ExperimentVariant) => {
    const total = metricTotal(v.metrics, metric);
    return normalized ? (v.sample > 0 ? total / v.sample : 0) : total;
  };
  const controlCmp = cmp(control);
  const best = def.variants.reduce((a, b) => (cmp(b) > cmp(a) ? b : a));
  const bestCmp = cmp(best);
  const winnerLift = controlCmp > 0 ? Number((bestCmp / controlCmp).toFixed(2)) : bestCmp > 0 ? Infinity : 0;

  const minObserved = Math.min(...def.variants.map((v) => v.sample));
  const confidence = evidenceLevel(minObserved);

  // Runtime-guard: ikke konkluder før minste kjøretid er nådd.
  let runtimeOk = true;
  if (def.minRuntimeHours && def.startedAt) {
    const elapsedH = (new Date(now).getTime() - new Date(def.startedAt).getTime()) / 3_600_000;
    runtimeOk = elapsedH >= def.minRuntimeHours;
  }
  const enoughEvidence = minObserved >= minSample && confidence !== "insufficient" && runtimeOk;

  let outcome: ExperimentOutcome;
  let winnerVariantId: string | null;
  if (!enoughEvidence) {
    outcome = "needs_more_data";
    winnerVariantId = null;
  } else if (best.variantId !== controlId && winnerLift >= minLift) {
    outcome = "won";
    winnerVariantId = best.variantId;
  } else if (best.variantId === controlId && def.variants.some((v) => v.variantId !== controlId && controlCmp > 0 && cmp(v) / controlCmp <= 1 / minLift)) {
    outcome = "won";
    winnerVariantId = controlId;
  } else {
    outcome = "inconclusive";
    winnerVariantId = null;
  }

  // Autonom tilbakeføring krever minst `reliable` (punkt 2).
  const canAutoLearn = outcome === "won" && evidenceRank(confidence) >= evidenceRank(autoLearnMin);

  const variants: VariantResult[] = def.variants.map((v) => {
    const total = metricTotal(v.metrics, metric);
    const per = v.sample > 0 ? Number((total / v.sample).toFixed(4)) : 0;
    const vCmp = normalized ? per : total;
    return {
      variantId: v.variantId,
      label: v.label,
      metricTotal: total,
      metricPerObservation: per,
      businessValueTotal: businessValueScore(v.metrics),
      businessValuePerObservation: v.sample > 0 ? Number((businessValueScore(v.metrics) / v.sample).toFixed(2)) : 0,
      sample: v.sample,
      isControl: v.variantId === controlId,
      isWinner: v.variantId === winnerVariantId,
      liftVsControl: controlCmp > 0 ? Number((vCmp / controlCmp).toFixed(2)) : vCmp > 0 ? Infinity : 1,
    };
  });

  return {
    experimentId: def.experimentId,
    successMetric: metric,
    outcome,
    normalized,
    controlVariantId: controlId,
    winnerVariantId,
    winnerLift: outcome === "won" ? winnerLift : 0,
    confidence,
    canAutoLearn,
    variants,
    finding: buildFinding(def, metric, outcome, winnerVariantId, winnerLift, confidence, minObserved, canAutoLearn, runtimeOk),
  };
}

function buildFinding(
  def: ExperimentDefinition,
  metric: ExperimentMetric,
  outcome: ExperimentOutcome,
  winnerId: string | null,
  lift: number,
  confidence: EvidenceLevel,
  minObserved: number,
  canAutoLearn: boolean,
  runtimeOk: boolean,
): string {
  if (outcome === "needs_more_data") {
    const why = !runtimeOk ? "minste kjøretid ikke nådd" : `minste arm ${minObserved} obs (${confidence})`;
    return `⏳ Trenger mer data (${why}) — «${def.hypothesis}»`;
  }
  if (outcome === "inconclusive") return `➖ Uavklart på ${metric}/obs — ingen variant slår kontroll nok. «${def.hypothesis}»`;
  const w = def.variants.find((v) => v.variantId === winnerId);
  const liftTxt = Number.isFinite(lift) ? `${lift.toFixed(2)}×` : "∞";
  const learn = canAutoLearn ? "autonomt" : "kun signal (under reliable)";
  return `🏆 Vinner: ${w?.label ?? winnerId} (${liftTxt} kontroll per obs, ${confidence}, ${learn}) — «${def.hypothesis}»`;
}

// ── Tilbakeføring til Learning (punkt 4) ───────────────────────────────────

/**
 * Bygg eksperiment-EVIDENCE (ikke syntetisk content): et troverdighets-signal
 * om den testede dimensjonen + normalisert løft. Returnerer null hvis testen
 * ikke oppfyller terskelen for autonom tilbakeføring (canAutoLearn). Rører
 * ALDRI revenue-totaler — så vinnerens performance telles aldri to ganger.
 */
export function experimentEvidence(def: ExperimentDefinition, result: ExperimentResult): ExperimentEvidence | null {
  if (!result.canAutoLearn || !result.winnerVariantId) return null;
  const winner = def.variants.find((v) => v.variantId === result.winnerVariantId);
  const control = def.variants.find((v) => v.variantId === result.controlVariantId);
  if (!winner?.genome) return null;

  // Den testede dimensjonen = primaryVariable, ellers den som skiller vinner fra kontroll.
  let dimension = def.primaryVariable;
  if (!dimension && control?.genome) {
    dimension = LEARNING_DIMENSIONS.find((d) => genomeDimensionValue(control.genome!, d) !== genomeDimensionValue(winner.genome!, d));
  }
  if (!dimension) return null;
  const value = genomeDimensionValue(winner.genome, dimension);
  if (!value) return null;

  return {
    scope: def.scope ?? "global",
    dimension,
    value,
    normalizedLift: result.winnerLift,
    evidence: result.confidence,
    experimentId: def.experimentId,
  };
}
