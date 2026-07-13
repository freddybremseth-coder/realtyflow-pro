"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileText,
  Home,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Customer360Payload {
  generatedAt: string;
  contact: Record<string, any>;
  brandId: string;
  recommendedAction: string;
  nextAction?: {
    title: string;
    description: string;
    reason: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel?: string;
    secondaryHref?: string;
  };
  completeness: {
    score: number;
    completed: number;
    total: number;
    checks: Array<{ id: string; label: string; complete: boolean }>;
    missing: string[];
  };
  activeBuyerProfile: Record<string, any> | null;
  criteria: Array<Record<string, any>>;
  shortlists: Array<Record<string, any> & { items: Array<Record<string, any>> }>;
  presentations: Array<Record<string, any>>;
  messageDrafts: Array<Record<string, any>>;
  portalUser: Record<string, any> | null;
  portalMessages: Array<Record<string, any>>;
  workItems: Array<Record<string, any>>;
  revenueEvents: Array<Record<string, any>>;
  timeline: Array<{
    id: string;
    kind: string;
    title: string;
    detail?: string | null;
    occurredAt: string;
    direction?: string;
  }>;
  warnings: string[];
}

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
  WON: "Kunde",
  LOST: "Tapt",
  ON_HOLD: "På vent",
};

const CRITERION_LABELS: Record<string, string> = {
  bedrooms: "Soverom",
  bathrooms: "Bad",
  property_type: "Boligtype",
  location: "Område",
  total_budget: "Totalbudsjett",
  purchase_price: "Kjøpspris",
  living_area_m2: "Boligareal",
  plot_area_m2: "Tomteareal",
  floor_position: "Etasje",
  has_lift: "Heis",
  terrace_area_m2: "Terrasse",
  view_quality: "Utsikt",
  orientation: "Orientering",
  parking: "Parkering",
  pool: "Basseng",
  new_build_or_resale: "Nybygg / brukt",
  distance_to_beach: "Avstand til strand",
  other: "Annet",
};

function money(value: unknown) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: Number(value || 0) >= 1_000_000 ? "compact" : "standard",
  }).format(Number(value || 0));
}

function dateLabel(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime())
    ? "Ikke satt"
    : new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function criterionValue(value: unknown) {
  if (value === null || value === undefined) return "Ikke satt";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return String(row.value ?? row.label ?? row.text ?? JSON.stringify(value));
  }
  return String(value);
}

function timelineIcon(kind: string) {
  if (kind === "portal") return MessageSquare;
  if (kind === "profile") return UserRound;
  if (kind === "shortlist") return ListChecks;
  if (kind === "presentation" || kind === "draft") return FileText;
  if (kind === "task") return ClipboardCheck;
  if (kind === "revenue") return CircleDollarSign;
  return Clock3;
}

function nextActionPriorityClasses(priority?: string) {
  switch (priority) {
    case "CRITICAL":
      return "border-red-400/40 bg-red-500/15 text-red-100";
    case "HIGH":
      return "border-amber-400/40 bg-amber-500/15 text-amber-100";
    case "MEDIUM":
      return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
    default:
      return "border-slate-700 bg-slate-800 text-slate-300";
  }
}

