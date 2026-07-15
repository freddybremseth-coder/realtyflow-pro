"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Sparkles, Target } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LeadSummary = {
  total: number;
  queued: number;
  qualified: number;
  demoCreated: number;
  outreachReady: number;
  contacted: number;
  converted: number;
};

type RecommendedPlay = {
  leadId: string;
  companyName: string;
  title: string;
  primaryAction: string;
  reason: string;
  href: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
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
  const [recommendedPlay, setRecommendedPlay] = useState<RecommendedPlay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  async function runBulkDemos() {
    setBulkRunning(true);
    setBulkStatus(null);
    setError(null);
    try {
      const response = await fetch("/api/saas/demosites/leads/bulk-demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bulk-generering feilet.");
      const failed = (data.results || []).filter((r: { ok: boolean }) => !r.ok).length;
      setBulkStatus(
        `${data.created} prøveside${data.created === 1 ? "" : "r"} laget${failed ? `, ${failed} feilet` : ""}. ` +
        (data.remaining > 0 ? `${data.remaining} leads gjenstår — kjør igjen for neste batch.` : "Alle kvalifiserte leads har nå prøveside.")
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk-generering feilet.");
    } finally {
      setBulkRunning(false);
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/saas/demosites/leads", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente pipeline.");
      setSummary(data.summary || EMPTY_SUMMARY);
      setRecommendedPlay(data.recommendedPlay || null);
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
          <>
            {recommendedPlay && (
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
                        <Sparkles className="mr-1 h-3 w-3" /> AI anbefaler
                      </span>
                      <span className="rounded-full border border-slate-600 bg-slate-950/60 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                        {recommendedPlay.priority} · {recommendedPlay.score}/100
                      </span>
                    </div>
                    <p className="font-semibold text-white">{recommendedPlay.title}</p>
                    <p className="mt-1 text-sm text-slate-200">{recommendedPlay.primaryAction}</p>
                    <p className="mt-2 text-xs text-slate-500">Hvorfor: {recommendedPlay.reason}</p>
                  </div>
                  <Button asChild size="sm">
                    <Link href={recommendedPlay.href}>
                      Åpne play
                      <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={runBulkDemos} disabled={bulkRunning} className="bg-cyan-600 hover:bg-cyan-500">
                {bulkRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {bulkRunning ? "Lager prøvesider…" : `Lag prøvesider for kvalifiserte (${summary.qualified})`}
              </Button>
              {bulkStatus && <span className="text-xs text-emerald-300">{bulkStatus}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
              <Metric label="Firma" value={summary.total} />
              <Metric label="Klar scan" value={summary.queued} />
              <Metric label="Kvalifisert" value={summary.qualified} />
              <Metric label="Demo" value={summary.demoCreated} />
              <Metric label="Klar" value={summary.outreachReady} />
              <Metric label="Dialog" value={summary.contacted} />
              <Metric label="Kjøpt" value={summary.converted} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-slate-950/60 p-3 text-center"><div className="text-lg font-bold text-white">{value}</div><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div></div>;
}
