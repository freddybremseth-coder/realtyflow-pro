"use client";

import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type PropertyMatchEligibility = "eligible" | "conditional" | "rejected";
export type MatchReviewDecision = "system" | "current" | "maybe" | "needs_research" | "rejected";
export type SelectedShortlistDecision = Exclude<MatchReviewDecision, "system" | "rejected">;

export type LeadIntelligencePropertyMatch = {
  propertyId: string;
  property: {
    id: string;
    reference: string | null;
    title: string | null;
    location: string | null;
    propertyType: string | null;
    price: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    primaryImageUrl: string | null;
    imageUrl?: string | null;
    gallery?: string[] | null;
    publicUrl: string | null;
  };
  score: number;
  eligibility: PropertyMatchEligibility;
  dataQualityScore: number;
  reasonsForMatch: string[];
  concerns: string[];
  questionsToVerify: string[];
  budgetResult: {
    outcome: "pass" | "fail" | "unknown" | "penalty" | "not_applicable";
    reason: string;
    expected: unknown;
    actual: unknown;
  } | null;
};

export function shortPropertyId(propertyId: string) {
  return propertyId.length > 12 ? `${propertyId.slice(0, 8)}...${propertyId.slice(-4)}` : propertyId;
}

export function formatCurrency(value: number | null, currency = "EUR") {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: 0,
    }).format(value);
  }
}

export function matchPropertyImageUrl(match: LeadIntelligencePropertyMatch) {
  return match.property.primaryImageUrl || match.property.imageUrl || match.property.gallery?.[0] || null;
}

export function propertyFactsLine(match: LeadIntelligencePropertyMatch) {
  const parts = [
    match.property.reference ? `Ref ${match.property.reference}` : null,
    match.property.location,
    match.property.propertyType,
    formatCurrency(match.property.price),
    match.property.bedrooms === null ? null : `${match.property.bedrooms} sov`,
    match.property.bathrooms === null ? null : `${match.property.bathrooms} bad`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function propertyDisplayName(match: LeadIntelligencePropertyMatch) {
  return match.property.title || match.property.reference || shortPropertyId(match.propertyId);
}

export function propertyEligibilityVariant(eligibility: PropertyMatchEligibility) {
  if (eligibility === "eligible") return "success";
  if (eligibility === "rejected") return "destructive";
  return "warning";
}

export function matchReviewDecisionLabel(decision: MatchReviewDecision) {
  switch (decision) {
    case "current":
      return "Aktuell";
    case "maybe":
      return "Kanskje";
    case "needs_research":
      return "Må undersøkes";
    case "rejected":
      return "Avvist";
    case "system":
    default:
      return "Systemforslag";
  }
}

export function matchReviewDecisionVariant(decision: MatchReviewDecision) {
  switch (decision) {
    case "current":
      return "success";
    case "maybe":
    case "needs_research":
      return "warning";
    case "rejected":
      return "destructive";
    case "system":
    default:
      return "secondary";
  }
}

export function PropertyEligibilityBadge({ eligibility }: { eligibility: PropertyMatchEligibility }) {
  return <Badge variant={propertyEligibilityVariant(eligibility)}>{eligibility}</Badge>;
}

export function MatchReviewDecisionBadge({ decision }: { decision: MatchReviewDecision }) {
  return <Badge variant={matchReviewDecisionVariant(decision)}>{matchReviewDecisionLabel(decision)}</Badge>;
}

export function PropertyMatchThumbnail({ match }: { match: LeadIntelligencePropertyMatch }) {
  const imageUrl = matchPropertyImageUrl(match);
  const title = propertyDisplayName(match);

  return (
    <div className="h-20 w-28 flex-none overflow-hidden rounded-md border border-slate-800 bg-slate-950 sm:h-24 sm:w-32">
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-slate-500">
          <Building2 className="h-6 w-6" aria-hidden="true" />
          <span className="sr-only">Ingen bilde i eiendomsdata</span>
        </div>
      )}
    </div>
  );
}

export function PropertyMatchHeroImage({ match }: { match: LeadIntelligencePropertyMatch }) {
  const imageUrl = matchPropertyImageUrl(match);
  const title = propertyDisplayName(match);

  return imageUrl ? (
    <img src={imageUrl} alt={title} className="h-44 w-full object-cover" loading="lazy" />
  ) : (
    <div className="flex h-44 items-center justify-center bg-slate-900 text-sm text-slate-500">
      <Building2 className="mr-2 h-5 w-5" aria-hidden="true" />
      Ingen bilde i eiendomsdata
    </div>
  );
}

export function MatchList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-300">
          {items.map((item) => (
            <li key={item} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      )}
    </div>
  );
}
