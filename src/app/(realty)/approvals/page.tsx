"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileCheck2, FileText, ListChecks, Loader2, Mail, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type ApprovalType = "buyer_profile" | "shortlist" | "presentation" | "message_draft";
type Filter = "all" | "ready" | "blocked" | ApprovalType;

interface ApprovalItem {
  id: string;
  type: ApprovalType;
  brandId: string;
  title: string;
  summary: string | null;
  createdAt: string;
  ageDays: number;
  ready: boolean;
  blocker: string | null;
  customerName: string;
  reviewHref: string;
  customerHref: string | null;
}

interface Payload {
  generatedAt: string;
  summary: { pending: number; ready: number; blocked: number; profiles: number; shortlists: number; presentations: number; messageDrafts: number };
  items: ApprovalItem[];
  warnings: string[];
}

const TYPE_LABELS: Record<ApprovalType, string> = {
  buyer_profile: "Kjøperprofil",
  shortlist: "Shortlist",
  presentation: "Presentasjon",
  message_draft: "E-postutkast",
};

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

const TYPE_ICONS = {
  buyer_profile: UserRoundCheck,
  shortlist: ListChecks,
  presentation: FileText,
  message_draft: Mail,
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nb-NO");
}

export default function ApprovalCenterPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/approvals", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente godkjenningskøen.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente godkjenningskøen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => (data?.items || []).filter((item) => {
    if (filter === "ready") return item.ready;
    if (filter === "blocked") return !item.ready;
    if (["buyer_profile", "shortlist", "presentation", "message_draft"].includes(filter)) return item.type === filter;
    return true;
  }), [data?.items, filter]);

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Alle" },
    { id: "ready", label: "Klar for vurdering" },
    { id: "blocked", label: "Blokkert" },
    { id: "buyer_profile", label: "Kjøperprofiler" },
    { id: "shortlist", label: "Shortlists" },
    { id: "presentation", label: "Presentasjoner" },
    { id: "message_draft", label: "E-postutkast" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><ShieldCheck size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">Approval Center</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Én kø for kjøperprofiler, shortlists, presentasjoner og e-postutkast som krever din manuelle vurdering.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/today">I dag</Link></Button>
          <Button asChild variant="outline"><Link href="/lead-intelligence">Lead Intelligence</Link></Button>
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-slate-300">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-300" />
        <div><strong className="text-white">Sikker arbeidsflyt:</strong> Approval Center godkjenner eller sender ingenting automatisk. Knappen åpner den eksisterende Lead Intelligence-gjennomgangen der kriterier og innhold kontrolleres før lagring.</div>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
      {data?.warnings?.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><strong>Datavarsler:</strong> {data.warnings.join(" · ")}</div> : null}

      {data && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          ["Venter", data.summary.pending, FileCheck2],
          ["Klar", data.summary.ready, CheckCircle2],
          ["Blokkert", data.summary.blocked, AlertTriangle],
          ["Profiler", data.summary.profiles, UserRoundCheck],
          ["Shortlists", data.summary.shortlists, ListChecks],
          ["Presentasjoner", data.summary.presentations, FileText],
          ["E-postutkast", data.summary.messageDrafts, Mail],
        ].map(([label, value, Icon]) => <article key={String(label)} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={19} className="text-emerald-300" /><p className="mt-3 text-[11px] uppercase tracking-wide text-slate-500">{String(label)}</p><strong className="mt-1 block text-2xl text-white">{String(value)}</strong></article>)}
      </section>}

      <div className="flex flex-wrap gap-2">{filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === item.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}</div>

      {loading && !data ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Bygger godkjenningskø …</div> : visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen elementer i dette filteret.</div> : <section className="space-y-3">
        {visible.map((item) => {
          const Icon = TYPE_ICONS[item.type];
          return <article key={`${item.type}-${item.id}`} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${item.ready ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200" : "border-amber-500/35 bg-amber-500/10 text-amber-200"}`}>{item.ready ? "KLAR FOR VURDERING" : "BLOKKERT"}</span>
                  <span className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300"><Icon size={13} />{TYPE_LABELS[item.type]}</span>
                  <span className="text-xs text-slate-500">{BRAND_LABELS[item.brandId] || item.brandId}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold text-white">{item.title}</h2>
                <p className="mt-1 text-sm text-slate-300">{item.customerName}</p>
                {item.summary && <p className="mt-2 max-w-3xl text-sm text-slate-400">{item.summary}</p>}
                {item.blocker && <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100"><AlertTriangle size={16} />{item.blocker}</div>}
              </div>
              <div className="w-full shrink-0 lg:w-64">
                <div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={14} />Opprettet {dateLabel(item.createdAt)} · {item.ageDays} dager</div>
                <div className="mt-4 flex flex-wrap gap-2 lg:flex-col">
                  <Button asChild size="sm" disabled={!item.ready}><Link href={item.reviewHref}>Åpne kontrollert gjennomgang <ArrowRight size={14} className="ml-1" /></Link></Button>
                  {item.customerHref && <Button asChild size="sm" variant="outline"><Link href={item.customerHref}>Åpne Customer 360</Link></Button>}
                </div>
              </div>
            </div>
          </article>;
        })}
      </section>}
    </div>
  );
}
