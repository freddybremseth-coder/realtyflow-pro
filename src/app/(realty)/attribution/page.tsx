"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Loader2,
  Megaphone,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Scope = "all" | "zeneco" | "soleada" | "pinosoecolife" | "keyholding";
type Priority = "CRITICAL" | "HIGH" | "MEDIUM";
type SourceRow = {
  sourceId: string; label: string; spendEur: number; leads: number; active: number; qualified: number; viewings: number; negotiations: number; won: number; lost: number; unknownCommissionWins: number; pipelineValue: number; weightedPipelineValue: number; confirmedCommission: number; collectedCommission: number; leadToQualifiedRate: number | null; leadToWinRate: number | null; costPerLead: number | null; customerAcquisitionCost: number | null; earnedRoas: number | null; cashRoas: number | null; earnedMarketingRoiPercent: number | null; rawSources: string[];
};
type Workspace = {
  generatedAt: string; cohortNote: string; warnings: string[];
  summary: { leads: number; qualified: number; won: number; totalSpendEur: number; confirmedCommission: number; collectedCommission: number; weightedPipelineValue: number; costPerLead: number | null; customerAcquisitionCost: number | null; earnedRoas: number | null; cashRoas: number | null; knownSourceSharePercent: number; highConfidenceSharePercent: number; campaignCoveragePercent: number; confirmedCommissionCoveragePercent: number; bestSourceId: string | null };
  sources: SourceRow[];
  campaigns: Array<{ campaign: string; sourceId: string; leads: number; qualified: number; won: number; confirmedCommission: number }>;
  recommendations: Array<{ id: string; priority: Priority; title: string; description: string; href: string }>;
};
type ResponseData = { workspace: Workspace; config: { spend: Array<{ sourceId: string; spendEur: number }>; notes: string; updatedAt: string | null }; sourceOptions: Array<{ id: string; label: string }> };

const scopes: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "Alle revenue-brands" }, { id: "zeneco", label: "Zen Eco Homes" }, { id: "soleada", label: "Soleada.no" }, { id: "pinosoecolife", label: "Pinoso EcoLife" }, { id: "keyholding", label: "Keyholding" },
];

