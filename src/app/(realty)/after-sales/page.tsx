"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Gift,
  HeartHandshake,
  Home,
  Loader2,
  MessageSquareQuote,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ActionId = "welcome_checkin" | "care_offer" | "review_request" | "referral_request" | "annual_review" | "welcome_gift";
type Priority = "HIGH" | "MEDIUM" | "LOW";
type Phase = "ONBOARDING" | "RELATIONSHIP" | "LONG_TERM";
type Filter = "all" | "due" | "referral" | "review" | "care" | "long-term";

interface Opportunity {
  id: ActionId;
  label: string;
  description: string;
  targetBrandId: string;
  dueAfterDays: number;
  due: boolean;
  completed: boolean;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  brandId: string;
  value: number;
  propertyInterest: string | null;
  phase: Phase;
  priority: Priority;
  score: number;
  wonAt: string;
  daysSinceWon: number;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
  isOverdue: boolean;
  recommendedAction: string;
  opportunities: Opportunity[];
  dueActions: ActionId[];
  completedActions: ActionId[];
  href: string;
}

interface Payload {
  generatedAt: string;
  summary: {
    wonCustomers: number;
    dueNow: number;
    referralReady: number;
    reviewReady: number;
    careReady: number;
    relationshipValue: number;
  };
  customers: Customer[];
}

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  donaanna: "Dona Anna",
};

const PHASE_LABELS: Record<Phase, string> = {
  ONBOARDING: "Etter overtakelse",
  RELATIONSHIP: "Kunderelasjon",
  LONG_TERM: "Langtidskunde",
};

const ACTION_ICONS: Record<ActionId, LucideIcon> = {
  welcome_checkin: HeartHandshake,
  care_offer: Home,
  review_request: MessageSquareQuote,
  referral_request: Share2,
  annual_review: CalendarClock,
  welcome_gift: Gift,
};

