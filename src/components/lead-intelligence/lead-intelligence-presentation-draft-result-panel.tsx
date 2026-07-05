"use client";

import type { ReactNode } from "react";
import { Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InternalPresentationPreview,
} from "@/components/lead-intelligence/presentation-preview-panel";
import type { PresentationDraftResponse } from "@/components/lead-intelligence/lead-intelligence-client-types";

type PresentationDraftResult = PresentationDraftResponse["result"];
type DraftStatusMode = "compact" | "full";

interface LeadIntelligencePresentationDraftResultPanelProps {
  draft: PresentationDraftResult;
  returnTo: string | null;
  anchorCards: boolean;
  highlightedMatchId: string | null;
  statusMode: DraftStatusMode;
  className: string;
  showCopyActions?: boolean;
  onCopyEmailText?: () => void;
  onCopyEmailHtml?: () => void;
  children?: ReactNode;
}

function presentationDraftStatusText(draft: PresentationDraftResult, statusMode: DraftStatusMode) {
  const prefix = `Status: ${draft.status} · E-poststatus: ${draft.messageStatus} ·`;

  if (statusMode === "full") {
    return `${prefix} E-post sendt: nei · Leads opprettet: nei · Kontakter opprettet: nei · Presentasjon publisert: nei · Property matching-jobb startet: nei`;
  }

  return `${prefix} E-post sendt: nei · Presentasjon publisert: nei`;
}

export function LeadIntelligencePresentationDraftResultPanel({
  draft,
  returnTo,
  anchorCards,
  highlightedMatchId,
  statusMode,
  className,
  showCopyActions = false,
  onCopyEmailText,
  onCopyEmailHtml,
  children,
}: LeadIntelligencePresentationDraftResultPanelProps) {
  return (
    <div className={className}>
      <div>
        <p className={statusMode === "full" ? "font-semibold" : "font-semibold text-emerald-50"}>
          {draft.loadedFromHistory
            ? "Lagret presentasjonsutkast hentet read-only."
            : draft.duplicate
            ? "Identisk presentasjonsutkast var allerede lagret."
            : "Presentasjonsutkast lagret som draft uten eksterne sideeffekter."}
        </p>
        <p className={statusMode === "full" ? "mt-1 text-emerald-100/80" : "mt-1 text-xs text-emerald-100/70"}>
          Presentation {draft.presentationId} · Message draft {draft.messageDraftId}
        </p>
        <p className="mt-1 text-xs text-emerald-100/70">
          {presentationDraftStatusText(draft, statusMode)}
        </p>
      </div>

      {showCopyActions && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onCopyEmailText && (
            <Button type="button" variant="outline" size="sm" onClick={onCopyEmailText}>
              <Clipboard className="mr-2 h-4 w-4" />
              Kopier e-posttekst
            </Button>
          )}
          {draft.messageDraft.bodyHtml && onCopyEmailHtml && (
            <Button type="button" variant="outline" size="sm" onClick={onCopyEmailHtml}>
              <Clipboard className="mr-2 h-4 w-4" />
              Kopier HTML
            </Button>
          )}
        </div>
      )}

      <InternalPresentationPreview
        preview={draft.presentationPreview}
        returnTo={returnTo}
        anchorCards={anchorCards}
        highlightedMatchId={highlightedMatchId}
      />

      {children}
    </div>
  );
}
