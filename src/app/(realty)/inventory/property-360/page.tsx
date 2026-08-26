"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, CircleDollarSign, Copy, Loader2, MapPin, MessageSquare, RefreshCw, Search, Target, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prepareProperty360Message } from "@/lib/property-360-message";

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

type LookupMode = "propertyId" | "reference" | "title";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [lookupMode, setLookupMode] = useState<LookupMode>("reference");
  const [lookupValue, setLookupValue] = useState("");
  const [preparedFor, setPreparedFor] = useState<string | null>(null);
  const [preparedMessage, setPreparedMessage] = useState("");
  const [copied, setCopied] = useState(false);

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
    setPreparedFor(null);
    setPreparedMessage("");
    try {
      const response = await fetch(`/api/properties/360?${currentQuery}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Property 360.");
      setData(body);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Property 360.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (query) void load(query);
  }, [query]);

  function runLookup() {
    const value = lookupValue.trim();
    if (!value) return;
    const params = new URLSearchParams({ [lookupMode]: value });
    const nextQuery = params.toString();
    setQuery(nextQuery);
    window.history.replaceState(null, "", `/inventory/property-360?${nextQuery}`);
  }

  const hotCount = useMemo(() => data?.matches.filter((item) => item.priority === "HOT").length || 0, [data]);

  function prepareMessage(match: BuyerMatch) {
    if (!data) return;
    setPreparedFor(match.buyerProfileId);
    setPreparedMessage(prepareProperty360Message(data.property, match));
    setCopied(false);
  }

  async function copyPreparedMessage() {
    if (!preparedMessage) return;
    try {
      await navigator.clipboard.writeText(preparedMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/inventory" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} />Til inventory</Link>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-cyan-300"><Building2 size={17} /> Property 360</div>
            <h1 className="mt-2 text-3xl font-bold text-white">{data?.property.title || data?.property.reference || "Finn bolig og beste kjøpere"}</h1>
            {data ? (
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                {data.property.location && <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{data.property.location}</span>}
                <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={15} />{money(data.property.price)}</span>
                {data.property.reference && <span>Ref: {data.property.reference}</span>}
              </div>
            ) : <p className="mt-3 max-w-2xl text-sm text-slate-400">Slå opp en bolig via ID, referanse eller tittel. Nexus viser deretter eksisterende match-evidens og rangerer de beste kjøperne.</p>}
          </div>
          <Button onClick={() => void load()} disabled={loading || !query}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="w-full lg:w-44">
            <label className="mb-1 block text-xs font-medium text-slate-400">Søk med</label>
            <select value={lookupMode} onChange={(event) => setLookupMode(event.target.value as LookupMode)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
              <option value="reference">Referanse</option>
              <option value="propertyId">Bolig-ID</option>
              <option value="title">Tittel</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400">Bolig</label>
            <Input value={lookupValue} onChange={(event) => setLookupValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runLookup(); }} placeholder={lookupMode === "reference" ? "F.eks. SP1521" : lookupMode === "propertyId" ? "Lim inn bolig-ID" : "Skriv hele eller lagret tittel"} />
          </div>
          <Button onClick={runLookup} disabled={!lookupValue.trim() || loading}><Search size={16} className="mr-2" />Åpne Property 360</Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Dette starter ingen ny matchingjobb. Siden leser bare eksisterende Lead Intelligence-evidens.</p>
      </section>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

      {data && <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><Users className="text-cyan-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Matchende kjøpere</p><strong className="mt-1 block text-2xl text-white">{data.matches.length}</strong></article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><Target className="text-red-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Hot buyers</p><strong className="mt-1 block text-2xl text-white">{hotCount}</strong></article>
        <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><UserRound className="text-purple-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Lagret match-evidens</p><strong className="mt-1 block text-2xl text-white">{data.evidenceCount}</strong></article>
      </section>}

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-white">Best matching buyers</h2><p className="mt-1 text-sm text-slate-400">Basert på lagrede Lead Intelligence-shortlists, matchscore og kundens pipeline-fase. Ingen nye matcher opprettes her.</p></div></div>

        {!query && !data ? (
          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/30 p-8 text-center text-sm text-slate-400"><Search className="mx-auto mb-3 text-slate-600" />Søk etter en bolig over for å åpne Property 360.</div>
        ) : loading && !data ? <div className="flex min-h-56 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Henter lagret match-evidens …</div> : !data?.matches.length ? (
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
                  <div className="flex shrink-0 flex-col items-end gap-3">
                    <div className="text-right"><span className="text-xs uppercase tracking-wide text-slate-500">Match</span><strong className="block text-3xl text-white">{match.score}</strong></div>
                    <Button size="sm" variant="outline" onClick={() => prepareMessage(match)}><MessageSquare size={14} className="mr-1.5" />Prepare message</Button>
                    {match.contactId && <Button asChild size="sm"><Link href={`/customers?contactId=${encodeURIComponent(match.contactId)}`}>Åpne Customer 360</Link></Button>}
                  </div>
                </div>

                {preparedFor === match.buyerProfileId && preparedMessage && (
                  <div className="mt-4 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-4" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-cyan-100">Klargjort melding — ikke sendt</p>
                        <p className="mt-1 text-xs text-slate-400">Forslaget bruker bare lagret property- og match-evidens. Les gjennom før du bruker det.</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void copyPreparedMessage()}>
                        {copied ? <CheckCircle2 size={14} className="mr-1.5 text-emerald-400" /> : <Copy size={14} className="mr-1.5" />}
                        {copied ? "Kopiert" : "Kopier"}
                      </Button>
                    </div>
                    <textarea value={preparedMessage} onChange={(event) => setPreparedMessage(event.target.value)} className="mt-3 min-h-56 w-full rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-500/50" />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {match.contactId && <Button asChild size="sm"><Link href={`/customers?contactId=${encodeURIComponent(match.contactId)}`}>Fortsett i Customer 360</Link></Button>}
                      <span className="text-[11px] text-slate-500">Ingen e-post, SMS eller WhatsApp sendes fra denne handlingen.</span>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