const NEXT_FOLLOWUP_DAYS: Record<ActionId, number> = {
  welcome_checkin: 14,
  welcome_gift: 30,
  care_offer: 30,
  review_request: 45,
  referral_request: 90,
  annual_review: 365,
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
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

export default function AfterSalesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/revenue/after-sales", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente ettermarkedsdata.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente ettermarkedsdata.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => (data?.customers || []).filter((item) => {
    if (filter === "due") return item.dueActions.length > 0 || item.isOverdue;
    if (filter === "referral") return item.dueActions.includes("referral_request");
    if (filter === "review") return item.dueActions.includes("review_request");
    if (filter === "care") return item.dueActions.includes("care_offer");
    if (filter === "long-term") return item.phase === "LONG_TERM";
    return true;
  }), [data?.customers, filter]);

  async function runAction(customerId: string, action?: ActionId, nextFollowupDays?: number) {
    const key = `${customerId}-${action || "schedule"}-${nextFollowupDays || 0}`;
    setActionKey(key);
    setFeedback("");
    try {
      const response = await fetch("/api/revenue/after-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: customerId, action, nextFollowupDays }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Oppdateringen feilet.");
      setFeedback(action ? "Intern aktivitet er registrert. Ingen melding ble sendt til kunden." : "Neste oppfølging er planlagt.");
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Oppdateringen feilet.");
    } finally {
      setActionKey(null);
    }
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Alle kunder" },
    { id: "due", label: "Krever oppfølging" },
    { id: "referral", label: "Klar for anbefaling" },
    { id: "review", label: "Klar for omtale" },
    { id: "care", label: "Boligservice" },
    { id: "long-term", label: "Langtidskunder" },
  ];

  const summaryCards: Array<{ label: string; value: string | number; icon: LucideIcon }> = data ? [
    { label: "Vunne kunder", value: data.summary.wonCustomers, icon: Users },
    { label: "Krever oppfølging", value: data.summary.dueNow, icon: CalendarClock },
    { label: "Anbefaling", value: data.summary.referralReady, icon: Share2 },
    { label: "Omtale", value: data.summary.reviewReady, icon: MessageSquareQuote },
    { label: "Boligservice", value: data.summary.careReady, icon: Home },
    { label: "Kundeverdi", value: money(data.summary.relationshipValue), icon: CircleDollarSign },
  ] : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><HeartHandshake size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">After-sales & Referral</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Behold kundene, skap anbefalinger og finn relevante tjenester etter at boligen er solgt.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/customers">Kunder</Link></Button>
          <Button asChild variant="outline"><Link href="/today">I dag</Link></Button>
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-slate-300">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-300" />
        <div><strong className="text-white">Manuell kundekontakt:</strong> Handlingene registrerer kun internt arbeid og planlegger oppfølging. Ingen e-post, WhatsApp eller SMS sendes fra denne siden.</div>
      </div>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
      {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}

      {data && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return <article key={card.label} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-emerald-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{card.label}</p><strong className="mt-1 block text-2xl text-white">{card.value}</strong></article>;
        })}
      </section>}

      <div className="flex flex-wrap gap-2">{filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === item.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}</div>

      {loading && !data ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Analyserer eksisterende kunder …</div> : visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen kunder i dette filteret.</div> : <section className="space-y-4">
        {visible.map((customer) => <article key={customer.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(customer.priority)}`}>{customer.priority} PRIORITET</span>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{PHASE_LABELS[customer.phase]}</span>
                <span className="text-xs text-slate-500">{BRAND_LABELS[customer.brandId] || customer.brandId}</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-white">{customer.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{customer.propertyInterest || "Boliginteresse ikke satt"} · {money(customer.value)}</p>
              <p className="mt-1 text-xs text-slate-500">Kunde i {customer.daysSinceWon} dager · siste kontakt {dateLabel(customer.lastContactAt)} · neste {dateLabel(customer.nextFollowupAt)}</p>
              <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="text-xs uppercase tracking-wide text-emerald-300">Anbefalt neste steg</p><p className="mt-1 text-sm text-slate-200">{customer.recommendedAction}</p></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => runAction(customer.id, undefined, 7)} disabled={actionKey !== null}>Oppfølging +7 dager</Button>
                <Button size="sm" variant="outline" onClick={() => runAction(customer.id, undefined, 30)} disabled={actionKey !== null}>+30 dager</Button>
                <Button asChild size="sm" variant="ghost"><Link href={customer.href}>Customer 360 <ArrowRight size={14} className="ml-1" /></Link></Button>
              </div>
            </div>

            <div className="w-full xl:w-[34rem]">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500"><Sparkles size={14} /> Muligheter og relasjonsoppgaver</div>
              <div className="space-y-2">
                {customer.opportunities.map((opportunity) => {
                  const Icon = ACTION_ICONS[opportunity.id];
                  const actionKeyValue = `${customer.id}-${opportunity.id}-${NEXT_FOLLOWUP_DAYS[opportunity.id]}`;
                  return <div key={opportunity.id} className={`rounded-lg border p-3 ${opportunity.completed ? "border-emerald-500/25 bg-emerald-500/5" : opportunity.due ? "border-amber-500/25 bg-amber-500/5" : "border-slate-700 bg-slate-950/30"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <Icon size={17} className={opportunity.completed ? "mt-0.5 text-emerald-300" : opportunity.due ? "mt-0.5 text-amber-300" : "mt-0.5 text-slate-500"} />
                        <div><p className="text-sm font-medium text-slate-200">{opportunity.label}</p><p className="mt-1 text-xs text-slate-500">{opportunity.description}</p><p className="mt-1 text-[11px] text-slate-600">Tilhører {BRAND_LABELS[opportunity.targetBrandId] || opportunity.targetBrandId}</p></div>
                      </div>
                      <div className="shrink-0">
                        {opportunity.completed ? <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 size={14} />Registrert</span> : opportunity.due ? <Button size="sm" onClick={() => runAction(customer.id, opportunity.id, NEXT_FOLLOWUP_DAYS[opportunity.id])} disabled={actionKey !== null}>{actionKey === actionKeyValue ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}Merk utført</Button> : <span className="text-xs text-slate-600">Aktuell etter {opportunity.dueAfterDays} dager</span>}
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </article>)}
      </section>}
    </div>
  );
}