export default function Customer360Page({ params }: { params: { contactId: string } }) {
  const [data, setData] = useState<Customer360Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(params.contactId)}/360`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Customer 360.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Customer 360.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [params.contactId]);

  async function schedule(days: number) {
    if (!data?.contact?.id) return;
    setActionLoading(true);
    setFeedback("");
    const next = new Date(Date.now() + days * 86_400_000);
    next.setHours(9, 0, 0, 0);
    try {
      const response = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.contact.id, next_followup: next.toISOString() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || body?.error || "Kunne ikke planlegge oppfølging.");
      setFeedback(`Neste oppfølging er satt til ${dateLabel(next.toISOString())}.`);
      await load();
    } catch (actionError) {
      setFeedback(actionError instanceof Error ? actionError.message : "Kunne ikke planlegge oppfølging.");
    } finally {
      setActionLoading(false);
    }
  }

  const groupedCriteria = useMemo(() => {
    const groups: Record<string, Array<Record<string, any>>> = {
      hard_requirement: [],
      preference: [],
      exclusion: [],
      missing_information: [],
    };
    for (const item of data?.criteria || []) (groups[item.criterion_type] ||= []).push(item);
    return groups;
  }, [data?.criteria]);

  if (loading && !data) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Bygger kundebildet …</div>;
  }

  if (error && !data) {
    return <div className="mx-auto max-w-4xl rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200"><AlertTriangle className="mb-3" />{error}</div>;
  }

  if (!data) return null;
  const contact = data.contact;
  const stage = String(contact.pipeline_status || "NEW").toUpperCase();
  const nextAction = data.nextAction || {
    title: "Anbefalt neste handling",
    description: data.recommendedAction,
    reason: "basert på pipeline-status og kundehistorikk",
    priority: "MEDIUM" as const,
    primaryLabel: "Planlegg oppfølging",
    primaryHref: `/customers/${encodeURIComponent(contact.id)}`,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/today" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16} />Tilbake til I dag</Link>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">Customer 360</span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{STAGE_LABELS[stage] || stage}</span>
              <span className="text-xs text-slate-500">{BRAND_LABELS[data.brandId] || data.brandId}</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold text-white">{contact.name || contact.email || "Ukjent kunde"}</h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
              {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-white"><Mail size={15} />{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-white"><Phone size={15} />{contact.phone}</a>}
              <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={15} />{money(contact.pipeline_value)}</span>
              <span className="inline-flex items-center gap-1.5"><Home size={15} />{contact.property_interest || "Boliginteresse ikke satt"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={`/pipeline?contactId=${encodeURIComponent(contact.id)}`}>Åpne i CRM</Link></Button>
            <Button asChild variant="outline"><Link href="/lead-intelligence"><Sparkles size={16} className="mr-2" />Lead Intelligence</Link></Button>
            <Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
          </div>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
      {data.warnings.map((warning) => <div key={warning} className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><AlertTriangle size={17} />{warning}</div>)}
      {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <article className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300"><Target size={18} />Neste handling</div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${nextActionPriorityClasses(nextAction.priority)}`}>{nextAction.priority}</span>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-white">{nextAction.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-100">{nextAction.description}</p>
          <p className="mt-2 text-xs text-slate-500">Hvorfor: {nextAction.reason}</p>
          <p className="mt-2 text-sm text-slate-400">Nåværende oppfølging: {dateLabel(contact.next_followup)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {nextAction.primaryHref !== `/customers/${encodeURIComponent(contact.id)}` && (
              <Button asChild size="sm" variant="outline"><Link href={nextAction.primaryHref}>{nextAction.primaryLabel}</Link></Button>
            )}
            <Button size="sm" onClick={() => schedule(1)} disabled={actionLoading}><CalendarClock size={15} className="mr-2" />I morgen</Button>
            <Button size="sm" variant="outline" onClick={() => schedule(3)} disabled={actionLoading}>+3 dager</Button>
            {nextAction.secondaryHref && <Button asChild size="sm" variant="outline"><Link href={nextAction.secondaryHref}>{nextAction.secondaryLabel || "Åpne"}</Link></Button>}
            {(stage === "QUALIFIED" || stage === "VIEWING" || stage === "NEGOTIATION") && <Button asChild size="sm" variant="outline"><Link href="/closing">Åpne Closing Workspace</Link></Button>}
          </div>
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <div><p className="text-xs uppercase tracking-wide text-slate-500">Kjøperprofil</p><strong className="mt-1 block text-3xl text-white">{data.completeness.score}%</strong></div>
            <ClipboardCheck size={32} className="text-emerald-300" />
          </div>
          <div className="mt-4 space-y-2">
            {data.completeness.checks.map((check) => <div key={check.id} className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} className={check.complete ? "text-emerald-400" : "text-slate-600"} /><span className={check.complete ? "text-slate-300" : "text-slate-500"}>{check.label}</span></div>)}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white">Godkjent kjøperprofil</h2>
          {data.activeBuyerProfile ? <>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">{data.activeBuyerProfile.status}</span><span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">{data.activeBuyerProfile.purchase_readiness || "unknown"}</span>{data.activeBuyerProfile.budget_amount && <span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">{money(data.activeBuyerProfile.budget_amount)}</span>}</div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{data.activeBuyerProfile.summary || "Profilen har ingen oppsummering ennå."}</p>
          </> : <p className="mt-3 text-sm text-slate-500">Ingen Lead Intelligence-profil er koblet til kontakten.</p>}
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white">Kriterier</h2>
          {data.criteria.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen strukturerte kriterier er lagret.</p> : <div className="mt-4 space-y-4">
            {Object.entries(groupedCriteria).map(([type, items]) => items.length > 0 && <div key={type}><p className="text-xs uppercase tracking-wide text-slate-500">{type.replaceAll("_", " ")}</p><div className="mt-2 flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300"><strong className="text-slate-100">{CRITERION_LABELS[item.key] || item.other_key || item.key}</strong>: {criterionValue(item.value)}</span>)}</div></div>)}
          </div>}
        </article>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Shortlists og presentasjoner</h2><p className="text-sm text-slate-500">Kun interne og godkjente Lead Intelligence-data.</p></div><ListChecks className="text-emerald-300" /></div>
        {data.shortlists.length === 0 ? <p className="mt-4 text-sm text-slate-500">Ingen shortlist er lagret for kunden.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{data.shortlists.map((shortlist) => <article key={shortlist.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-4"><div className="flex items-center justify-between"><strong className="text-white">{shortlist.title || "Boligshortlist"}</strong><span className="text-xs text-slate-500">{shortlist.status}</span></div><div className="mt-3 space-y-2">{shortlist.items.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-300">{item.rank}. {item.property_title || item.property_reference || "Bolig"}</span><span className="shrink-0 text-slate-500">{item.property_price ? money(item.property_price) : `${item.score || 0}/100`}</span></div>)}</div></article>)}</div>}
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500"><span>{data.presentations.length} presentasjoner</span><span>·</span><span>{data.messageDrafts.length} meldingsutkast</span><span>·</span><span>{data.portalMessages.length} portal-meldinger</span><span>·</span><span>{data.revenueEvents.length} AI-/revenue-minner</span></div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white">Samlet tidslinje</h2>
          {data.timeline.length === 0 ? <p className="mt-4 text-sm text-slate-500">Ingen aktiviteter er registrert.</p> : <div className="mt-4 space-y-4">{data.timeline.slice(0, 50).map((item) => { const Icon = timelineIcon(item.kind); return <div key={`${item.kind}-${item.id}`} className="flex gap-3"><div className="mt-0.5 rounded-full border border-slate-700 bg-slate-800 p-2"><Icon size={15} className="text-slate-300" /></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><strong className="text-sm text-slate-200">{item.title}</strong><span className="text-xs text-slate-600">{dateLabel(item.occurredAt)}</span></div>{item.detail && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-400">{item.detail}</p>}</div></div>; })}</div>}
        </article>

        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold text-white">Åpne oppgaver</h2>
          {data.workItems.filter((item) => item.status !== "DONE").length === 0 ? <p className="mt-4 text-sm text-slate-500">Ingen åpne kundeoppgaver.</p> : <div className="mt-4 space-y-3">{data.workItems.filter((item) => item.status !== "DONE").slice(0, 12).map((item) => <div key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-200">{item.title}</strong><span className="text-[11px] text-slate-500">{item.priority}</span></div><p className="mt-1 text-xs text-slate-400">{item.next_action || item.description || "Neste handling ikke satt"}</p></div>)}</div>}
          <Button asChild variant="ghost" size="sm" className="mt-4"><Link href="/marketing-tasks">Åpne Oppgave-HUB</Link></Button>
        </article>
      </section>
    </div>
  );
}
