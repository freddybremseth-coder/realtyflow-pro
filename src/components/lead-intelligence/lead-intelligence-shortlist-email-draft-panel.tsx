"use client";

import { Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

interface LeadIntelligenceShortlistEmailDraftPanelProps {
  subject: string;
  body: string;
  copyState: CopyState;
  onCopy: () => void;
}

export function LeadIntelligenceShortlistEmailDraftPanel({
  subject,
  body,
  copyState,
  onCopy,
}: LeadIntelligenceShortlistEmailDraftPanelProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            E-postutkast
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-100">{subject}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <Clipboard className="mr-2 h-4 w-4" />
          Kopier e-postutkast
        </Button>
      </div>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-200">{body}</pre>
      {copyState === "copied" && (
        <p className="mt-2 text-xs text-emerald-300">E-postutkast kopiert.</p>
      )}
      {copyState === "failed" && (
        <p className="mt-2 text-xs text-red-300">Kunne ikke kopiere e-postutkastet.</p>
      )}
    </div>
  );
}
