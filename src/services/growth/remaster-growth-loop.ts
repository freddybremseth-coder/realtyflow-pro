export type RemasterVideoPerformance = {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags?: string[];
  description?: string;
};

export type RemasterGrowthAssessment = {
  videoId: string;
  ageDays: number;
  viewsPerDay: number;
  engagementRate: number;
  status: "HEALTHY" | "WATCH" | "UNDERPERFORMING";
  reasons: string[];
  actions: Array<"REFRESH_DESCRIPTION" | "REFRESH_TAGS" | "ADD_TO_PLAYLIST">;
};

function safeAgeDays(publishedAt: string, nowMs: number) {
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) return 1;
  return Math.max(1, (nowMs - published) / 86_400_000);
}

export function assessRemasterVideoPerformance(
  video: RemasterVideoPerformance,
  channelMedianViewsPerDay: number,
  nowMs = Date.now(),
): RemasterGrowthAssessment {
  const ageDays = safeAgeDays(video.publishedAt, nowMs);
  const viewsPerDay = video.viewCount / ageDays;
  const engagementRate = video.viewCount > 0
    ? ((video.likeCount + video.commentCount) / video.viewCount) * 100
    : 0;
  const baseline = Math.max(1, channelMedianViewsPerDay || 1);
  const relativeVelocity = viewsPerDay / baseline;
  const reasons: string[] = [];
  const actions: RemasterGrowthAssessment["actions"] = [];

  if (ageDays < 3) {
    return {
      videoId: video.videoId,
      ageDays,
      viewsPerDay,
      engagementRate,
      status: "WATCH",
      reasons: ["Video is too new for an automatic metadata intervention."],
      actions: [],
    };
  }

  if (relativeVelocity < 0.45) reasons.push(`Views/day are ${Math.round(relativeVelocity * 100)}% of the channel median.`);
  if (ageDays >= 7 && video.viewCount < 100) reasons.push("Fewer than 100 views after at least 7 days.");
  if (ageDays >= 14 && engagementRate < 1) reasons.push("Engagement is below 1% after the initial discovery window.");
  if (!video.description || video.description.trim().length < 300) reasons.push("Description is too thin for a mature music video.");
  if (!video.tags || video.tags.length < 8) reasons.push("Tag coverage is thin.");

  const underperforming = relativeVelocity < 0.45 || (ageDays >= 7 && video.viewCount < 100);
  if (underperforming) {
    actions.push("ADD_TO_PLAYLIST");
    if (!video.description || video.description.trim().length < 900) actions.push("REFRESH_DESCRIPTION");
    if (!video.tags || video.tags.length < 15) actions.push("REFRESH_TAGS");
  }

  return {
    videoId: video.videoId,
    ageDays,
    viewsPerDay,
    engagementRate,
    status: underperforming ? "UNDERPERFORMING" : relativeVelocity < 0.8 ? "WATCH" : "HEALTHY",
    reasons,
    actions: [...new Set(actions)],
  };
}

export function median(values: number[]) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}
