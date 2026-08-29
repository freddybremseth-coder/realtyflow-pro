"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type SourceGroup = {
  rawSource: string;
  sourceType: string;
  sourceDetail: string;
  confidence: string;
  acquisitionChannelKnown: boolean;
  contacts: number;
  rawVariants: string[];
};

type SourceHealthResponse = {
  summary: {
    total: number;
    acquisitionChannelKnown: number;
    acquisitionChannelUnknown: number;
    legacyCrm: number;
    brandSourceOnly: number;
    manual: number;
    normalizedGroups: number;
    rawVariants: number;
  };
  groups: SourceGroup[];
  recommendations: string[];
};

const TYPE_LABELS: Record<string, string> = {
  legacy_crm: "Historisk CRM",
  brand_source: "Brand/provenance",
  manual: "Manuell",
  web_form: "Webskjema",
  campaign: "Kampanje",
  social: "Sosiale medier",
  property_portal: "Boligportal",
  referral: "Anbefaling",
  partner: "Partner",
  email: "E-post",
  direct: "Direkte",
  event: "Event",
  unknown: "Ukjent",
  other: "Annet",
};

export default function SourceHealthPage() {
  const [data, setData] = useState<SourceHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/nexus/source-health", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente source health.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente source health.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-700"><DatabaseZap className="h-4 w-4" /> CRM Source Health</div>
          <h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Skill historisk kilde fra faktisk acquisition</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Råkilden beholdes urørt. Denne visningen normaliserer bare betydningen slik at gamle CRM-importer, brand-provenance og manuelle registreringer ikke feilaktig rapporteres som markedsføringskanaler.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Oppdater
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Read-only</div>
        <p className="mt-1">Ingen `source`-verdier, CRM-rader eller attribution-data skrives om fra denne siden.</p>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}</div> : null}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Kontakter", data?.summary.total ?? 0],
          ["Kanal kjent", data?.summary.acquisitionChannelKnown ?? 0],
          ["Kanal ukjent", data?.summary.acquisitionChannelUnknown ?? 0],
          ["Legacy CRM", data?.summary.legacyCrm ?? 0],
          ["Brand-only", data?.summary.brandSourceOnly ?? 0],
          ["Manuell", data?.summary.manual ?? 0],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-2xl font-black text-slate-950">{value}</div><div className="mt-1 text-xs font-bold text-slate-500">{label}</div></div>)}
      </div>
    </section>

    {data?.recommendations?.length ? <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6"><h3 className="text-sm font-black text-amber-950">Datakvalitet / anbefalinger</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">{data.recommendations.map((item) => <li key={item}>• {item}</li>)}</ul></section> : null}

    <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h3 className="font-black text-slate-950">Normaliserte kildegrupper</h3></div>
      {loading && !data ? <div className="flex items-center justify-center gap-2 p-10 text-sm font-bold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Leser CRM…</div> : null}
      <div className="divide-y divide-slate-100">
        {(data?.groups || []).map((row) => <div key={`${row.sourceType}:${row.sourceDetail}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_1fr_100px_1.4fr] md:items-center">
          <div><div className="font-black text-slate-950">{row.sourceDetail}</div><div className="mt-1 text-xs font-bold text-slate-500">{TYPE_LABELS[row.sourceType] || row.sourceType} · {row.confidence}</div></div>
          <div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.acquisitionChannelKnown ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{row.acquisitionChannelKnown ? "Acquisition kjent" : "Acquisition ukjent"}</span></div>
          <div className="text-lg font-black text-slate-950">{row.contacts}</div>
          <div className="text-xs leading-5 text-slate-600">Råverdier: {row.rawVariants.length ? row.rawVariants.join(", ") : "—"}</div>
        </div>)}
      </div>
    </section>
  </main>;
}
