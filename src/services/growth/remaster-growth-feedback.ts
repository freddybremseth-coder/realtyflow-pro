export type RemasterGrowthOutcome = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "INSUFFICIENT_DATA";

export type RemasterGrowthFeedback = {
  outcome: RemasterGrowthOutcome;
  beforeViewsPerDay: number | null;
  afterViewsPerDay: number | null;
  liftPct: number | null;
  observedDays: number;
  reason: string;
};

function finite(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function evaluateRemasterGrowthOutcome(input: {
  beforeViewsPerDay: unknown;
  afterViewsPerDay: unknown;
  executedAt: string | null | undefined;
  nowMs?: number;
  minimumObservationDays?: number;
}): RemasterGrowthFeedback {
  const before = finite(input.beforeViewsPerDay);
  const after = finite(input.afterViewsPerDay);
  const nowMs = input.nowMs ?? Date.now();
  const executedMs = Date.parse(input.executedAt || "");
  const observedDays = Number.isFinite(executedMs) ? Math.max(0, (nowMs - executedMs) / 86_400_000) : 0;
  const minimumObservationDays = Math.max(1, input.minimumObservationDays ?? 7);

  if (before === null || after === null || !Number.isFinite(executedMs) || observedDays < minimumObservationDays) {
    return {
      outcome: "INSUFFICIENT_DATA",
      beforeViewsPerDay: before,
      afterViewsPerDay: after,
      liftPct: null,
      observedDays,
      reason: `Need at least ${minimumObservationDays} days of comparable views/day data after the action.`,
    };
  }

  const denominator = Math.max(1, Math.abs(before));
  const liftPct = ((after - before) / denominator) * 100;
  if (liftPct >= 15) {
    return { outcome: "POSITIVE", beforeViewsPerDay: before, afterViewsPerDay: after, liftPct, observedDays, reason: "Views/day improved by at least 15% after the growth action." };
  }
  if (liftPct <= -15) {
    return { outcome: "NEGATIVE", beforeViewsPerDay: before, afterViewsPerDay: after, liftPct, observedDays, reason: "Views/day declined by at least 15% after the growth action." };
  }
  return { outcome: "NEUTRAL", beforeViewsPerDay: before, afterViewsPerDay: after, liftPct, observedDays, reason: "Views/day stayed within the neutral ±15% band after the growth action." };
}
