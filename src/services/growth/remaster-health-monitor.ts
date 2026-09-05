export type RemasterHealthState = "healthy" | "partial" | "error";

export type RemasterHealthSnapshot = {
  planActive: boolean;
  controlledAuto: boolean;
  planUpdatedAt: string | null;
  facebookConfigured: boolean;
  youtubeConnected: boolean;
  sourceSyncLastSuccessAt: string | null;
  sourceSyncFreshnessMinutes: number;
  growthLoopLastRunAt: string | null;
  growthLoopFreshnessMinutes: number;
  marketingAutopilotLastRunAt: string | null;
  marketingAutopilotLastStatus: string | null;
  marketingAutopilotFreshnessMinutes: number;
  sourceDriftCount: number;
  pendingPromotionRequestAgeMinutes: number | null;
  failedPromotionRequests24h: number;
  failedGrowthActions24h: number;
  consecutiveNegativeMeasuredActions: number;
};

export type RemasterHealthAssessment = RemasterHealthSnapshot & {
  state: RemasterHealthState;
  reasons: string[];
};

function isStale(lastSuccessAt: string | null, freshnessMinutes: number, nowMs: number) {
  if (!lastSuccessAt) return true;
  const time = Date.parse(lastSuccessAt);
  if (!Number.isFinite(time)) return true;
  return nowMs - time > freshnessMinutes * 60_000;
}

function isMature(value: string | null, freshnessMinutes: number, nowMs: number) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && nowMs - time > freshnessMinutes * 60_000;
}

export function assessRemasterHealth(snapshot: RemasterHealthSnapshot, nowMs = Date.now()): RemasterHealthAssessment {
  const reasons: string[] = [];
  let state: RemasterHealthState = "healthy";

  const fail = (reason: string) => {
    state = "error";
    reasons.push(reason);
  };
  const warn = (reason: string) => {
    if (state !== "error") state = "partial";
    reasons.push(reason);
  };

  if (!snapshot.planActive || !snapshot.controlledAuto) fail("Re-Master Growth Plan is not active controlled_auto.");
  if (!snapshot.facebookConfigured) fail("Re-Master controlled autopilot has no verified Facebook channel configured.");
  if (!snapshot.youtubeConnected) fail("Re-Master YouTube connection is not healthy.");

  if (isStale(snapshot.sourceSyncLastSuccessAt, snapshot.sourceSyncFreshnessMinutes, nowMs)) {
    warn("Re-Master source reconciliation has no fresh successful run.");
  }
  if (isMature(snapshot.planUpdatedAt, snapshot.growthLoopFreshnessMinutes, nowMs)
    && isStale(snapshot.growthLoopLastRunAt, snapshot.growthLoopFreshnessMinutes, nowMs)) {
    warn("Re-Master growth loop has no fresh execution heartbeat.");
  }

  if (snapshot.marketingAutopilotLastRunAt) {
    if (snapshot.marketingAutopilotLastStatus === "error") {
      fail("Re-Master Marketing Autopilot last runtime heartbeat reported an error.");
    } else if (snapshot.marketingAutopilotLastStatus === "partial") {
      warn("Re-Master Marketing Autopilot last runtime heartbeat was partial.");
    }
    if (isStale(snapshot.marketingAutopilotLastRunAt, snapshot.marketingAutopilotFreshnessMinutes, nowMs)) {
      warn("Re-Master Marketing Autopilot runtime heartbeat is stale.");
    }
  }

  if (snapshot.sourceDriftCount > 0) warn(`${snapshot.sourceDriftCount} published Re-Master song source(s) are still out of sync.`);
  if (snapshot.pendingPromotionRequestAgeMinutes != null && snapshot.pendingPromotionRequestAgeMinutes > 90) {
    warn("A Re-Master promotion request has remained pending for more than 90 minutes.");
  }
  if (snapshot.failedPromotionRequests24h > 0) fail(`${snapshot.failedPromotionRequests24h} Re-Master promotion request(s) failed in the last 24 hours.`);
  if (snapshot.failedGrowthActions24h > 0) fail(`${snapshot.failedGrowthActions24h} Re-Master growth action(s) failed in the last 24 hours.`);
  if (snapshot.consecutiveNegativeMeasuredActions >= 2) {
    warn(`${snapshot.consecutiveNegativeMeasuredActions} consecutive measured Re-Master growth actions were negative.`);
  }

  return { ...snapshot, state, reasons };
}
