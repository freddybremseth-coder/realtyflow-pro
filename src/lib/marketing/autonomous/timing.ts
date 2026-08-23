/**
 * Phase 7 — feedback timing. Ikke evaluer innhold etter fem minutter — da lærer
 * systemet av umodne data. Per kanal: early / mature / final vindu.
 */

import type { MarketingChannel } from "../genome";

export interface FeedbackWindow {
  earlyHours: number;
  matureHours: number;
  finalHours: number;
}

export const FEEDBACK_WINDOWS: Record<MarketingChannel, FeedbackWindow> = {
  instagram: { earlyHours: 6, matureHours: 72, finalHours: 24 * 14 },
  facebook: { earlyHours: 6, matureHours: 72, finalHours: 24 * 14 },
  tiktok: { earlyHours: 6, matureHours: 72, finalHours: 24 * 14 },
  youtube_shorts: { earlyHours: 12, matureHours: 24 * 7, finalHours: 24 * 30 },
  youtube: { earlyHours: 24, matureHours: 24 * 7, finalHours: 24 * 30 },
  linkedin: { earlyHours: 12, matureHours: 24 * 3, finalHours: 24 * 14 },
  website: { earlyHours: 24 * 7, matureHours: 24 * 30, finalHours: 24 * 90 },
  email: { earlyHours: 24, matureHours: 24 * 3, finalHours: 24 * 7 },
};

export type MaturityPhase = "immature" | "early" | "mature" | "final";

/** Hvor moden er målingen? Læring bør vekte mature/final, ikke immature/early. */
export function maturityPhase(channel: MarketingChannel, publishedAt: string | Date, now: Date | string = new Date()): MaturityPhase {
  const w = FEEDBACK_WINDOWS[channel];
  const hours = (new Date(now).getTime() - new Date(publishedAt).getTime()) / 3_600_000;
  if (hours >= w.finalHours) return "final";
  if (hours >= w.matureHours) return "mature";
  if (hours >= w.earlyHours) return "early";
  return "immature";
}

/** Er innholdet modent nok til å telle i autonom læring? (mature/final). */
export function isReadyForLearning(channel: MarketingChannel, publishedAt: string | Date, now: Date | string = new Date()): boolean {
  const phase = maturityPhase(channel, publishedAt, now);
  return phase === "mature" || phase === "final";
}
