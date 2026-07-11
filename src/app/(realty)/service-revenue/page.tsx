"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeEuro,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Home,
  KeyRound,
  Loader2,
  PauseCircle,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Plan = "BASIC" | "STANDARD" | "PREMIUM";
type Lifecycle = "PROSPECT" | "OFFER_PLANNED" | "OFFERED" | "ACTIVE" | "RENEWAL_DUE" | "PAUSED" | "CANCELLED";
type Priority = "HIGH" | "MEDIUM" | "LOW";
type Filter = "all" | "prospects" | "offered" | "active" | "renewal" | "paused" | "overdue";
type Source = "all" | "zeneco" | "soleada" | "keyholding";

interface Account {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  sourceBrandId: string;
  propertyInterest: string | null;
  location: string | null;
  propertyValue: number;
  lifecycle: Lifecycle;
  priority: Priority;
  score: number;
  recommendedPlan: Plan;
  currentPlan: Plan | null;
  monthlyRevenue: number;
  annualRevenue: number;
  potentialMonthlyRevenue: number;
  potentialAnnualRevenue: number;
  offeredAt: string | null;
  startedAt: string | null;
  renewalAt: string | null;
  nextFollowupAt: string | null;
  overdue: boolean;
  renewalDue: boolean;
  issues: string[];
  recommendedAction: string;
  href: string;
}

interface Workspace {
  generatedAt: string;
  summary: {
    eligibleCustomers: number;
    prospects: number;
    offersOutstanding: number;
    activeContracts: number;
    renewalDue: number;
    pausedContracts: number;
    cancelledContracts: number;
    monthlyRecurringRevenue: number;
    annualRecurringRevenue: number;
    potentialMonthlyRevenue: number;
    potentialAnnualRevenue: number;
    overdueFollowups: number;
  };
  accounts: Account[];
}

const PLAN_LABELS: Record<Plan, string> = {
  BASIC: "Basic · €55/mnd",
  STANDARD: "Standard · €89/mnd",
  PREMIUM: "Premium · €169/mnd",
};

const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  PROSPECT: "Aktuell kunde",
  OFFER_PLANNED: "Tilbud planlagt",
  OFFERED: "Tilbud presentert",
  ACTIVE: "Aktiv avtale",
  RENEWAL_DUE: "Fornyelse kreves",
  PAUSED: "Satt på pause",
  CANCELLED: "Avsluttet",
};

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  keyholding: "Keyholding Costa Blanca",
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function dateLabel(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nb-NO");
}

