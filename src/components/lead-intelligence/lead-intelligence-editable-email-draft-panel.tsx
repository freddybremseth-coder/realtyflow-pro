"use client";

import { Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

interface LeadIntelligenceEditableEmailDraftPanelProps {
  title: string;
  description: string;
  subjectInputId: string;
  bodyInputId: string;
  subject: string;
  body: string;
  rows: number;
  copyTextLabel: string;
  textCopyState: CopyState;
  htmlCopyState: CopyState;
  textCopiedMessage: string;
  textFailedMessage: string;
  htmlCopiedMessage: string;
  htmlFailedMessage: string;
  bodyHtml?: string | null;
  showActions?: boolean;
  showHtmlPreview?: boolean;
  className?: string;
  onCopyText: () => void;
  onCopyHtml: () => void;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
}

export function LeadIntelligenceEditableEmailDraftPanel({
  title,
  description,
  subjectInputId,
  bodyInputId,
  subject,
  body,
  rows,
  copyTextLabel,
  textCopyState,
  htmlCopyState,
  textCopiedMessage,
  textFailedMessage,
  htmlCopiedMessage,
  htmlFailedMessage,
  bodyHtml,
  showActions = true,
  showHtmlPreview = true,
  className = "rounded-lg border border-emerald-400/20 bg-slate-950/70 p-3",
  onCopyText,
  onCopyHtml,
  onSubjectChange,
  onBodyChange,
}: LeadIntelligenceEditableEmailDraftPanelProps) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/70">
            {title}
          </p>
          <p className="mt-1 text-xs text-emerald-100/70">{description}</p>
        </div>
        {showActions && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCopyText}>
              <Clipboard className="mr-2 h-4 w-4" />
              {copyTextLabel}
            </Button>
            {bodyHtml && (
              <Button type="button" variant="outline" size="sm" onClick={onCopyHtml}>
                <Clipboard className="mr-2 h-4 w-4" />
                Kopier HTML
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-3">
        <label className="block text-xs font-semibold text-slate-300" htmlFor={subjectInputId}>
          Emne
        </label>
        <input
          id={subjectInputId}
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-500"
        />
        <label className="block text-xs font-semibold text-slate-300" htmlFor={bodyInputId}>
          E-posttekst
        </label>
        <textarea
          id={bodyInputId}
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          rows={rows}
          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
        />
      </div>

      {showHtmlPreview && bodyHtml && (
        <details className="mt-3 rounded border border-slate-800 bg-slate-950/60 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-emerald-100">
            HTML-versjon
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-100">
            {bodyHtml}
          </pre>
        </details>
      )}

      <p className="mt-2 text-xs text-emerald-100/70">
        Dette er kun et draft-preview. Det finnes ingen send-knapp i denne fasen.
      </p>
      {textCopyState === "copied" && (
        <p className="mt-2 text-xs text-emerald-300">{textCopiedMessage}</p>
      )}
      {textCopyState === "failed" && (
        <p className="mt-2 text-xs text-red-300">{textFailedMessage}</p>
      )}
      {htmlCopyState === "copied" && (
        <p className="mt-2 text-xs text-emerald-300">{htmlCopiedMessage}</p>
      )}
      {htmlCopyState === "failed" && (
        <p className="mt-2 text-xs text-red-300">{htmlFailedMessage}</p>
      )}
    </div>
  );
}
