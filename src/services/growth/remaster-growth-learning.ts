import type { RemasterActionHistoryRow } from "@/services/growth/remaster-action-history";

export type RemasterLearningMode = "EXPLORE" | "FAVOR" | "NEUTRAL" | "SUPPRESS";

export type RemasterActionLearning = {
  actionType: string;
  mode: RemasterLearningMode;
  measured: number;
  positive: number;
  neutral: number;
  negative: number;
  averageLiftPct: number | null;
  rationale: string;
};

function parsed(row: RemasterActionHistoryRow) {
  try {
    const value = JSON.parse(row.learnings || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function summarizeRemasterActionLearning(history: RemasterActionHistoryRow[], actionType: string): RemasterActionLearning {
  const measured = history
    .filter((row) => row.action_type === actionType && row.status === "completed")
    .map((row) => parsed(row)?.feedback)
    .filter((feedback) => feedback && ["POSITIVE", "NEUTRAL", "NEGATIVE"].includes(String(feedback.outcome)));

  const positive = measured.filter((item) => item.outcome === "POSITIVE").length;
  const neutral = measured.filter((item) => item.outcome === "NEUTRAL").length;
  const negative = measured.filter((item) => item.outcome === "NEGATIVE").length;
  const lifts = measured.map((item) => Number(item.liftPct)).filter(Number.isFinite);
  const averageLiftPct = lifts.length ? Math.round((lifts.reduce((sum, value) => sum + value, 0) / lifts.length) * 10) / 10 : null;

  let mode: RemasterLearningMode = "EXPLORE";
  let rationale = "Not enough measured outcomes yet; continue conservative exploration.";

  if (measured.length >= 2) {
    if (negative >= 2 && positive === 0) {
      mode = "SUPPRESS";
      rationale = `Suppress ${actionType}: ${negative} measured negative outcomes and no positive evidence.`;
    } else if (positive >= 2 && negative === 0 && (averageLiftPct ?? 0) >= 10) {
      mode = "FAVOR";
      rationale = `Favor ${actionType}: ${positive} measured positive outcomes with ${averageLiftPct}% average lift.`;
    } else {
      mode = "NEUTRAL";
      rationale = `Keep ${actionType} neutral: evidence is mixed or effect size is not strong enough.`;
    }
  }

  return { actionType, mode, measured: measured.length, positive, neutral, negative, averageLiftPct, rationale };
}

export function positiveMetadataTags(history: RemasterActionHistoryRow[], limit = 12) {
  const counts = new Map<string, number>();
  for (const row of history) {
    if (row.action_type !== "update_metadata" || row.status !== "completed") continue;
    const value = parsed(row);
    if (value?.feedback?.outcome !== "POSITIVE") continue;
    const tags = Array.isArray(value?.action?.newTags) ? value.action.newTags : [];
    for (const raw of tags) {
      const tag = String(raw).trim().toLowerCase();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, limit))
    .map(([tag, count]) => ({ tag, count }));
}
