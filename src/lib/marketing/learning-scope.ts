import type { MarketingChannel } from "./genome";

/**
 * Canonical learning scope. Brand-only scope remains available as a fallback for
 * multi-channel planning, while mature channel pilots persist/read rules here.
 */
export function channelLearningScope(brandId: string, channel: MarketingChannel | string): string {
  return `${String(brandId).trim()}:${String(channel).trim().toLowerCase()}`;
}
