import { LeadIntelligenceError } from "./extraction";

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ANALYSES = 8;

export function resetLeadIntelligenceRateLimitsForTests() {
  rateLimits.clear();
}

export function assertLeadIntelligenceRateLimit(identity: string, now = Date.now()) {
  const current = rateLimits.get(identity);
  if (!current || current.resetAt <= now) {
    rateLimits.set(identity, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (current.count >= RATE_LIMIT_MAX_ANALYSES) {
    throw new LeadIntelligenceError("RATE_LIMITED", "For mange analyseforsøk på kort tid", 429);
  }

  current.count += 1;
}
