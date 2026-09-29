/**
 * Phase 7 — Marketing Director. Styrer MÅL, skriver ikke alt selv.
 * Tar inn mål/merke/pipeline/inventory/learning/eksperiment-bevis/kapasitet/
 * budsjett og produserer en maskinlesbar MarketingPlan. Learning leses FØR
 * generering, men systemet eksplorerer også (70/20/10) så det ikke blir monotont.
 */

import { outcomeTierRank, type GenomeRecommendation, type OutcomeTier } from "../learning";
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


function strongestActionableOutcome(rec?: GenomeRecommendation): OutcomeTier {
  if (!rec) return "none";
  let strongest: OutcomeTier = "none";
  for (const value of Object.values(rec.favor)) {
    if (!value || !canInfluenceAutopilot(value)) continue;
    const tier = value.outcomeTier ?? "none";
    if (outcomeTierRank(tier) > outcomeTierRank(strongest)) strongest = tier;
  }
  return strongest;
}

export function outcomeAwareExplorationMix(rec?: GenomeRecommendation): ExplorationMix {
  const tier = strongestActionableOutcome(rec);
  if (tier === "sale") return { exploit: 0.8, adjacent: 0.15, experiment: 0.05 };
  if (tier === "qualified_pipeline") return { exploit: 0.75, adjacent: 0.15, experiment: 0.1 };
  if (tier === "lead") return { exploit: 0.72, adjacent: 0.18, experiment: 0.1 };
  return { exploit: 0.7, adjacent: 0.2, experiment: 0.1 };
}

function channelWinnerShare(tier: OutcomeTier): number | null {
  if (tier === "sale") return 0.5;
  if (tier === "qualified_pipeline") return 0.4;
  if (tier === "lead") return 0.35;
  if (tier === "traffic") return 0.3;
  return null;
}

function weightedCounts<T extends string>(
  total: number,
  items: T[],
  weights: number[],
): Map<T, number> {
  const result = new Map<T, number>(items.map((item) => [item, 0]));
  if (total <= 0 || items.length === 0) return result;
  const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0) || items.length;
  const quotas = items.map((item, index) => {
    const raw = total * ((Math.max(0, weights[index] ?? 0) || (weightSum === items.length ? 1 : 0)) / weightSum);
    return { item, raw, count: Math.floor(raw), remainder: raw - Math.floor(raw), index };
  });
  let assigned = quotas.reduce((sum, quota) => sum + quota.count, 0);
  for (const quota of quotas.slice().sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (assigned >= total) break;
    quota.count += 1;
    assigned += 1;
  }

  if (total >= items.length) {
    for (const quota of quotas) {
      if (quota.count > 0) continue;
      const donor = quotas
        .filter((candidate) => candidate.count > 1)
        .sort((a, b) => b.count - a.count || a.index - b.index)[0];
      if (donor) {
        donor.count -= 1;
        quota.count = 1;
      }
    }
  }
  quotas.forEach((quota) => result.set(quota.item, quota.count));
  return result;
}

export function allocateChannelProduction(
  capacity: number,
  channels: DirectorInput["channels"],
  rec?: GenomeRecommendation,
): Array<{ channel: DirectorInput["channels"][number]; count: number; outcomeTier: OutcomeTier; reason: string }> {
  if (!channels.length) return [];
  const winner = rec?.favor.channel;
  const actionableWinner = winner && canInfluenceAutopilot(winner) && channels.includes(winner.value as DirectorInput["channels"][number])
    ? winner
    : undefined;
  const tier = actionableWinner?.outcomeTier ?? "none";
  const winnerShare = channelWinnerShare(tier);
  const weights = channels.map((channel) => {
    if (!actionableWinner || winnerShare == null) return 1;
    if (channel === actionableWinner.value) return winnerShare;
    return channels.length > 1 ? (1 - winnerShare) / (channels.length - 1) : 1;
  });
  const counts = weightedCounts(capacity, channels, weights);
  return channels.map((channel) => ({
    channel,
    count: counts.get(channel) ?? 0,
    outcomeTier: channel === actionableWinner?.value ? tier : "none",
    reason: channel === actionableWinner?.value
      ? `Dokumentert ${tier}-vinner; får større andel av ukekapasiteten.`
      : actionableWinner
        ? "Beholdes for kontrollert bredde og videre læring."
        : "Balansert produksjon mens Nexus samler sterkere outcome-evidens.",
  }));
}

/**
 * Bygg en MarketingPlan. exploit-buckets bruker learning-anbefalte dimensjoner;
 * adjacent utforsker naboer; experiment reserveres for kontrollerte tester.
 * Observational learning får bare påvirke exploit når evidensen er reliable/strong.
 * Svakere funn beholdes som analyse/notes, men får ikke styre autopiloten.
 */
export function buildMarketingPlan(rawInput: DirectorInput, opts: BuildPlanOptions): MarketingPlan {
  const input = DirectorInputSchema.parse(rawInput);
  const rec = opts.recommendation;
  const suggestedMix = outcomeAwareExplorationMix(rec);
  const mix: ExplorationMix = { ...suggestedMix, ...opts.explorationMix };
  const capacity = input.publishingCapacityPerWeek;
  const production = allocateExploration(capacity, mix);
  const favoredDimensions: Record<string, string> = {};
  const notes: string[] = [];
  const channels = [...input.channels];
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
    const channelWinner = rec.favor.channel;
    if (channelWinner && canInfluenceAutopilot(channelWinner)) {
      const winnerIndex = channels.findIndex((channel) => channel === channelWinner.value);
      if (winnerIndex > 0) {
        const [winner] = channels.splice(winnerIndex, 1);
        channels.unshift(winner);
        notes.push(`🎯 kanalprioritet ${winner} først (${channelWinner.outcomeTier ?? "ukjent utfall"}, ${channelWinner.evidence})`);
      }
    }
    notes.push(...rec.notes.slice(0, 3));
  }
  const avoidedDimensions = (rec?.avoid ?? []).map((a) => ({ dimension: a.dimension, value: a.value }));
  const channelProduction = allocateChannelProduction(capacity, channels, rec);
  const strongestOutcome = strongestActionableOutcome(rec);
  if (strongestOutcome !== "none") {
    notes.push(`📦 produksjonsmix ${Math.round(mix.exploit * 100)}/${Math.round(mix.adjacent * 100)}/${Math.round(mix.experiment * 100)} styres av ${strongestOutcome}-evidens`);
  }

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
    channels,
    explorationMix: mix,
    production,
    channelProduction,
    favoredDimensions,
    avoidedDimensions,
    plannedExperiments,
    budget: input.budget,
    notes,
  };
}
