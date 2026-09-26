import type { MarketingSupabaseLike } from "@/services/marketing/adapters";
import type { ContentMetrics } from "@/lib/marketing/value-score";

const REMASTER_BRANDS = ["remasterfreddy", "neuralbeat", "neural-beat"];

type ReelVariant = {
  url?: unknown;
  startSeconds?: unknown;
  rank?: unknown;
  score?: unknown;
  channelScores?: Record<string, number>;
  lastMeasuredAt?: unknown;
};

function cleanUrl(value: unknown) {
  return typeof value === "string" && value.startsWith("https://") ? value : "";
}

export function remasterReelPerformanceScore(metrics: ContentMetrics): number {
  const denominator = Math.max(
    1,
    Number(metrics.impressions || 0),
    Number(metrics.views || 0),
    Number(metrics.engagedViews || 0),
  );
  const weighted =
    Number(metrics.reactions || 0)
    + Number(metrics.comments || 0) * 2
    + Number(metrics.shares || 0) * 4
    + Number(metrics.saves || 0) * 4
    + Number(metrics.clicks || 0) * 3;
  return Math.round((weighted / denominator) * 1000 * 100) / 100;
}

export async function recordRemasterReelPerformance(
  supabase: MarketingSupabaseLike,
  input: {
    brandId: string;
    channel: "facebook" | "instagram";
    mediaUrl?: string | null;
    metrics: ContentMetrics;
    measuredAt?: string;
  },
): Promise<{ updated: boolean; songId?: string; variantRank?: number; score?: number }> {
  if (input.brandId !== "remasterfreddy") return { updated: false };
  const mediaUrl = cleanUrl(input.mediaUrl);
  if (!mediaUrl || !/\.mp4(?:$|\?)/i.test(mediaUrl)) return { updated: false };

  const { data, error } = await supabase
    .from("songs")
    .select("id,brand,ai_metadata")
    .in("brand", REMASTER_BRANDS)
    .limit(500);
  if (error) throw new Error(`REMASTER_REEL_LEARNING_READ_FAILED: ${error.message}`);

  for (const song of data ?? []) {
    const metadata = song.ai_metadata && typeof song.ai_metadata === "object" ? song.ai_metadata : {};
    const rawVariants = Array.isArray(metadata.socialReelVariants) ? metadata.socialReelVariants as ReelVariant[] : [];
    const index = rawVariants.findIndex((variant) => cleanUrl(variant?.url) === mediaUrl);
    if (index < 0) continue;

    const channelScore = remasterReelPerformanceScore(input.metrics);
    const previous = rawVariants[index] ?? {};
    const channelScores = {
      ...(previous.channelScores && typeof previous.channelScores === "object" ? previous.channelScores : {}),
      [input.channel]: channelScore,
    };
    const numericScores = Object.values(channelScores).filter((value) => Number.isFinite(Number(value))).map(Number);
    const score = numericScores.length
      ? Math.round((numericScores.reduce((sum, value) => sum + value, 0) / numericScores.length) * 100) / 100
      : channelScore;

    const variants = rawVariants.map((variant, variantIndex) => variantIndex === index ? {
      ...variant,
      score,
      channelScores,
      lastMeasuredAt: input.measuredAt ?? new Date().toISOString(),
    } : variant);

    const sorted = variants
      .map((variant, originalIndex) => ({
        variant,
        originalIndex,
        score: Number.isFinite(Number(variant?.score)) ? Number(variant.score) : 0,
        rank: Number.isFinite(Number(variant?.rank)) ? Number(variant.rank) : originalIndex + 1,
      }))
      .sort((a, b) => (b.score - a.score) || (a.rank - b.rank));
    const bestUrl = cleanUrl(sorted[0]?.variant?.url) || metadata.socialReelUrl || null;

    const { error: updateError } = await supabase
      .from("songs")
      .update({
        ai_metadata: {
          ...metadata,
          socialReelVariants: variants,
          socialReelUrl: bestUrl,
          socialReelLearningUpdatedAt: input.measuredAt ?? new Date().toISOString(),
        },
      })
      .eq("id", song.id);
    if (updateError) throw new Error(`REMASTER_REEL_LEARNING_WRITE_FAILED: ${updateError.message}`);

    return {
      updated: true,
      songId: String(song.id),
      variantRank: Number.isFinite(Number(previous.rank)) ? Number(previous.rank) : index + 1,
      score,
    };
  }

  return { updated: false };
}
