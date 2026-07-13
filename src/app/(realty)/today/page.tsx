"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Flame,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface RevenuePriority {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  brandId: string;
  source: string | null;
  stage: string;
  value: number;
  propertyInterest: string | null;
  kind: "new" | "overdue" | "hot" | "closing" | "followup";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
  reason: string;
  recommendedAction: string;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
  createdAt: string | null;
  isOverdue: boolean;
  isMissingNextAction: boolean;
  href: string;
}

interface RevenueWorkItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  brandId: string | null;
  sourceType: string;
  sourceId: string | null;
  nextAction: string | null;
  aiScore: number;
  href: string;
}

interface RevenueRecommendedPlay {
  source: "customer_priority" | "work_item";
  title: string;
  primaryAction: string;
  reason: string;
  href: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
}

interface RevenueInboxData {
  generatedAt: string;
  summary: {
    activeLeads: number;
    newLeads: number;
    overdueFollowups: number;
    hotSignals: number;
    closingOpportunities: number;
    missingNextAction: number;
    totalPipelineValue: number;
    openWorkItems: number;
  };
  priorities: RevenuePriority[];
  workItems: RevenueWorkItem[];
  recommendedPlay: RevenueRecommendedPlay | null;
  warnings: string[];
}

type Filter = "all" | "new" | "overdue" | "hot" | "closing" | "missing";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Alle prioriteringer" },
  { id: "new", label: "Nye leads" },
  { id: "overdue", label: "Forsinket" },
  { id: "hot", label: "Varme signaler" },
  { id: "closing", label: "Visning / closing" },
  { id: "missing", label: "Mangler neste steg" },
];

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

const STAGE_LABELS: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  ON_HOLD: "På vent",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function priorityClasses(priority: RevenuePriority["priority"] | string) {
  if (priority === "CRITICAL") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (priority === "HIGH") return "border-orange-500/35 bg-orange-500/10 text-orange-200";
  if (priority === "MEDIUM") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

function filterPriority(item: RevenuePriority, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "new") return item.kind === "new";
  if (filter === "overdue") return item.isOverdue;
  if (filter === "hot") return item.score >= 75;
  if (filter === "closing") return item.kind === "closing";
  if (filter === "missing") return item.isMissingNextAction;
  return true;
}

