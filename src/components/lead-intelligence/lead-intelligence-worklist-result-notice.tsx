"use client";

import { shortPropertyId } from "@/components/lead-intelligence/property-match-display";

interface LeadIntelligenceWorklistResultNoticeProps {
  itemCount: number;
  archivedBuyerProfileId: string | null;
  hasActiveWorklistItem: boolean;
}

export function LeadIntelligenceWorklistResultNotice({
  itemCount,
  archivedBuyerProfileId,
  hasActiveWorklistItem,
}: LeadIntelligenceWorklistResultNoticeProps) {
  return (
    <>
      <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-4 text-sm text-primary-100">
        <p className="font-semibold">{itemCount} lagrede sak(er) hentet.</p>
        <p className="mt-1 text-primary-100/80">
          Dette er historikken over tidligere tester for valgt brand. Knappen Fortsett med denne profilen
          setter buyer profile som aktiv for match-preview uten å opprette lead, kontakt eller e-post.
        </p>
      </div>

      {archivedBuyerProfileId && !hasActiveWorklistItem && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">Profil {shortPropertyId(archivedBuyerProfileId)} er arkivert.</p>
          <p className="mt-1 text-xs text-emerald-100/75">
            Den er fjernet fra arbeidslisten, men ikke fysisk slettet. Ingen kontakt, lead, e-post,
            presentasjon eller matchingjobb ble opprettet.
          </p>
        </div>
      )}
    </>
  );
}
