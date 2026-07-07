"use client";

import { Badge } from "@/components/ui/badge";
import { shortPropertyId } from "@/components/lead-intelligence/property-match-display";
import type { LeadIntelligenceWorklistItem } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";

interface LeadIntelligenceActiveProfileHeaderProps {
  activeWorklistItem: LeadIntelligenceWorklistItem;
  propertyMatchingEnabled: boolean;
}

export function LeadIntelligenceActiveProfileHeader({
  activeWorklistItem,
  propertyMatchingEnabled,
}: LeadIntelligenceActiveProfileHeaderProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-primary-300">Aktiv lagret profil</p>
        <h2 className="mt-1 text-base font-semibold text-slate-100">
          {activeWorklistItem.summary || `Buyer profile ${shortPropertyId(activeWorklistItem.buyerProfileId)}`}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Buyer profile {activeWorklistItem.buyerProfileId} · kriterier {activeWorklistItem.criterionCount}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="default">Valgt for videre arbeid</Badge>
        <Badge variant={propertyMatchingEnabled ? "success" : "secondary"}>
          {propertyMatchingEnabled ? "Match aktivert" : "Matching av"}
        </Badge>
        <Badge variant={activeWorklistItem.contactLinked ? "success" : "outline"}>
          {activeWorklistItem.contactLinked ? "Kontakt koblet" : "Kontakt ikke koblet"}
        </Badge>
      </div>
    </div>
  );
}
