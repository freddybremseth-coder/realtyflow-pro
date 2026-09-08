import type { RevenueMemoryEventInput, RevenuePriorityItem } from "./today";

export type PortalRecencySignal = {
  activeNow: boolean;
  bonus: number;
  reason: string | null;
  occurredAt: string | null;
};

function eventDate(event: RevenueMemoryEventInput) {
  const value = event.occurred_at || event.created_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function portalSignal(event: RevenueMemoryEventInput) {
  const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  return String(metadata.portal_signal || "").trim().toLowerCase();
}

export function readPortalRecencySignal(
  events: RevenueMemoryEventInput[] | null | undefined,
  now = new Date(),
): PortalRecencySignal {
  const latestSession = [...(events || [])]
    .map((event) => ({ event, at: eventDate(event) }))
    .filter((item): item is { event: RevenueMemoryEventInput; at: Date } => Boolean(item.at))
    .filter((item) => portalSignal(item.event) === "session_active")
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

  if (!latestSession) {
    return { activeNow: false, bonus: 0, reason: null, occurredAt: null };
  }

  const ageMinutes = Math.max(0, (now.getTime() - latestSession.at.getTime()) / 60_000);
  if (ageMinutes <= 30) {
    return {
      activeNow: true,
      bonus: 6,
      reason: "kunden er aktiv på Min side nå",
      occurredAt: latestSession.at.toISOString(),
    };
  }

  if (ageMinutes <= 120) {
    return {
      activeNow: false,
      bonus: 3,
      reason: "kunden var nylig aktiv på Min side",
      occurredAt: latestSession.at.toISOString(),
    };
  }

  return {
    activeNow: false,
    bonus: 0,
    reason: null,
    occurredAt: latestSession.at.toISOString(),
  };
}

export function applyPortalRecencyBoost<T extends RevenuePriorityItem>(
  item: T,
  events: RevenueMemoryEventInput[] | null | undefined,
  now = new Date(),
): T & { portalActiveNow: boolean; portalLastActiveAt: string | null } {
  const signal = readPortalRecencySignal(events, now);
  if (!signal.bonus || !signal.reason) {
    return {
      ...item,
      portalActiveNow: false,
      portalLastActiveAt: signal.occurredAt,
    };
  }

  const reasonParts = [item.reason, signal.reason].filter(Boolean);
  return {
    ...item,
    score: Math.min(100, item.score + signal.bonus),
    reason: reasonParts.join(" · "),
    portalActiveNow: signal.activeNow,
    portalLastActiveAt: signal.occurredAt,
  };
}
