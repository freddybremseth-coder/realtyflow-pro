/**
 * Phase 7 — Marketing Director. Styrer MÅL, skriver ikke alt selv.
 * Tar inn mål/merke/pipeline/inventory/learning/eksperiment-bevis/kapasitet/
 * budsjett og produserer en maskinlesbar MarketingPlan. Learning leses FØR
 * generering, men systemet eksplorerer også (70/20/10) så det ikke blir monotont.
 */

import type { GenomeRecommendation } from "../learning";
import {
  DirectorInputSchema,
  type DirectorInput,
  type ExplorationMix,
  type MarketingPlan,
} from "./schemas";

/**
 * Fordel n innhold på exploit/adjacent/experiment etter mix (summerer til n).
 * Når ukekapasiteten er minst 5, reserveres minst én adjacent og én experiment
 * slik at avrunding aldri kollapser utforskningen til ren exploit.
 */
export function allocateExploration(n: number, mix: ExplorationMix): { exploit: number; adjacent: number; experiment: number } {
  if (n <= 0) return { exploit: 0, adjacent: 0, experiment: 0 };
  const total = mix.exploit + mix.adjacent + mix.experiment || 1;
  let exploit = Math.round((n * mix.exploit) / total);
  let experiment = Math.round((n * mix.experiment) / total);
  let adjacent = Math.max(0, n - exploit - experiment);

  if (n >= 5) {
    experiment = Math.max(1, experiment);
    adjacent = Math.max(1, adjacent);
    exploit = Math.max(0, n - adjacent - experiment);
  }

  return { exploit, adjacent, experiment };
}

export interface BuildPlanOptions {
  marketingRunId: string;
  correlationId: string;
  recommendation?: GenomeRecommendation;
  explorationMix?: Partial<ExplorationMix>;
}

function canInfluenceAutopilot(input: { evidence?: string; experimentBacked?: boolean }) {
  if (input.experimentBacked) return ["promising", "reliable", "strong"].includes(String(input.evidence || ""));
  return ["reliable", "strong"].includes(String(input.evidence || ""));
}

/**
 * Bygg en MarketingPlan. exploit-buckets bruker learning-anbefalte dimensjoner;
 * adjacent utforsker naboer; experiment reserveres for kontrollerte tester.
 * Observational learning får bare påvirke exploit når evidensen er reliable/strong.
 * Svakere funn beholdes som analyse/notes, men får ikke styre autopiloten.
 */
export function buildMarketingPlan(rawInput: DirectorInput, opts: BuildPlanOptions): MarketingPlan {
  const input = DirectorInputSchema.parse(rawInput);
  const mix: ExplorationMix = { exploit: 0.7, adjacent: 0.2, experiment: 0.1, ...opts.explorationMix };
  const capacity = input.publishingCapacityPerWeek;
  const production = allocateExploration(capacity, mix);

  const rec = opts.recommendation;
  const favoredDimensions: Record<string, string> = {};
  const notes: string[] = [];
  if (rec) {
    for (const [dim, v] of Object.entries(rec.favor)) {
      if (!v) continue;
      if (canInfluenceAutopilot(v)) {
        favoredDimensions[dim] = v.value;
        notes.push(`${v.experimentBacked ? "🧪" : "📈"} favor ${dim}=${v.value} (${v.evidence}, ${v.lift}×)`);
      } else {
        notes.push(`👀 observer ${dim}=${v.value} (${v.evidence}, ${v.lift}×) — ikke nok evidens til autopilot`);
      }
    }
    notes.push(...rec.notes.slice(0, 3));
  }
  const avoidedDimensions = (rec?.avoid ?? []).map((a) => ({ dimension: a.dimension, value: a.value }));

  // Reserver eksperiment-kapasitet for uavklarte dimensjoner (adjacent utforsker).
  const plannedExperiments = production.experiment > 0 && input.goals.length > 0
    ? [{ hypothesis: `Test ny vinkel mot dagens vinner for ${input.goals[0].kind}`, primaryVariable: "hookType" }]
    : [];

  const focus = input.inventoryFocus.length ? input.inventoryFocus : input.pipelineGaps;

  return {
    marketingRunId: opts.marketingRunId,
    correlationId: opts.correlationId,
    brandId: input.brandId,
    goals: input.goals,
    focus,
    channels: input.channels,
    explorationMix: mix,
    production,
    favoredDimensions,
    avoidedDimensions,
    plannedExperiments,
    budget: input.budget,
    notes,
  };
}
