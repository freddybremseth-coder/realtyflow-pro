"use client";

import type { ComponentProps } from "react";

import { LeadIntelligenceActiveWorklistProfilePanel } from "@/components/lead-intelligence/lead-intelligence-active-worklist-profile-panel";
import type {
  LeadIntelligenceWorklistResponse,
  SafeErrorResponse,
} from "@/components/lead-intelligence/lead-intelligence-client-types";
import { LeadIntelligenceErrorAlert } from "@/components/lead-intelligence/lead-intelligence-error-alert";
import { LeadIntelligenceWorklistCard } from "@/components/lead-intelligence/lead-intelligence-worklist-card";
import { LeadIntelligenceWorklistHistoryPanel } from "@/components/lead-intelligence/lead-intelligence-worklist-history-panel";
import { LeadIntelligenceWorklistResultNotice } from "@/components/lead-intelligence/lead-intelligence-worklist-result-notice";

type ActiveWorklistProfilePanelProps = ComponentProps<typeof LeadIntelligenceActiveWorklistProfilePanel>;
type WorklistHistoryPanelProps = ComponentProps<typeof LeadIntelligenceWorklistHistoryPanel>;

interface LeadIntelligenceWorklistSectionProps {
  featureEnabled: boolean;
  persistenceEnabled: boolean;
  worklistLoading: boolean;
  worklistError: SafeErrorResponse["error"] | null;
  worklistResult: LeadIntelligenceWorklistResponse | null;
  archivedBuyerProfileId: string | null;
  hasActiveWorklistItem: boolean;
  activeProfilePanelProps: ActiveWorklistProfilePanelProps | null;
  historyPanelProps: WorklistHistoryPanelProps | null;
  onLoadWorklist: () => void;
}

export function LeadIntelligenceWorklistSection({
  featureEnabled,
  persistenceEnabled,
  worklistLoading,
  worklistError,
  worklistResult,
  archivedBuyerProfileId,
  hasActiveWorklistItem,
  activeProfilePanelProps,
  historyPanelProps,
  onLoadWorklist,
}: LeadIntelligenceWorklistSectionProps) {
  if (!featureEnabled) {
    return null;
  }

  return (
    <LeadIntelligenceWorklistCard
      persistenceEnabled={persistenceEnabled}
      worklistLoading={worklistLoading}
      onLoadWorklist={onLoadWorklist}
    >
      {!persistenceEnabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Arbeidslisten krever persistence-flagget, fordi den bare leser allerede lagrede intake- og
          buyer-profile-rader.
        </div>
      )}

      {worklistError && (
        <LeadIntelligenceErrorAlert
          error={worklistError}
          className="p-4"
          detailsClassName="mt-3 max-h-40 border border-red-400/20 bg-red-950/30 text-red-100/90"
        />
      )}

      {persistenceEnabled && !worklistResult && !worklistLoading && !worklistError && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-6 text-sm text-slate-400">
          Arbeidslisten hentes automatisk. Trykk Oppdater lagrede saker hvis du nettopp har lagret noe i en
          annen fane.
        </div>
      )}

      {worklistResult && worklistResult.result.items.length === 0 && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-6 text-sm text-slate-400">
          Ingen lagrede Lead Intelligence-saker for dette brandet ennå.
        </div>
      )}

      {worklistResult && worklistResult.result.items.length > 0 && (
        <>
          <LeadIntelligenceWorklistResultNotice
            itemCount={worklistResult.result.items.length}
            archivedBuyerProfileId={archivedBuyerProfileId}
            hasActiveWorklistItem={hasActiveWorklistItem}
          />
          {activeProfilePanelProps && <LeadIntelligenceActiveWorklistProfilePanel {...activeProfilePanelProps} />}
          {historyPanelProps && <LeadIntelligenceWorklistHistoryPanel {...historyPanelProps} />}
        </>
      )}
    </LeadIntelligenceWorklistCard>
  );
}
