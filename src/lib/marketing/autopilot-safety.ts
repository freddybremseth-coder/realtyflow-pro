/**
 * Fail-closed scheduling helpers for Marketing Autopilot.
 *
 * Vercel invokes the route every five minutes so the app can honor a learned
 * local publish hour. The helpers below turn those repeated invocations into
 * one deterministic daily slot per brand and channel.
 */

const EXPLORATION_HOURS = [9, 12, 16, 20] as const;

export interface AutopilotLocalSlot {
  hour: number;
  dayIndex: number;
  localDate: string;
}

export function localAutopilotSlot(now: Date = new Date(), timeZone = "Europe/Madrid"): AutopilotLocalSlot {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(value("hour") || 0);
  const weekday = value("weekday").toLowerCase();
  const dayIndex = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekday);
  return {
    hour,
    dayIndex: dayIndex >= 0 ? dayIndex : 1,
    localDate: `${value("year")}-${value("month")}-${value("day")}`,
  };
}

export function parseLearnedAutopilotHour(value: string | undefined): number | null {
  const match = String(value ?? "").match(/^h_(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export function autopilotTargetHour(dayIndex: number, learnedHour: number | null): number {
  return learnedHour ?? EXPLORATION_HOURS[((dayIndex % EXPLORATION_HOURS.length) + EXPLORATION_HOURS.length) % EXPLORATION_HOURS.length];
}

/** Exact hour only. A ±1 hour window caused 36 eligible invocations per day. */
export function shouldRunAutopilotSlot(currentHour: number, targetHour: number): boolean {
  return currentHour === targetHour;
}

function idPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "unknown";
}

/** Stable identity makes every five-minute retry share the same external idempotency key. */
export function autopilotRunIdentity(brandId: string, channel: string, localDate: string, targetHour: number) {
  const slot = `${localDate.replace(/-/g, "")}_h${String(targetHour).padStart(2, "0")}`;
  const suffix = `${idPart(brandId)}_${idPart(channel)}_${slot}`;
  return {
    marketingRunId: `mrun_autopilot_${suffix}`,
    correlationId: `rf_autopilot_${suffix}`,
  };
}
