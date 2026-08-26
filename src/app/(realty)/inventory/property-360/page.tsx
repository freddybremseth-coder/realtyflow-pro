"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CircleDollarSign, Loader2, MapPin, RefreshCw, Target, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BuyerMatch {
  shortlistId: string;
  buyerProfileId: string;
  contactId: string | null;
  contactName: string;
  contactEmail: string | null;
  score: number;
  priority: "HOT" | "WARM" | "WATCH";
  pipelineStatus: string;
  purchaseReadiness: string | null;
  reason: string;
  reasons: string[];
  concerns: string[];
  questionsToVerify: string[];
  shortlistStatus: string | null;
  shortlistTitle: string | null;
}

interface Payload {
  property: { id?: string | null; reference?: string | null; title?: string | null; location?: string | null; price?: number | null };
  matches: BuyerMatch[];
  evidenceCount: number;
  message?: string;
}

function money(value: unknown) {
  const number = Number(value || 0);
  return number > 0 ? new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(number) : "Pris ikke lagret";
}

function priorityClass(priority: BuyerMatch["priority"]) {
  if (priority === "HOT") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (priority === "WARM") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

export default function Property360Page() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const source = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    for (const key of ["propertyId", "reference", "title"]) {
      const value = source.get(key);
      if (value) params.set(key, value);
    }
    setQuery(params.toString());
  }, []);

  async function load(currentQuery = query) {
    if (!currentQuery) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/properties/360?${currentQuery}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Property 360.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Property 360.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (query) void load(query);
  }, [query]);

  const hotCount = useMemo(() => data?.matches.filter((item) => item.priority === "HOT").length || 0, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/inventory" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} />Til inventory</Link>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-cyan-300"><Building2 size={17} /> Property 360</div>
            <h1 className="mt-2 text-3xl font-bold text-white">{data?.property.title || data?.property.reference || "Bolig"}</h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
              {data?.property.location && <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{data.property.location}</span>}
              <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={15} />{money(data?.property.price)}</span>
              {data?.property.reference && <span>Ref: {data.property.reference}</span>}
            </div>
          </div>
          <Button onClick={() => void load()} disabled={loading || !query}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><Users className="text-cyan-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Matchende kjøpere</p><strong className="mt-1 block text-2xl text-white">{data?.matches.length || 0}</strong></article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><Target className="text-red-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Hot buyers</p><strong className="mt-1 block text-2xl text-white">{hotCount}</strong></article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><UserRound className="text-purple-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Lagret match-evidens</p><strong className="mt-1 block text-2xl text-white">{data?.evidenceCount || 0}</strong></article>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Best matching buyers</h2><p className="mt-1 text-sm text-slate-400">Basert på lagrede Lead Intelligence-shortlists, matchscore og kundens pipeline-fase. Ingen nye matcher opprettes her.</p></div></div>

        {loading && !data ? <div className="flex min-h-56 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Henter lagret match-evidens …</div> : !data?.matches.length ? (
          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/30 p-6 text-sm text-slate-400">{data?.message || "Ingen lagrede buyer matches er funnet for denne boligen ennå."}</div>
        ) : (
          <div className="mt-5 space-y-3">
            {data.matches.map((match, index) => (
              <article key={`${match.buyerProfileId}-${match.shortlistId}`} className="rounded-xl border border-slate-700 bg-slate-950/35 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">#{index + 1}</span><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(match.priority)}`}>{match.priority}</span><span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300">{match.pipelineStatus}</span></div>
                    <h3 className="mt-3 text-lg font-semibold text-white">{match.contactName}</h3>
                    {match.contactEmail && <p className="mt-1 text-sm text-slate-500">{match.contactEmail}</p>}
                    <p className="mt-3 text-sm leading-6 text-slate-300"><strong className="text-slate-100">Hvorfor:</strong> {match.reason}</p>
                    {match.reasons.length > 1 && <p className="mt-2 text-xs text-emerald-300">Andre styrker: {match.reasons.slice(1, 4).join(" · ")}</p>}
                    {match.concerns.length > 0 && <p className="mt-2 text-xs text-amber-300">Vær obs på: {match.concerns.slice(0, 3).join(" · ")}</p>}
                    {match.questionsToVerify.length > 0 && <p className="mt-2 text-xs text-slate-400">Må verifiseres: {match.questionsToVerify.slice(0, 3).join(" · ")}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-3"><div className="text-right"><span className="text-xs uppercase tracking-wide text-slate-500">Match</span><strong className="block text-3xl text-white">{match.score}</strong></div>{match.contactId && <Button asChild size="sm"><Link href={`/customers?contactId=${encodeURIComponent(match.contactId)}`}>Åpne Customer 360</Link></Button>}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
