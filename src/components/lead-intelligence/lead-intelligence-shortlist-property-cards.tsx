"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  MatchReviewDecisionBadge,
  PropertyEligibilityBadge,
  PropertyMatchHeroImage,
  propertyDisplayName,
  propertyFactsLine,
} from "@/components/lead-intelligence/property-match-display";
import {
  PropertyNavigationLinks,
  leadIntelligenceMatchReturnUrl,
} from "@/components/lead-intelligence/presentation-preview-panel";
import {
  humanizedMatchReasonItems,
  uniquePresentationItems,
  type SelectedShortlistMatch,
} from "@/components/lead-intelligence/shortlist-presentation-drafts";

interface LeadIntelligenceShortlistPropertyCardsProps {
  matches: SelectedShortlistMatch[];
  returnBaseUrl: string;
}

export function LeadIntelligenceShortlistPropertyCards({
  matches,
  returnBaseUrl,
}: LeadIntelligenceShortlistPropertyCardsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">Boligkort</p>
          <p className="mt-1 text-xs text-slate-500">
            Kortene er et internt utkast Freddy kan kvalitetssikre før noe deles med kunden.
          </p>
        </div>
        <Badge variant="outline">{matches.length} valgt</Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {matches.map((match) => {
          const verification = uniquePresentationItems([
            ...match.concerns.slice(0, 2),
            ...match.questionsToVerify.slice(0, 2),
          ], 4);
          const reasons = humanizedMatchReasonItems(match.reasonsForMatch, 3);

          return (
            <div
              key={match.propertyId}
              className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60"
            >
              <PropertyMatchHeroImage match={match} />
              <div className="space-y-3 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{propertyDisplayName(match)}</p>
                    {propertyFactsLine(match) && (
                      <p className="mt-1 text-xs text-slate-400">{propertyFactsLine(match)}</p>
                    )}
                  </div>
                  <MatchReviewDecisionBadge decision={match.decision} />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Score {match.score}</Badge>
                  <Badge variant="outline">Data {match.dataQualityScore}</Badge>
                  <PropertyEligibilityBadge eligibility={match.eligibility} />
                </div>
                <PropertyNavigationLinks
                  propertyId={match.propertyId}
                  publicUrl={match.property.publicUrl}
                  returnTo={leadIntelligenceMatchReturnUrl(returnBaseUrl, match.propertyId)}
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Hvorfor den passer
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-200">
                    {(reasons.length > 0 ? reasons : ["Matcher deler av behovet."]).map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Må avklares
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-100">
                    {(verification.length > 0
                      ? verification
                      : ["Pris, tilgjengelighet og nøkkelfakta må bekreftes."]).map((item) => (
                      <li key={item} className="flex gap-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
