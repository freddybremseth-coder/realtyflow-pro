"use client";

import { Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InternalPresentationPreview,
  type LeadIntelligencePresentationPreview,
} from "@/components/lead-intelligence/presentation-preview-panel";

type CopyState = "idle" | "copied" | "failed";

interface LoadedPresentationDraft {
  presentationId: string;
  messageDraftId: string;
  status: "draft" | "approved" | "archived";
  messageStatus: "draft" | "approved" | "cancelled";
  messageDraft: {
    bodyHtml: string | null;
  };
  presentationPreview: LeadIntelligencePresentationPreview;
}

interface LeadIntelligenceLoadedPresentationDraftPanelProps {
  draft: LoadedPresentationDraft;
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

export function LeadIntelligenceLoadedPresentationDraftPanel({
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
}: LeadIntelligenceLoadedPresentationDraftPanelProps) {
  return (
    <div
      id="lead-intelligence-active-presentation-draft"
      className="rounded-lg border border-emerald-400/30 bg-slate-950/80 p-3 text-sm text-emerald-100"
    >
      <p className="font-semibold text-emerald-50">Lagret presentasjonsutkast hentet read-only.</p>
      <p className="mt-1 text-xs text-emerald-100/70">
        Presentation {draft.presentationId} · Message draft {draft.messageDraftId}
      </p>
      <p className="mt-1 text-xs text-emerald-100/70">
        Status: {draft.status} · E-poststatus: {draft.messageStatus} · E-post sendt: nei
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCopyEmailText}>
          <Clipboard className="mr-2 h-4 w-4" />
          Kopier e-posttekst
        </Button>
        {draft.messageDraft.bodyHtml && (
          <Button type="button" variant="outline" size="sm" onClick={onCopyEmailHtml}>
            <Clipboard className="mr-2 h-4 w-4" />
            Kopier HTML
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        <label
          className="block text-xs font-semibold text-slate-300"
          htmlFor="active-profile-history-email-subject"
        >
          Emne
        </label>
        <input
          id="active-profile-history-email-subject"
          value={editableEmailSubject}
          onChange={(event) => onEmailSubjectChange(event.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
        />
        <label
          className="block text-xs font-semibold text-slate-300"
          htmlFor="active-profile-history-email-body"
        >
          E-posttekst
        </label>
        <textarea
          id="active-profile-history-email-body"
          value={editableEmailBody}
          onChange={(event) => onEmailBodyChange(event.target.value)}
          rows={12}
          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
        />
      </div>
      <p className="mt-2 text-xs text-emerald-100/70">
        Endringer her er lokale. Ingen e-post sendes fra denne visningen.
      </p>
      {emailDraftCopyState === "copied" && (
        <p className="mt-2 text-xs text-emerald-300">E-posttekst kopiert.</p>
      )}
      {emailDraftCopyState === "failed" && (
        <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere e-posttekst.</p>
      )}
      {emailDraftHtmlCopyState === "copied" && (
        <p className="mt-2 text-xs text-emerald-300">HTML-utkast kopiert.</p>
      )}
      {emailDraftHtmlCopyState === "failed" && (
        <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere HTML-utkast.</p>
      )}
      <InternalPresentationPreview
        preview={draft.presentationPreview}
        returnTo={returnTo}
        anchorCards={anchorCards}
        highlightedMatchId={highlightedMatchId}
      />
    </div>
  );
}