function priorityClass(priority: Priority) {
  if (priority === "HIGH") return "border-red-500/35 bg-red-500/10 text-red-200";
  if (priority === "MEDIUM") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function lifecycleClass(lifecycle: Lifecycle) {
  if (lifecycle === "RENEWAL_DUE") return "border-red-500/35 bg-red-500/10 text-red-200";
  if (lifecycle === "ACTIVE") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (lifecycle === "OFFERED" || lifecycle === "OFFER_PLANNED") return "border-cyan-500/35 bg-cyan-500/10 text-cyan-200";
  if (lifecycle === "PAUSED") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (lifecycle === "CANCELLED") return "border-slate-600 bg-slate-800 text-slate-400";
  return "border-violet-500/30 bg-violet-500/10 text-violet-200";
}

export default function ServiceRevenuePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState<Source>("all");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<string, Plan>>({});

  async function load(selectedSource = source) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/revenue/service-revenue?source=${selectedSource}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Keyholding-data.");
      setWorkspace(body.workspace);
      setPlans((current) => {
        const next = { ...current };
        for (const account of body.workspace?.accounts || []) {
          if (!next[account.id]) next[account.id] = account.currentPlan || account.recommendedPlan;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente Keyholding-data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(source); }, [source]);

  const visible = useMemo(() => (workspace?.accounts || []).filter((account) => {
    if (filter === "prospects") return ["PROSPECT", "OFFER_PLANNED"].includes(account.lifecycle);
    if (filter === "offered") return account.lifecycle === "OFFERED";
    if (filter === "active") return ["ACTIVE", "RENEWAL_DUE"].includes(account.lifecycle);
    if (filter === "renewal") return account.lifecycle === "RENEWAL_DUE";
    if (filter === "paused") return account.lifecycle === "PAUSED";
    if (filter === "overdue") return account.overdue;
    return true;
  }), [workspace?.accounts, filter]);

  async function runAction(account: Account, action: string, nextFollowupDays?: number) {
    const plan = plans[account.id] || account.currentPlan || account.recommendedPlan;
    const destructive = ["start_contract", "renew_contract", "pause_contract", "cancel_contract"].includes(action);
    if (destructive && !window.confirm("Bekreft at denne interne Keyholding-statusen skal registreres. Ingen melding eller faktura sendes.")) return;

    const key = `${account.id}-${action}`;
    setActionKey(key);
    setFeedback("");
    try {
      const response = await fetch("/api/revenue/service-revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: account.id, action, plan, nextFollowupDays }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Oppdateringen feilet.");
      setFeedback("Intern Keyholding-status er registrert. Ingen kundemelding eller faktura ble sendt.");
      await load(source);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Oppdateringen feilet.");
    } finally {
      setActionKey(null);
    }
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Alle" },
    { id: "prospects", label: "Aktuelle kunder" },
    { id: "offered", label: "Tilbud presentert" },
    { id: "active", label: "Aktive avtaler" },
    { id: "renewal", label: "Fornyelse" },
    { id: "paused", label: "Pause" },
    { id: "overdue", label: "Forsinket" },
  ];

  const summaryCards: Array<{ label: string; value: string | number; icon: LucideIcon }> = workspace ? [
    { label: "Aktuelle kunder", value: workspace.summary.eligibleCustomers, icon: Users },
    { label: "Aktive avtaler", value: workspace.summary.activeContracts, icon: KeyRound },
    { label: "MRR", value: money(workspace.summary.monthlyRecurringRevenue), icon: Repeat2 },
    { label: "ARR", value: money(workspace.summary.annualRecurringRevenue), icon: CircleDollarSign },
    { label: "Potensiell ARR", value: money(workspace.summary.potentialAnnualRevenue), icon: BadgeEuro },
    { label: "Fornyelse", value: workspace.summary.renewalDue, icon: CalendarClock },
  ] : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-300"><KeyRound size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">Keyholding Service Revenue</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Gjør boligkjøpere om til langsiktige servicekunder og følg tilbud, avtaler, MRR, ARR og fornyelser.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/brands">Brands</Link></Button>
          <Button asChild variant="outline"><Link href="/after-sales">After-sales</Link></Button>
          <Button onClick={() => load(source)} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-slate-300">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-300" />
        <div><strong className="text-white">Kontrollert serviceflyt:</strong> Siden registrerer kun interne statuser. Den sender ikke tilbud, kontrakt, faktura, e-post, WhatsApp eller SMS.</div>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
      {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}

      {workspace && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return <article key={card.label} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{card.label}</p><strong className="mt-1 block text-2xl text-white">{card.value}</strong></article>;
        })}
      </section>}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-700/70 bg-slate-900/50 p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">{filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === item.id ? "border-amber-400/50 bg-amber-500/15 text-amber-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}</div>
        <select value={source} onChange={(event) => setSource(event.target.value as Source)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
          <option value="all">Alle kilder</option>
          <option value="zeneco">Zen Eco Homes</option>
          <option value="soleada">Soleada.no</option>
          <option value="keyholding">Keyholding</option>
        </select>
      </div>

      {loading && !workspace ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Analyserer serviceinntekter …</div> : visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen kunder i dette filteret.</div> : <section className="space-y-4">
        {visible.map((account) => {
          const selectedPlan = plans[account.id] || account.currentPlan || account.recommendedPlan;
          return <article key={account.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(account.priority)}`}>{account.priority} PRIORITET</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] ${lifecycleClass(account.lifecycle)}`}>{LIFECYCLE_LABELS[account.lifecycle]}</span>
                  <span className="text-xs text-slate-500">{BRAND_LABELS[account.sourceBrandId] || account.sourceBrandId}</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-white">{account.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{account.propertyInterest || "Boliginteresse ikke satt"}{account.location ? ` · ${account.location}` : ""}</p>
                <p className="mt-1 text-xs text-slate-500">Boligverdi {money(account.propertyValue)} · neste oppfølging {dateLabel(account.nextFollowupAt)} · fornyelse {dateLabel(account.renewalAt)}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"><p className="text-xs text-slate-500">Aktiv MRR</p><strong className="mt-1 block text-lg text-white">{money(account.monthlyRevenue)}</strong></div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"><p className="text-xs text-slate-500">Aktiv ARR</p><strong className="mt-1 block text-lg text-white">{money(account.annualRevenue)}</strong></div>
                  <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"><p className="text-xs text-slate-500">Potensiell ARR</p><strong className="mt-1 block text-lg text-amber-200">{money(account.potentialAnnualRevenue)}</strong></div>
                </div>

                <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-xs uppercase tracking-wide text-amber-300">Anbefalt neste steg</p><p className="mt-1 text-sm text-slate-200">{account.recommendedAction}</p></div>
                {account.issues.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{account.issues.map((issue) => <span key={issue} className="rounded-full border border-red-500/25 bg-red-500/5 px-2.5 py-1 text-xs text-red-200">{issue}</span>)}</div>}
              </div>

              <div className="w-full space-y-3 xl:w-[31rem]">
                <div className="rounded-xl border border-slate-700 bg-slate-950/45 p-4">
                  <label className="text-xs uppercase tracking-wide text-slate-500">Keyholding-plan</label>
                  <select value={selectedPlan} onChange={(event) => setPlans((current) => ({ ...current, [account.id]: event.target.value as Plan }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                    {Object.entries(PLAN_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">Anbefalt: {PLAN_LABELS[account.recommendedPlan]}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {account.lifecycle === "PROSPECT" && <Button size="sm" onClick={() => runAction(account, "plan_offer", 3)} disabled={actionKey !== null}>Planlegg tilbud</Button>}
                  {["PROSPECT", "OFFER_PLANNED"].includes(account.lifecycle) && <Button size="sm" variant="outline" onClick={() => runAction(account, "mark_offer_made", 7)} disabled={actionKey !== null}>Tilbud presentert</Button>}
                  {["PROSPECT", "OFFER_PLANNED", "OFFERED", "PAUSED", "CANCELLED"].includes(account.lifecycle) && <Button size="sm" variant="outline" onClick={() => runAction(account, "start_contract")} disabled={actionKey !== null}><Home size={14} className="mr-1" />Start avtale</Button>}
                  {account.lifecycle === "RENEWAL_DUE" && <Button size="sm" onClick={() => runAction(account, "renew_contract")} disabled={actionKey !== null}><Repeat2 size={14} className="mr-1" />Forny</Button>}
                  {["ACTIVE", "RENEWAL_DUE"].includes(account.lifecycle) && <Button size="sm" variant="outline" onClick={() => runAction(account, "pause_contract", 30)} disabled={actionKey !== null}><PauseCircle size={14} className="mr-1" />Pause</Button>}
                  {account.lifecycle !== "CANCELLED" && <Button size="sm" variant="ghost" onClick={() => runAction(account, "cancel_contract")} disabled={actionKey !== null}><XCircle size={14} className="mr-1" />Avslutt</Button>}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                  <Button size="sm" variant="outline" onClick={() => runAction(account, "followup", 7)} disabled={actionKey !== null}>Manuell oppfølging +7</Button>
                  <Button size="sm" variant="outline" onClick={() => runAction(account, "schedule", 30)} disabled={actionKey !== null}>Vurder +30 dager</Button>
                  <Button asChild size="sm" variant="ghost"><Link href={account.href}>Customer 360 <ArrowRight size={14} className="ml-1" /></Link></Button>
                </div>
              </div>
            </div>
          </article>;
        })}
      </section>}
    </div>
  );
}
