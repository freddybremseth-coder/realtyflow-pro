"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, UserRoundSearch } from "lucide-react";

interface BackfillItem {
  contact: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    pipelineStatus?: string | null;
    pipelineValue?: number | null;
    propertyInterest?: string | null;
    preferredLocation?: string | null;
    source?: string | null;
    brandId?: string | null;
  };
  candidate: {
    persona: string | null;
    confidence: number;
    evidence: Array<{ field: string; signal: string; excerpt: string; weight: number }>;
    missingInformation: string[];
    reason: string;
    requiresHumanReview: true;
  };
}

interface BackfillResponse {
  generatedAt: string;
  summary: {
    scanned: number;
    alreadyApproved: number;
    remaining: number;
    proposed: number;
    needsDiscovery: number;
    highConfidence: number;
  };
  items: BackfillItem[];
  safety: Record<string, boolean>;
}

const PERSONA_LABELS: Record<string, string> = {
  retiree: "Retirement Spain",
  family: "Family",
  investor: "Investment / Rental",
  holiday_home: "Holiday Home",
  permanent_resident: "Permanent Relocation",
  nature_seeker: "Nature / Inland",
  coastal_social: "Coastal / Social",
};

function money(value: unknown) {
  const amount = Number(value || 0);
  if (!amount) return "Budsjett mangler";
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
}

function bucket(item: BackfillItem) {
  if (!item.candidate.persona) return "discovery";
  return item.candidate.confidence >= 80 ? "strong" : "review";
}

export default function PersonaBackfillPage() {
  const [data, setData] = useState<BackfillResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "strong" | "review" | "discovery">("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/persona-backfill/preview?limit=250", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Persona Backfill.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Persona Backfill.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.items || []).filter((item) => {
      const itemBucket = bucket(item);
      if (filter !== "all" && itemBucket !== filter) return false;
      if (!query) return true;
      return [
        item.contact.name,
        item.contact.email,
        item.contact.phone,
        item.contact.propertyInterest,
        item.contact.preferredLocation,
        item.contact.source,
        item.candidate.persona ? PERSONA_LABELS[item.candidate.persona] || item.candidate.persona : "",
        ...item.candidate.evidence.map((row) => `${row.signal} ${row.excerpt}`),
      ].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [data, search, filter]);

  return <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-violet-700"><UserRoundSearch className="h-4 w-4" /> Persona Backfill</div>
          <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Forstå eksisterende CRM før vi automatiserer mer</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only analyse av eksisterende kundedata. Nexus foreslår kun Persona når dokumentert CRM-evidens er tydelig nok. Alle forslag krever menneskelig review før de kan bli Buyer Profile-kriterier.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Oppdater analyse
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Sikker modus</div>
        <p className="mt-1">Ingen CRM-data, Buyer Profiles, nurture-status eller e-post endres fra denne siden. Persona-kandidater påvirker ikke utsendelser før de senere er eksplisitt godkjent.</p>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Skannet", data?.summary.scanned ?? 0],
          ["Har godkjent Persona", data?.summary.alreadyApproved ?? 0],
          ["Til vurdering", data?.summary.remaining ?? 0],
          ["Forslag", data?.summary.proposed ?? 0],
          ["Sterk kandidat", data?.summary.highConfidence ?? 0],
          ["Mangler evidens", data?.summary.needsDiscovery ?? 0],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>)}
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk navn, område, evidens eller Persona…" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-violet-500" /></div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            ["all", "Alle"], ["strong", "Sterk kandidat"], ["review", "Må vurderes"], ["discovery", "Mangler info"],
          ] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${filter === key ? "bg-violet-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{label}</button>)}
        </div>
      </div>
    </section>

    <section className="mt-5 space-y-3">
      {loading && !data ? <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white p-10 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Analyserer CRM…</div> : null}
      {!loading && items.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">Ingen kontakter matcher dette filteret.</div> : null}

      {items.map((item) => {
        const state = bucket(item);
        const strong = state === "strong";
        const discovery = state === "discovery";
        return <article key={item.contact.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-slate-950">{item.contact.name || "Uten navn"}</h3>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${strong ? "bg-emerald-100 text-emerald-800" : discovery ? "bg-amber-100 text-amber-800" : "bg-violet-100 text-violet-800"}`}>
                  {strong ? "Sterk kandidat" : discovery ? "Mangler informasjon" : "Må vurderes"}
                </span>
                {item.candidate.persona ? <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-black text-white">{PERSONA_LABELS[item.candidate.persona] || item.candidate.persona}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                <span>{item.contact.pipelineStatus || "Ukjent status"}</span><span>{money(item.contact.pipelineValue)}</span><span>{item.contact.preferredLocation || item.contact.propertyInterest || "Område ikke registrert"}</span><span>{item.contact.source || "Kilde ukjent"}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{item.candidate.reason}</p>
            </div>
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-center"><div className="text-2xl font-black text-slate-950">{item.candidate.confidence}%</div><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">confidence</div></div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600"><Sparkles className="h-4 w-4" /> Dokumentert evidens</div>
              <div className="mt-3 space-y-2">
                {item.candidate.evidence.length ? item.candidate.evidence.map((row, index) => <div key={`${row.field}-${row.signal}-${index}`} className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-black text-slate-800">{row.signal}</div><div className="mt-1 text-xs leading-5 text-slate-600">“{row.excerpt}”</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.field}</div></div>) : <div className="text-sm text-slate-500">Ingen sterk evidens i eksisterende CRM-data.</div>}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600">{item.candidate.missingInformation.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} Hva bør avklares</div>
              <div className="mt-3 flex flex-wrap gap-2">{item.candidate.missingInformation.length ? item.candidate.missingInformation.map((value) => <span key={value} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">{value}</span>) : <span className="text-sm text-emerald-700">Ingen åpenbare datagap for selve Persona-forslaget.</span>}</div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/customers?contactId=${encodeURIComponent(item.contact.id)}`} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">Åpne Customer 360</Link>
                <Link href="/nexus-os/buyer-intake/reviews" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">Åpne review-system</Link>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">Neste fase kan legge til eksplisitt godkjenning som oppretter en versjonert Buyer Profile-kriteriepost. Denne siden skriver ingenting.</p>
            </div>
          </div>
        </article>;
      })}
    </section>
  </main>;
}
