"use client";

import { LeadIntelligenceEditableEmailDraftPanel } from "@/components/lead-intelligence/lead-intelligence-editable-email-draft-panel";
import { LeadIntelligencePresentationDraftResultPanel } from "@/components/lead-intelligence/lead-intelligence-presentation-draft-result-panel";
import type { PresentationDraftResponse } from "@/components/lead-intelligence/lead-intelligence-client-types";

type CopyState = "idle" | "copied" | "failed";
type PresentationDraftResult = PresentationDraftResponse["result"];
type PresentationDraftEmailVariant = "active-profile" | "analysis-preview";

interface LeadIntelligencePresentationDraftEmailPanelProps {
  variant: PresentationDraftEmailVariant;
  draft: PresentationDraftResult;
  returnTo: string | null;
  anchorCards: boolean;
  highlightedMatchId: string | null;
  editableEmailSubject: string;
  editableEmailBody: string;
  emailDraftCopyState: CopyState;
  emailDraftHtmlCopyState: CopyState;
  onCopyEmailText: () => void;
  onCopyEmailHtml: () => void;
  onEmailSubjectChange: (value: string) => void;
  onEmailBodyChange: (value: string) => void;
}

export function LeadIntelligencePresentationDraftEmailPanel({
  variant,
  draft,
  returnTo,
  anchorCards,
  highlightedMatchId,
  editableEmailSubject,
  editableEmailBody,
  emailDraftCopyState,
  emailDraftHtmlCopyState,
  onCopyEmailText,
  onCopyEmailHtml,
  onEmailSubjectChange,
  onEmailBodyChange,
}: LeadIntelligencePresentationDraftEmailPanelProps) {
  const activeProfileVariant = variant === "active-profile";

  return (
    <LeadIntelligencePresentationDraftResultPanel
      draft={draft}
      returnTo={returnTo}
      anchorCards={anchorCards}
      highlightedMatchId={highlightedMatchId}
      statusMode={activeProfileVariant ? "compact" : "full"}
      className={
        activeProfileVariant
          ? "mt-3 rounded-lg border border-emerald-400/20 bg-slate-950/80 p-3"
          : "space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"
      }
      showCopyActions={activeProfileVariant}
      onCopyEmailText={onCopyEmailText}
      onCopyEmailHtml={onCopyEmailHtml}
    >
      <LeadIntelligenceEditableEmailDraftPanel
        title="Rediger e-postutkast lokalt"
        description={
          activeProfileVariant
            ? "Endringene lagres ikke i databasen. Kopier e-posttekst bruker teksten under."
            : "Endringene lagres ikke i databasen. Kopier tekst bruker teksten du redigerer her."
        }
        subjectInputId={
          activeProfileVariant ? "active-profile-email-subject" : "lead-intelligence-email-subject"
        }
        bodyInputId={
          activeProfileVariant ? "active-profile-email-body" : "lead-intelligence-email-body"
        }
        subject={editableEmailSubject}
        body={editableEmailBody}
        rows={activeProfileVariant ? 12 : 14}
        copyTextLabel={activeProfileVariant ? "Kopier e-posttekst" : "Kopier tekst"}
        textCopyState={emailDraftCopyState}
        htmlCopyState={emailDraftHtmlCopyState}
        textCopiedMessage={
          activeProfileVariant ? "E-posttekst kopiert." : "Lagret e-posttekst kopiert."
        }
        textFailedMessage={
          activeProfileVariant
            ? "Kunne ikke kopiere e-posttekst."
            : "Kunne ikke kopiere lagret e-posttekst."
        }
        htmlCopiedMessage={
          activeProfileVariant ? "HTML-utkast kopiert." : "Lagret HTML-utkast kopiert."
        }
        htmlFailedMessage={
          activeProfileVariant
            ? "Kunne ikke kopiere HTML-utkast."
            : "Kunne ikke kopiere lagret HTML-utkast."
        }
        bodyHtml={draft.messageDraft.bodyHtml}
        showActions={!activeProfileVariant}
        showHtmlPreview={!activeProfileVariant}
        className={
          activeProfileVariant
            ? "mt-3 rounded-lg border border-slate-800 bg-slate-950/80 p-3"
            : undefined
        }
        onCopyText={onCopyEmailText}
        onCopyHtml={onCopyEmailHtml}
        onSubjectChange={onEmailSubjectChange}
        onBodyChange={onEmailBodyChange}
      />
    </LeadIntelligencePresentationDraftResultPanel>
  );
}