export default function RevenueTodayPage() {
  const [data, setData] = useState<RevenueInboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  async function loadInbox() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/revenue/today", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Revenue Inbox.");
      setData(body as RevenueInboxData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Revenue Inbox.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  const visiblePriorities = useMemo(
    () => (data?.priorities || []).filter((item) => filterPriority(item, filter)),
    [data?.priorities, filter],
  );

  async function scheduleFollowup(contactId: string, days: number) {
    setActionId(contactId);
    setFeedback("");
    const date = new Date(Date.now() + days * 86_400_000);
    date.setHours(9, 0, 0, 0);

    try {
      const response = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId, next_followup: date.toISOString() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke planlegge oppfølging.");
      setFeedback(`Oppfølging planlagt ${formatDate(date.toISOString())}.`);
      await loadInbox();
    } catch (actionError) {
      setFeedback(actionError instanceof Error ? actionError.message : "Kunne ikke planlegge oppfølging.");
    } finally {
      setActionId(null);
    }
  }

  async function completeWorkItem(itemId: string) {
    setActionId(itemId);
    setFeedback("");
    try {
      const response = await fetch("/api/work-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, status: "DONE" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke fullføre oppgaven.");
      setFeedback("Oppgaven er markert som ferdig.");
      await loadInbox();
    } catch (actionError) {
      setFeedback(actionError instanceof Error ? actionError.message : "Kunne ikke fullføre oppgaven.");
    } finally {
      setActionId(null);
    }
  }

  const summaryCards = data
    ? [
        { label: "Aktive leads", value: data.summary.activeLeads, icon: Users, tone: "text-blue-300" },
        { label: "Nye leads", value: data.summary.newLeads, icon: UserPlus, tone: "text-cyan-300" },
        { label: "Forsinket", value: data.summary.overdueFollowups, icon: Clock3, tone: "text-red-300" },
        { label: "Varme signaler", value: data.summary.hotSignals, icon: Flame, tone: "text-orange-300" },
        { label: "Mot closing", value: data.summary.closingOpportunities, icon: Target, tone: "text-emerald-300" },
        { label: "Pipeline-verdi", value: formatCurrency(data.summary.totalPipelineValue), icon: CircleDollarSign, tone: "text-amber-300" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
            <Sparkles size={17} /> Freddy Revenue OS
          </div>
          <h1 className="text-3xl font-bold text-white">I dag</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Kundene som trenger handling nå, rangert etter kjøpssignal, forsinkelse, pipeline-stadium og potensiell verdi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/pipeline"><Users size={16} className="mr-2" />Åpne CRM</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/lead-intelligence"><Sparkles size={16} className="mr-2" />Lead Intelligence</Link>
          </Button>
          <Button onClick={loadInbox} disabled={loading}>
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
            Oppdater
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {data?.warnings?.map((warning) => (
        <div key={warning} className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />{warning}
        </div>
      ))}

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <CheckCircle2 size={17} />{feedback}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
              <Icon size={20} className={card.tone} />
              <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
              <strong className="mt-1 block text-2xl text-white">{card.value}</strong>
            </article>
          );
        })}
      </section>

      {data?.recommendedPlay && (
        <section className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-slate-900/80 to-slate-950 p-5 shadow-lg shadow-emerald-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                  <Sparkles size={13} className="mr-1" /> AI anbefaler nå
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClasses(data.recommendedPlay.priority)}`}>
                  {data.recommendedPlay.priority}
                </span>
                {data.recommendedPlay.score > 0 && (
                  <span className="text-xs font-semibold text-emerald-300">Score {data.recommendedPlay.score}/100</span>
                )}
              </div>
              <h2 className="text-xl font-semibold text-white">{data.recommendedPlay.title}</h2>
              <p className="mt-2 text-sm text-slate-100">{data.recommendedPlay.primaryAction}</p>
              <p className="mt-2 text-xs text-slate-400">Hvorfor: {data.recommendedPlay.reason}</p>
            </div>
            <Button asChild>
              <Link href={data.recommendedPlay.href}>
                Gå til anbefalt arbeid
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Kundeprioriteringer</h2>
            <p className="text-sm text-slate-400">Hver aktiv kunde bør ha én tydelig neste handling og en dato.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  filter === item.id
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                    : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400">
            <Loader2 className="mr-2 animate-spin" size={20} />Analyserer pipeline …
          </div>
        ) : visiblePriorities.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">
            Ingen kunder i dette filteret.
          </div>
        ) : (
          <div className="space-y-3">
            {visiblePriorities.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClasses(item.priority)}`}>
                        {item.priority}
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                        {STAGE_LABELS[item.stage] || item.stage}
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                        {BRAND_LABELS[item.brandId] || item.brandId}
                      </span>
                      <span className="text-xs font-semibold text-emerald-300">Score {item.score}/100</span>
                    </div>
                    <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <h3 className="truncate text-lg font-semibold text-white">{item.contactName}</h3>
                      {item.value > 0 && <span className="text-sm font-semibold text-amber-300">{formatCurrency(item.value)}</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{item.propertyInterest || "Boliginteresse er ikke registrert"}</p>
                    <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Anbefalt neste handling</p>
                      <p className="mt-1 text-sm text-slate-100">{item.recommendedAction}</p>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Hvorfor: {item.reason}</p>
                  </div>

                  <div className="w-full space-y-3 xl:w-72">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                        <span className="text-slate-500">Sist kontakt</span>
                        <strong className="mt-1 block text-slate-200">{formatDate(item.lastContactAt)}</strong>
                      </div>
                      <div className={`rounded-lg border p-3 ${item.isOverdue ? "border-red-500/30 bg-red-500/10" : "border-slate-700 bg-slate-950/40"}`}>
                        <span className={item.isOverdue ? "text-red-300" : "text-slate-500"}>Neste oppfølging</span>
                        <strong className={`mt-1 block ${item.isOverdue ? "text-red-100" : "text-slate-200"}`}>{formatDate(item.nextFollowupAt)}</strong>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" asChild>
                        <Link href={item.href}>Åpne kunde<ArrowRight size={14} className="ml-2" /></Link>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => scheduleFollowup(item.id, 1)} disabled={actionId === item.id}>
                        {actionId === item.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CalendarClock size={14} className="mr-1" />}
                        I morgen
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => scheduleFollowup(item.id, 3)} disabled={actionId === item.id}>
                        +3 dager
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Salgsoppgaver</h2>
          <p className="text-sm text-slate-400">Åpne CRM-, portal-, lead- og eiendomsoppgaver for eiendomsbrandene.</p>
        </div>
        {!data?.workItems?.length ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
            Ingen åpne salgsoppgaver.
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.workItems.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityClasses(item.priority)}`}>{item.priority}</span>
                      {item.brandId && <span className="text-[11px] text-slate-500">{BRAND_LABELS[item.brandId] || item.brandId}</span>}
                    </div>
                    <h3 className="mt-2 font-semibold text-white">{item.title}</h3>
                    {item.description && <p className="mt-1 text-sm text-slate-400">{item.description}</p>}
                    {item.nextAction && <p className="mt-3 text-sm text-emerald-200">Neste: {item.nextAction}</p>}
                  </div>
                  <Building2 size={19} className="shrink-0 text-slate-600" />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                  <span className="text-xs text-slate-500">Forfall: {formatDate(item.dueAt)}</span>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline"><Link href={item.href}>Åpne</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => completeWorkItem(item.id)} disabled={actionId === item.id}>
                      {actionId === item.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />}
                      Ferdig
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
