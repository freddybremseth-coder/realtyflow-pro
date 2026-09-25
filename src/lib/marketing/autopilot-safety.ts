/**
 * Fail-closed scheduling helpers for Marketing Autopilot.
 *
 * Vercel invokes the route hourly. The helpers below turn those repeated
 * invocations into deterministic 12-hour slots per brand and channel. A
 * learned publish hour becomes the first slot; the second is exactly 12 hours
 * later. Until enough evidence exists, brands are deterministically staggered
 * across the morning/evening so all brands do not hit providers at once.
 */

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

/** Optional brand-specific weekday schedule; retained for manual/legacy callers. */
export function isPlannedAutopilotDay(dayIndex: number, days: unknown): boolean {
  if (days == null) return true;
  if (!Array.isArray(days) || days.length === 0) return false;
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return false;
  return days.some((day) => typeof day === "string" && day.trim().toLowerCase() === weekdays[dayIndex]);
}

export function parseLearnedAutopilotHour(value: string | undefined): number | null {
  const match = String(value ?? "").match(/^h_(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

/** Legacy one-slot helper retained for compatibility. */
export function autopilotTargetHour(dayIndex: number, learnedHour: number | null): number {
  const fallback = [9, 12, 16, 20] as const;
  return learnedHour ?? fallback[((dayIndex % fallback.length) + fallback.length) % fallback.length];
}

function stableBrandSeed(value: string): number {
  let hash = 2166136261;
  for (const char of String(value || "brand").toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Two exact 12-hour slots. The learned hour wins; otherwise each brand gets a
 * stable first slot between 07:00 and 11:00 Madrid time and a second slot
 * exactly 12 hours later.
 */
export function autopilotTargetHours(brandId: string, learnedHour: number | null): [number, number] {
  const first = learnedHour ?? (7 + (stableBrandSeed(brandId) % 5));
  return [first, (first + 12) % 24];
}

export function dueAutopilotTargetHour(currentHour: number, targetHours: readonly number[]): number | null {
  return targetHours.includes(currentHour) ? currentHour : null;
}

/** Exact hour only. */
export function shouldRunAutopilotSlot(currentHour: number, targetHour: number): boolean {
  return currentHour === targetHour;
}

function idPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "unknown";
}

/** Stable identity makes every retry share the same external idempotency key. */
export function autopilotRunIdentity(brandId: string, channel: string, localDate: string, targetHour: number) {
  const slot = `${localDate.replace(/-/g, "")}_h${String(targetHour).padStart(2, "0")}`;
  const suffix = `${idPart(brandId)}_${idPart(channel)}_${slot}`;
  return {
    marketingRunId: `mrun_autopilot_${suffix}`,
    correlationId: `rf_autopilot_${suffix}`,
  };
}
