"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calculator,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  Target,
  Users,
} from "lucide-react";

type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  pipelineStatus: string;
  pipelineValue: number;
  source: string | null;
  propertyInterest: string | null;
  nextFollowup: string | null;
  updatedAt: string | null;
  overdue: boolean;
  organization: string | null;
  organizationType: string | null;
  users: number | null;
  role: string | null;
  model: string | null;
  budgetLabel: string | null;
  timeline: string | null;
  needs: string | null;
  score: number;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  stageLabel: string;
  nextAction: string;
};

type Payload = {
  leads: Lead[];
  summary: { total: number; active: number; highPriority: number; overdue: number; pipelineValue: number; won: number };
  playbook: {
    landingPage: string;
    primaryMarkets: string[];
    decisionRoles: string[];
    searchThemes: string[];
    linkedinAngles: string[];
    policyGuardrails: string[];
    qualificationQuestions: string[];
  };
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value || 0);
}

function dateLabel(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Ikke satt" : new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function priorityClass(priority: Lead["priority"]) {
  if (priority === "CRITICAL") return "border-rose-200 bg-rose-50 text-rose-800";
  if (priority === "HIGH") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function CorporateHomesDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes", { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Corporate Homes");
      setData(body as Payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.leads || [];
    return (data?.leads || []).filter((lead) =>
      [lead.name, lead.email, lead.organization, lead.organizationType, lead.role, lead.model, lead.stageLabel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data?.leads, search]);

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 p-4 text-slate-950 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-teal-700">
              <Building2 size={17} /> Zen Corporate Homes
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Bedrifter & organisasjoner</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Egen B2B-flyt for bedriftshytter, medlemsboliger og delte bedriftsløsninger i Spania. Prioriterer beslutningstaker, brukergruppe, budsjett og tidslinje.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://www.zenecohomes.com/bedriftshytte-spania" target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-800">
              Landingsside <ExternalLink size={15} className="ml-2" />
            </a>
            <Link href="/ad-campaigns/new?preset=corporate-homes" className="inline-flex items-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white">
              Lag annonsekampanje <Megaphone size={15} className="ml-2" />
            </Link>
            <button onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
              {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />} Oppdater
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><AlertTriangle size={16} className="mr-2 inline" />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric icon={<Users size={17} />} label="Totalt B2B" value={data?.summary.total ?? 0} />
        <Metric icon={<Target size={17} />} label="Aktive" value={data?.summary.active ?? 0} />
        <Metric icon={<AlertTriangle size={17} />} label="Høy prioritet" value={data?.summary.highPriority ?? 0} />
        <Metric icon={<Clock3 size={17} />} label="Forfalt oppfølging" value={data?.summary.overdue ?? 0} />
        <Metric icon={<CircleDollarSign size={17} />} label="Aktiv pipeline" value={money(data?.summary.pipelineValue ?? 0)} />
        <Metric icon={<Building2 size={17} />} label="Vunnet" value={data?.summary.won ?? 0} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Corporate pipeline</h2>
              <p className="mt-1 text-sm text-slate-500">Score er B2B-fit og kjøpsmodenhet, ikke sannsynlighet for salg.</p>
            </div>
            <div className="relative w-full sm:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søk bedrift, rolle, modell eller kontakt" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500" />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading && !data ? <div className="p-10 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" />Henter Corporate-leads …</div> : null}
            {!loading && visible.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Ingen Corporate-leads ennå. Nye skjema fra Zen Corporate Homes dukker automatisk opp her.</div> : null}
            {visible.map((lead) => (
              <article key={lead.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={"rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider " + priorityClass(lead.priority)}>{lead.priority} · {lead.score}/100</span>
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-800">{lead.stageLabel}</span>
                      {lead.overdue ? <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase text-rose-800">Forfalt</span> : null}
                    </div>
                    <h3 className="mt-3 text-lg font-black text-slate-950">{lead.organization || lead.name}</h3>
                    {lead.organization && <p className="mt-0.5 text-sm font-semibold text-slate-600">{lead.name}{lead.role ? " · " + lead.role : ""}</p>}
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                      <span><b>Brukere:</b> {lead.users ?? "–"}</span>
                      <span><b>Budsjett:</b> {lead.budgetLabel || (lead.pipelineValue ? money(lead.pipelineValue) : "–")}</span>
                      <span><b>Modell:</b> {lead.model || "–"}</span>
                      <span><b>Oppfølging:</b> {dateLabel(lead.nextFollowup)}</span>
                    </div>
                    <div className="mt-4 rounded-xl bg-slate-50 p-3">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Neste beste steg</div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{lead.nextAction}</p>
                    </div>
                  </div>
                  <Link href={"/customers?contactId=" + encodeURIComponent(lead.id)} className="inline-flex shrink-0 items-center rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-black text-white">
                    Customer 360 <ArrowRight size={14} className="ml-2" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-teal-700"><Megaphone size={16} /> Acquisition</div>
            <h2 className="mt-2 text-lg font-black">Start smalt i Norge</h2>
            <div className="mt-4 space-y-4 text-sm">
              <PlaybookList title="Beslutningstakere" items={data?.playbook.decisionRoles || []} />
              <PlaybookList title="Google Search" items={data?.playbook.searchThemes || []} />
              <PlaybookList title="LinkedIn-vinkler" items={data?.playbook.linkedinAngles || []} />
              <PlaybookList title="Policy guardrails" items={data?.playbook.policyGuardrails || []} />
            </div>
          </section>

          <section className="rounded-3xl border border-teal-200 bg-teal-50 p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-teal-800"><Calculator size={16} /> Discovery</div>
            <h2 className="mt-2 text-lg font-black text-teal-950">Kvalifiser før boligmatching</h2>
            <ol className="mt-4 space-y-3 text-sm leading-5 text-teal-950">
              {(data?.playbook.qualificationQuestions || []).map((item, index) => <li key={item} className="flex gap-3"><b>{index + 1}.</b><span>{item}</span></li>)}
            </ol>
          </section>
        </aside>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">{icon}{label}</div><div className="mt-2 text-2xl font-black text-slate-950">{value}</div></div>;
}

function PlaybookList({ title, items }: { title: string; items: string[] }) {
  return <div><div className="font-black text-slate-900">{title}</div><div className="mt-2 flex flex-wrap gap-2">{items.map((item) => <span key={item} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">{item}</span>)}</div></div>;
}
