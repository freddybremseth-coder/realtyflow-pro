import type { NexusOutcomeMeasurement } from "@/lib/nexus/outcome-measurement";

export const NEXUS_REVENUE_LEARNING_SETTINGS_KEY = "nexus-revenue-learning:v1";

export interface NexusRevenueLearningActionSignal {
  actionType: string;
  sampleSize: number;
  outcomeRate: number;
  winRate: number;
  revenueImpactEur: number;
  scoreAdjustment: number;
  evidenceStrength: "insufficient" | "emerging" | "established";
  reason: string;
}

export interface NexusRevenueLearningProfile {
  version: 1;
  generatedAt: string;
  lookbackDays: number;
  attributionWindowDays: number;
  minSamples: number;
  baselineOutcomeRate: number;
  signals: NexusRevenueLearningActionSignal[];
  safety: {
    rankingOnly: true;
    maxAbsoluteScoreAdjustment: 8;
    policyMutationAllowed: false;
    autonomyExpansionAllowed: false;
  };
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function evidenceStrength(sampleSize: number, minSamples: number): NexusRevenueLearningActionSignal["evidenceStrength"] {
  if (sampleSize < minSamples) return "insufficient";
  if (sampleSize < 25) return "emerging";
  return "established";
}

export function buildRevenueLearningProfile(
  measurement: NexusOutcomeMeasurement,
  options: { lookbackDays?: number; minSamples?: number; generatedAt?: Date } = {},
): NexusRevenueLearningProfile {
  const minSamples = Math.max(5, Math.min(50, Math.round(options.minSamples ?? 8)));
  const baseline = finite(measurement.summary.outcomeRate);
  const generatedAt = options.generatedAt ?? new Date();
  const signals = measurement.byActionType.map((row): NexusRevenueLearningActionSignal => {
    const sampleSize = Math.max(0, Math.round(finite(row.recommendations)));
    const strength = evidenceStrength(sampleSize, minSamples);
    if (strength === "insufficient") {
      return {
        actionType: row.actionType,
        sampleSize,
        outcomeRate: finite(row.outcomeRate),
        winRate: finite(row.winRate),
        revenueImpactEur: Math.round(finite(row.revenueImpactEur)),
        scoreAdjustment: 0,
        evidenceStrength: strength,
        reason: `Ingen scoreendring: ${sampleSize} observasjoner er under minimum ${minSamples}.`,
      };
    }

    const outcomeDelta = finite(row.outcomeRate) - baseline;
    const rawSignal = outcomeDelta / 10 + finite(row.winRate) / 20;
    const evidenceFactor = Math.min(1, sampleSize / 25);
    const scoreAdjustment = clamp(Math.round(rawSignal * evidenceFactor), -8, 8);
    const direction = scoreAdjustment > 0 ? "løft" : scoreAdjustment < 0 ? "nedjustering" : "ingen endring";
    return {
      actionType: row.actionType,
      sampleSize,
      outcomeRate: finite(row.outcomeRate),
      winRate: finite(row.winRate),
      revenueImpactEur: Math.round(finite(row.revenueImpactEur)),
      scoreAdjustment,
      evidenceStrength: strength,
      reason: `${direction}: ${sampleSize} observasjoner, ${finite(row.outcomeRate)} % outcome-rate mot baseline ${baseline} % og ${finite(row.winRate)} % win-rate.`,
    };
  });

  return {
    version: 1,
    generatedAt: generatedAt.toISOString(),
    lookbackDays: Math.max(7, Math.min(365, Math.round(options.lookbackDays ?? 90))),
    attributionWindowDays: measurement.attributionWindowDays,
    minSamples,
    baselineOutcomeRate: baseline,
    signals,
    safety: {
      rankingOnly: true,
      maxAbsoluteScoreAdjustment: 8,
      policyMutationAllowed: false,
      autonomyExpansionAllowed: false,
    },
  };
}

export function parseRevenueLearningProfile(value: unknown): NexusRevenueLearningProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const rawSignals = Array.isArray(row.signals) ? row.signals : [];
  if (finite(row.version) !== 1 || row.safety === null || typeof row.safety !== "object") return null;
  const signals = rawSignals
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item): NexusRevenueLearningActionSignal | null => {
      const actionType = String(item.actionType || "").trim();
      if (!actionType) return null;
      const scoreAdjustment = clamp(Math.round(finite(item.scoreAdjustment)), -8, 8);
      const strengthRaw = String(item.evidenceStrength || "insufficient");
      const strength = (["insufficient", "emerging", "established"] as const).includes(strengthRaw as any)
        ? strengthRaw as NexusRevenueLearningActionSignal["evidenceStrength"]
        : "insufficient";
      return {
        actionType,
        sampleSize: Math.max(0, Math.round(finite(item.sampleSize))),
        outcomeRate: finite(item.outcomeRate),
        winRate: finite(item.winRate),
        revenueImpactEur: Math.round(finite(item.revenueImpactEur)),
        scoreAdjustment: strength === "insufficient" ? 0 : scoreAdjustment,
        evidenceStrength: strength,
        reason: String(item.reason || "").trim() || "Historisk outcome-signal.",
      };
    })
    .filter(Boolean) as NexusRevenueLearningActionSignal[];

  const safety = row.safety as Record<string, unknown>;
  if (safety.policyMutationAllowed !== false || safety.autonomyExpansionAllowed !== false) return null;
  return {
    version: 1,
    generatedAt: String(row.generatedAt || new Date(0).toISOString()),
    lookbackDays: Math.max(7, Math.min(365, Math.round(finite(row.lookbackDays, 90)))),
    attributionWindowDays: Math.max(1, Math.min(90, Math.round(finite(row.attributionWindowDays, 30)))),
    minSamples: Math.max(5, Math.min(50, Math.round(finite(row.minSamples, 8)))),
    baselineOutcomeRate: finite(row.baselineOutcomeRate),
    signals,
    safety: {
      rankingOnly: true,
      maxAbsoluteScoreAdjustment: 8,
      policyMutationAllowed: false,
      autonomyExpansionAllowed: false,
    },
  };
}

export function learningAdjustmentForAction(
  actionType: string,
  profile?: NexusRevenueLearningProfile | null,
) {
  if (!profile?.safety.rankingOnly || profile.safety.policyMutationAllowed || profile.safety.autonomyExpansionAllowed) {
    return { scoreAdjustment: 0, signal: null as NexusRevenueLearningActionSignal | null };
  }
  const signal = profile.signals.find((item) => item.actionType === actionType) || null;
  if (!signal || signal.evidenceStrength === "insufficient") return { scoreAdjustment: 0, signal };
  return { scoreAdjustment: clamp(signal.scoreAdjustment, -8, 8), signal };
}
