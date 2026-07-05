"use client";

import { CheckCircle2, Clipboard } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

interface LeadIntelligenceJsonEditorPanelProps {
  value: string;
  error: string | null;
  copyState: CopyState;
  onChange: (value: string) => void;
  onCopy: () => void;
}

export function LeadIntelligenceJsonEditorPanel({
  value,
  error,
  copyState,
  onChange,
  onCopy,
}: LeadIntelligenceJsonEditorPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-200">Rediger hele AI-forslaget lokalt</h2>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <Clipboard className="mr-2 h-4 w-4" />
          Kopier JSON
        </Button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={18}
        className="w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-primary-500"
      />
      <div className="flex items-center gap-2 text-xs">
        {error ? (
          <span className="text-amber-300">JSON er ikke gyldig: {error}</span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Lokalt preview er gyldig JSON.
          </span>
        )}
        {copyState === "copied" && <span className="text-primary-300">Kopiert.</span>}
        {copyState === "failed" && <span className="text-red-300">Kunne ikke kopiere.</span>}
      </div>
    </div>
  );
}
