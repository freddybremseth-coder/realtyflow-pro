"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LeadSummary = {
  total: number;
  queued: number;
  qualified: number;
  demoCreated: number;
  outreachReady: number;
  contacted: number;
  converted: number;
};

const EMPTY_SUMMARY: LeadSummary = {
  total: 0,
  queued: 0,
  qualified: 0,
  demoCreated: 0,
  outreachReady: 0,
  contacted: 0,
  converted: 0,
};

export function LeadPipelineCard() {
  const [summary, setSummary] = useState<LeadSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/saas/demosites/leads", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente pipeline.");
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente pipeline.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <Card className="border-cyan-500/20 bg-slate-800/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white"><Target className="h-5 w-5 text-cyan-300" />DemoSites Lead Pipeline</CardTitle>
        <CardDescription>Intern oversikt for firmaer som senere kan analyseres og få DemoSites-preview.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        {loading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-300" /></div> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
            <Metric label="Firma" value={summary.total} />
            <Metric label="Klar scan" value={summary.queued} />
            <Metric label="Kvalifisert" value={summary.qualified} />
            <Metric label="Demo" value={summary.demoCreated} />
            <Metric label="Klar" value={summary.outreachReady} />
            <Metric label="Dialog" value={summary.contacted} />
            <Metric label="Kjøpt" value={summary.converted} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-950/60 p-3 text-center"><div className="text-lg font-bold text-white">{value}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div></div>;
}
