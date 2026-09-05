import type { DataGap } from "@/lib/morning-brief-data-gaps";

export type DiscoveryEvidence = {
  source: string;
  value: unknown;
  observedAt?: string | null;
  strength?: number;
};

export type DiscoveryProposal = {
  field: string;
  status: "FOUND" | "NOT_FOUND" | "SKIPPED_HUMAN_REQUIRED";
  proposedValue?: unknown;
  confidence: number;
  provenance: string[];
  rationale: string;
  writeAllowed: false;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function discoverGap(
  gap: DataGap,
  evidence: DiscoveryEvidence[],
): DiscoveryProposal {
  if (gap.resolution === "HUMAN_REQUIRED") {
    return {
      field: gap.field,
      status: "SKIPPED_HUMAN_REQUIRED",
      confidence: 0,
      provenance: [],
      rationale: "This field requires human intent or business judgment and is not inferred automatically.",
      writeAllowed: false,
    };
  }

  const candidates = evidence
    .filter((item) => item.source && item.value !== null && item.value !== undefined && item.value !== "")
    .map((item) => ({ ...item, strength: clamp(Number(item.strength ?? 70)) }))
    .sort((a, b) => b.strength - a.strength || a.source.localeCompare(b.source));

  const best = candidates[0];
  if (!best) {
    return {
      field: gap.field,
      status: "NOT_FOUND",
      confidence: 0,
      provenance: [],
      rationale: "No usable canonical evidence was found for this auto-discoverable gap.",
      writeAllowed: false,
    };
  }

  const agreeingSources = candidates.filter((item) => Object.is(item.value, best.value));
  const confidence = clamp(best.strength + Math.min(15, Math.max(0, agreeingSources.length - 1) * 5));

  return {
    field: gap.field,
    status: "FOUND",
    proposedValue: best.value,
    confidence,
    provenance: agreeingSources.map((item) => item.source),
    rationale: agreeingSources.length > 1
      ? `Multiple canonical sources agree on the same value.`
      : `One canonical source provides a usable value.`,
    writeAllowed: false,
  };
}

export function discoverGaps(
  gaps: DataGap[],
  evidenceByField: Record<string, DiscoveryEvidence[] | undefined>,
) {
  return gaps.map((gap) => discoverGap(gap, evidenceByField[gap.field] ?? []));
}