function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function money(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard" }).format(value || 0); }
function percent(value: number | null) { return value === null ? "—" : `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} %`; }
function ratio(value: number | null) { return value === null ? "—" : `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value)}×`; }
function priorityClass(value: Priority) { return value === "CRITICAL" ? "border-red-500/35 bg-red-500/10 text-red-200" : value === "HIGH" ? "border-amber-500/35 bg-amber-500/10 text-amber-200" : "border-sky-500/30 bg-sky-500/10 text-sky-200"; }
function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) { return <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-emerald-300" /><p className="mt-3 text-[11px] uppercase tracking-wide text-slate-500">{label}</p><strong className="mt-1 block text-2xl text-white">{value}</strong></article>; }

export default function AttributionPage() {
  const [scope, setScope] = useState<Scope>("all");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<ResponseData | null>(null);
  const [spend, setSpend] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    setLoading(true); setError(""); setSaved("");
    try {
      const response = await fetch(`/api/revenue/attribution?scope=${encodeURIComponent(scope)}&month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente attribusjon.");
      setData(body);
      setSpend(Object.fromEntries((body.config?.spend || []).map((item: { sourceId: string; spendEur: number }) => [item.sourceId, String(item.spendEur)])));
      setNotes(body.config?.notes || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Kunne ikke hente attribusjon."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [scope, month]);

  async function save() {
    if (!data) return;
    setSaving(true); setError(""); setSaved("");
    try {
      const entries = data.sourceOptions.map((option) => ({ sourceId: option.id, spendEur: Number(spend[option.id] || 0) }));
      const response = await fetch("/api/revenue/attribution", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, month, spend: entries, notes }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lagre kostnader.");
      setSaved("Kanalutgiftene er lagret. Attribusjonen er beregnet på nytt.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Kunne ikke lagre kostnader."); }
    finally { setSaving(false); }
  }

  const bestLabel = useMemo(() => data?.workspace.sources.find((row) => row.sourceId === data.workspace.summary.bestSourceId)?.label || "—", [data]);
  const metrics: Array<{ label: string; value: string | number; icon: LucideIcon }> = data ? [
    { label: "Leads i kohorten", value: data.workspace.summary.leads, icon: Users },
    { label: "Kvalifiserte", value: data.workspace.summary.qualified, icon: Target },
    { label: "Vunne salg", value: data.workspace.summary.won, icon: CheckCircle2 },
    { label: "Registrert kostnad", value: money(data.workspace.summary.totalSpendEur), icon: Megaphone },
    { label: "Bekreftet provisjon", value: money(data.workspace.summary.confirmedCommission), icon: CircleDollarSign },
    { label: "Innbetalt provisjon", value: money(data.workspace.summary.collectedCommission), icon: Banknote },
    { label: "Opptjent ROAS", value: ratio(data.workspace.summary.earnedRoas), icon: BarChart3 },
    { label: "Beste dokumenterte kilde", value: bestLabel, icon: Gauge },
  ] : [];

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Megaphone size={18} /> Freddy Revenue OS</div><h1 className="text-3xl font-bold text-white">Lead Source ROI & Attribution</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Se hvilke kilder som skaper kvalifiserte leads, salg og bekreftet provisjon. CAC og ROAS vises bare når du har registrert faktisk kanalutgift.</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/revenue-command">Command Center</Link></Button><Button asChild variant="outline"><Link href="/goals">Mål & Ukeplan</Link></Button><Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button></div>
    </header>

    <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-slate-300"><ShieldCheck size={20} className="shrink-0 text-emerald-300" /><div><strong className="text-white">Kontrollert attribusjon:</strong> Ingen kostnad, provisjon eller kilde blir estimert. Ukjent kilde og manglende provisjon vises som datamangler.</div></div>
    <section className="grid gap-3 md:grid-cols-2"><label className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300"><span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Månedlig lead-kohort</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label><label className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300"><span className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Scope</span><select value={scope} onChange={(event) => setScope(event.target.value as Scope)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{scopes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></section>

    {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
    {saved && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"><CheckCircle2 size={18} />{saved}</div>}
    {data?.workspace.warnings?.length ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><strong>Datavarsler:</strong> {data.workspace.warnings.join(" · ")}</div> : null}

    {loading && !data ? <div className="flex min-h-52 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Bygger attribusjon …</div> : data ? <>
      <section className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4 text-sm text-slate-400">{data.workspace.cohortNote}</section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map((item) => <Metric key={item.label} {...item} />)}</section>

      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5"><div className="mb-4"><p className="text-xs uppercase tracking-wide text-slate-500">Manuell kostnad</p><h2 className="text-xl font-semibold text-white">Kanalutgifter for valgt måned</h2><p className="mt-1 text-sm text-slate-400">Registrer bare faktisk dokumentert mediekostnad eller kanalutgift. Null og tomme felt lagres ikke.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.sourceOptions.map((option) => <label key={option.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300"><span className="mb-2 block text-xs text-slate-500">{option.label}</span><div className="flex items-center gap-2"><span className="text-slate-500">€</span><input type="number" min="0" step="0.01" value={spend[option.id] || ""} onChange={(event) => setSpend((current) => ({ ...current, [option.id]: event.target.value }))} className="w-full bg-transparent text-white outline-none" placeholder="0" /></div></label>)}</div><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Valgfritt internt notat om kostnader, periode eller kampanjer" className="mt-4 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" /><div className="mt-4 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Lagre kostnader</Button></div></section>

      <section><div className="mb-3"><p className="text-xs uppercase tracking-wide text-slate-500">Kanalkvalitet og økonomi</p><h2 className="text-xl font-semibold text-white">Resultat per leadkilde</h2></div><div className="space-y-3">{data.workspace.sources.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen attribuerte leads eller registrerte kostnader i valgt periode.</div> : data.workspace.sources.map((row) => <article key={row.sourceId} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><h3 className="text-lg font-semibold text-white">{row.label}</h3><p className="mt-1 text-xs text-slate-500">{row.rawSources.length ? `Registrert som: ${row.rawSources.join(", ")}` : "Ingen rå kildeverdi"}</p></div><div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 xl:grid-cols-6"><div><span className="text-slate-500">Leads</span><strong className="block text-white">{row.leads}</strong></div><div><span className="text-slate-500">Kvalifisert</span><strong className="block text-white">{row.qualified}</strong></div><div><span className="text-slate-500">Vunnet</span><strong className="block text-white">{row.won}</strong></div><div><span className="text-slate-500">Kostnad</span><strong className="block text-white">{money(row.spendEur)}</strong></div><div><span className="text-slate-500">Provisjon</span><strong className="block text-white">{money(row.confirmedCommission)}</strong></div><div><span className="text-slate-500">ROAS</span><strong className="block text-white">{ratio(row.earnedRoas)}</strong></div></div></div><div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 text-xs sm:grid-cols-3 lg:grid-cols-6"><div><span className="text-slate-500">Lead → kvalifisert</span><strong className="block text-slate-300">{percent(row.leadToQualifiedRate)}</strong></div><div><span className="text-slate-500">Lead → salg</span><strong className="block text-slate-300">{percent(row.leadToWinRate)}</strong></div><div><span className="text-slate-500">CPL</span><strong className="block text-slate-300">{money(row.costPerLead)}</strong></div><div><span className="text-slate-500">CAC</span><strong className="block text-slate-300">{money(row.customerAcquisitionCost)}</strong></div><div><span className="text-slate-500">Cash ROAS</span><strong className="block text-slate-300">{ratio(row.cashRoas)}</strong></div><div><span className="text-slate-500">Vektet pipeline</span><strong className="block text-slate-300">{money(row.weightedPipelineValue)}</strong></div></div></article>)}</div></section>

      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5"><h2 className="text-lg font-semibold text-white">Datakvalitet</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-400">Kjent kilde</span><strong className="text-white">{percent(data.workspace.summary.knownSourceSharePercent)}</strong></div><div className="flex justify-between"><span className="text-slate-400">Høy kildekonfidens</span><strong className="text-white">{percent(data.workspace.summary.highConfidenceSharePercent)}</strong></div><div className="flex justify-between"><span className="text-slate-400">Kampanjedekning</span><strong className="text-white">{percent(data.workspace.summary.campaignCoveragePercent)}</strong></div><div className="flex justify-between"><span className="text-slate-400">Bekreftet provisjonsdekning</span><strong className="text-white">{percent(data.workspace.summary.confirmedCommissionCoveragePercent)}</strong></div></div></div><div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5"><h2 className="text-lg font-semibold text-white">Prioriterte forbedringer</h2><div className="mt-4 space-y-3">{data.workspace.recommendations.length === 0 ? <p className="text-sm text-slate-400">Ingen kritiske attribusjonsavvik i valgt kohort.</p> : data.workspace.recommendations.map((item) => <Link key={item.id} href={item.href} className="block rounded-lg border border-slate-700 bg-slate-950/50 p-3 hover:border-emerald-500/35"><div className="flex items-center justify-between gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span><ArrowRight size={14} className="text-emerald-300" /></div><strong className="mt-2 block text-sm text-white">{item.title}</strong><p className="mt-1 text-xs text-slate-400">{item.description}</p></Link>)}</div></div></section>

      {data.workspace.campaigns.length > 0 && <section><div className="mb-3"><p className="text-xs uppercase tracking-wide text-slate-500">UTM og kampanjer</p><h2 className="text-xl font-semibold text-white">Dokumentert kampanjeresultat</h2></div><div className="overflow-x-auto rounded-xl border border-slate-700/70"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Kampanje</th><th className="px-4 py-3">Kilde</th><th className="px-4 py-3">Leads</th><th className="px-4 py-3">Kvalifisert</th><th className="px-4 py-3">Vunnet</th><th className="px-4 py-3">Provisjon</th></tr></thead><tbody>{data.workspace.campaigns.map((campaign) => <tr key={`${campaign.sourceId}-${campaign.campaign}`} className="border-t border-slate-800 bg-slate-950/40"><td className="px-4 py-3 font-medium text-white">{campaign.campaign}</td><td className="px-4 py-3 text-slate-400">{campaign.sourceId}</td><td className="px-4 py-3 text-slate-300">{campaign.leads}</td><td className="px-4 py-3 text-slate-300">{campaign.qualified}</td><td className="px-4 py-3 text-slate-300">{campaign.won}</td><td className="px-4 py-3 text-slate-300">{money(campaign.confirmedCommission)}</td></tr>)}</tbody></table></div></section>}
    </> : null}
  </div>;
}
