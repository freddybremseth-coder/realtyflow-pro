"use client";

import type { ReactNode } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

const toolbarLayoutClassName = {
  md: "md:flex-row md:items-center md:justify-between",
  lg: "lg:flex-row lg:items-center lg:justify-between",
} as const;

interface LeadIntelligenceShortlistDraftPanelProps {
  selectedCount: number;
  clientReadyCount: number;
  loading: boolean;
  description: string;
  layout?: keyof typeof toolbarLayoutClassName;
  onSave: () => void;
  children?: ReactNode;
}

export function LeadIntelligenceShortlistDraftPanel({
  selectedCount,
  clientReadyCount,
  loading,
  description,
  layout = "lg",
  onSave,
  children,
}: LeadIntelligenceShortlistDraftPanelProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className={`flex flex-col gap-3 ${toolbarLayoutClassName[layout]}`}>
        <div>
          <p className="text-sm font-semibold text-slate-200">Shortlist-utkast</p>
          <p className="mt-1 text-xs text-slate-500">
            Kvalitetssjekket: {selectedCount} · Klar for kunde: {clientReadyCount}. {description}
          </p>
        </div>
        <Button type="button" onClick={onSave} disabled={loading || selectedCount === 0}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Lagre shortlist-utkast
        </Button>
      </div>

      {selectedCount === 0 && (
        <p className="mt-2 text-xs text-amber-200">
          Kvalitetssjekk minst én bolig før shortlist-utkast kan lagres.
        </p>
      )}

      {selectedCount > 0 && clientReadyCount === 0 && (
        <p className="mt-2 text-xs text-amber-200">
          Ingen boliger er markert «Klar for kunde». Du kan lagre intern kvalitetssjekk, men
          presentasjonsutkast lages først når minst én bolig er klar.
        </p>
      )}

      {children}
    </div>
  );
}
