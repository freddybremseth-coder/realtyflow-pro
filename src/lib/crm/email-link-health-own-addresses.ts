import type { EmailLinkAssessment, EmailLinkState } from "./email-link-health";

type EmailLinkHealthLike = {
  summary: {
    messages: number;
    totalMessages: number;
    excludedNonCrm: number;
    linked: number;
    exactCandidates: number;
    ambiguous: number;
    unlinked: number;
    safeCoveragePercent: number;
  };
  items: EmailLinkAssessment[];
};

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isOwnAddressUnlinkedInbound(item: EmailLinkAssessment, ownAddresses: Set<string>) {
  if (item.state !== "unlinked") return false;
  if (String(item.message.direction || "").trim().toLowerCase() !== "inbound") return false;
  const sender = normalizeEmail(item.message.from_address);
  return Boolean(sender) && ownAddresses.has(sender);
}

export function filterOwnAddressEmailHealth(health: EmailLinkHealthLike, rawOwnAddresses: Iterable<string>) {
  const ownAddresses = new Set([...rawOwnAddresses].map(normalizeEmail).filter(Boolean));
  const excludedOwnAddresses = health.items.filter((item) => isOwnAddressUnlinkedInbound(item, ownAddresses)).length;
  const items = health.items.filter((item) => !isOwnAddressUnlinkedInbound(item, ownAddresses));
  const count = (state: EmailLinkState) => items.filter((item) => item.state === state).length;
  const linked = count("linked");
  const exactCandidates = count("exact_candidate");

  return {
    summary: {
      ...health.summary,
      messages: items.length,
      excludedNonCrm: health.summary.excludedNonCrm + excludedOwnAddresses,
      excludedSystemNotifications: health.summary.excludedNonCrm,
      excludedOwnAddresses,
      linked,
      exactCandidates,
      ambiguous: count("ambiguous"),
      unlinked: count("unlinked"),
      safeCoveragePercent: items.length ? Math.round(((linked + exactCandidates) / items.length) * 100) : 100,
    },
    items,
  };
}
