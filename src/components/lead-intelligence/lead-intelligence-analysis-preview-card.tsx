"use client";

import type { ReactNode } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LeadIntelligenceAnalysisPreviewCardProps {
  loading: boolean;
  hasResponse: boolean;
  children: ReactNode;
}

export function LeadIntelligenceAnalysisPreviewCard({
  loading,
  hasResponse,
  children,
}: LeadIntelligenceAnalysisPreviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysepreview</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasResponse && !loading && (
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-8 text-center text-slate-400">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-slate-500" />
            <p className="font-medium text-slate-300">Ingen analyse ennå.</p>
            <p className="mt-1 text-sm">Lim inn en henvendelse og kjør analysen for å se forslag her.</p>
          </div>
        )}

        {loading && (
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-8 text-center text-slate-300">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary-400" />
            <p>Analyserer henvendelsen med strukturert output...</p>
          </div>
        )}

        {children}
      </CardContent>
    </Card>
  );
}
