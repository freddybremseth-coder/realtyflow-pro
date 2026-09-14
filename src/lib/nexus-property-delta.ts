export type NexusPropertyDeltaReason = "NEW" | "SCORE_IMPROVED" | "PRICE_CHANGED";

export interface NexusPropertyDeltaCandidate {
  id: string;
  price?: number | null;
  baseScore?: number | null;
  tasteAdjustedScore?: number | null;
}

export interface NexusPropertyHistoryItem {
  property_id?: string | null;
  propertyId?: string | null;
  score?: number | null;
  property_price?: number | null;
  propertyPrice?: number | null;
  created_at?: string | null;
  createdAt?: string | null;
}

export interface NexusPropertyDeltaCandidateResult<T extends NexusPropertyDeltaCandidate = NexusPropertyDeltaCandidate> {
  candidate: T & {
    deltaReason: NexusPropertyDeltaReason;
    deltaScoreGain: number | null;
    deltaPriceChange: number | null;
  };
  reason: NexusPropertyDeltaReason;
}

export interface NexusPropertyDeltaResult<T extends NexusPropertyDeltaCandidate = NexusPropertyDeltaCandidate> {
  candidates: Array<NexusPropertyDeltaCandidateResult<T>["candidate"]>;
  suppressed: number;
  historicalProperties: number;
  historyApplied: boolean;
}

const SCORE_IMPROVEMENT_THRESHOLD = 5;
const MIN_PRICE_CHANGE_EUR = 5_000;
const PRICE_CHANGE_RATIO = 0.02;

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function propertyId(item: NexusPropertyHistoryItem) {
  return String(item.property_id || item.propertyId || "").trim();
}

function createdAtMs(item: NexusPropertyHistoryItem) {
  const raw = item.created_at || item.createdAt;
  if (!raw) return 0;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
}

function meaningfulPriceChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return false;
  const absolute = Math.abs(current - previous);
  return absolute >= Math.max(MIN_PRICE_CHANGE_EUR, previous * PRICE_CHANGE_RATIO);
}

export function selectPropertyDeltaCandidates<T extends NexusPropertyDeltaCandidate>(
  candidates: T[],
  history: NexusPropertyHistoryItem[],
): NexusPropertyDeltaResult<T> {
  const historical = new Map<string, { maxScore: number | null; lastPrice: number | null; latestAt: number }>();

  for (const item of history) {
    const id = propertyId(item);
    if (!id) continue;
    const score = finiteNumber(item.score);
    const price = finiteNumber(item.property_price ?? item.propertyPrice);
    const at = createdAtMs(item);
    const existing = historical.get(id);
    if (!existing) {
      historical.set(id, { maxScore: score, lastPrice: price, latestAt: at });
      continue;
    }
    if (score !== null && (existing.maxScore === null || score > existing.maxScore)) existing.maxScore = score;
    if (at >= existing.latestAt) {
      existing.latestAt = at;
      existing.lastPrice = price;
    }
  }

  if (historical.size === 0) {
    return {
      candidates: candidates.map((candidate) => ({
        ...candidate,
        deltaReason: "NEW" as const,
        deltaScoreGain: null,
        deltaPriceChange: null,
      })),
      suppressed: 0,
      historicalProperties: 0,
      historyApplied: false,
    };
  }

  const selected: Array<NexusPropertyDeltaCandidateResult<T>["candidate"]> = [];
  let suppressed = 0;

  for (const candidate of candidates) {
    const id = String(candidate.id || "").trim();
    const previous = historical.get(id);
    if (!previous) {
      selected.push({
        ...candidate,
        deltaReason: "NEW",
        deltaScoreGain: null,
        deltaPriceChange: null,
      });
      continue;
    }

    const currentScore = finiteNumber(candidate.baseScore ?? candidate.tasteAdjustedScore);
    const scoreGain = currentScore !== null && previous.maxScore !== null ? currentScore - previous.maxScore : null;
    const currentPrice = finiteNumber(candidate.price);
    const priceChange = currentPrice !== null && previous.lastPrice !== null ? currentPrice - previous.lastPrice : null;

    if (scoreGain !== null && scoreGain >= SCORE_IMPROVEMENT_THRESHOLD) {
      selected.push({
        ...candidate,
        deltaReason: "SCORE_IMPROVED",
        deltaScoreGain: scoreGain,
        deltaPriceChange: priceChange,
      });
      continue;
    }

    if (meaningfulPriceChange(currentPrice, previous.lastPrice)) {
      selected.push({
        ...candidate,
        deltaReason: "PRICE_CHANGED",
        deltaScoreGain: scoreGain,
        deltaPriceChange: priceChange,
      });
      continue;
    }

    suppressed += 1;
  }

  return {
    candidates: selected,
    suppressed,
    historicalProperties: historical.size,
    historyApplied: true,
  };
}
