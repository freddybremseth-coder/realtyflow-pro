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
  ClipboardCheck,
  FileText,
  Home,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Target,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CustomerUpdatePanel } from "@/components/customers/customer-update-panel";

interface Customer360Payload {
  generatedAt: string;
  contact: Record<string, any>;
  brandId: string;
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
    checks: Array<{ id: string; label: string; complete: boolean }>;
    missing: string[];
  };
  activeBuyerProfile: Record<string, any> | null;
  criteria: Array<Record<string, any>>;
  shortlists: Array<Record<string, any> & { items: Array<Record<string, any>> }>;
  presentations: Array<Record<string, any>>;
  messageDrafts: Array<Record<string, any>>;
  workItems: Array<Record<string, any>>;
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

type CustomerCardTab = "overview" | "update" | "timeline" | "property";

const STAGE_LABELS: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  WON: "Kunde / vunnet",
  LOST: "Tapt",
  ON_HOLD: "På vent",
};

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
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

function priorityClasses(priority?: string) {
  if (priority === "CRITICAL") return "border-red-400/40 bg-red-500/15 text-red-100";
  if (priority === "HIGH") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  if (priority === "MEDIUM") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function timelineIcon(kind: string) {
  if (kind === "portal") return MessageSquare;
  if (kind === "profile") return UserRound;
  if (kind === "shortlist") return Home;
  if (kind === "presentation" || kind === "draft") return FileText;
  if (kind === "task") return ClipboardCheck;
  if (kind === "revenue") return CircleDollarSign;
  return CalendarClock;
}

export function CrmCustomerCard({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [data, setData] = useState<Customer360Payload | null>(null);
  const [tab, setTab] = useState<CustomerCardTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/360`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente kundekortet.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente kundekortet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTab("overview");
    void load();
  }, [contactId]);

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

  const openTasks = (data?.workItems || []).filter((item) => String(item.status || "TO_DO").toUpperCase() !== "DONE");

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/75 p-3 md:p-6" onClick={onClose}>
      <Card className="my-3 w-full max-w-7xl border-slate-600 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="sticky top-0 z-20 border-b border-slate-700 bg-slate-950/95 p-4 backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-200">CRM-kundekort</span>
                {data?.contact && <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1">{STAGE_LABELS[String(data.contact.pipeline_status || "NEW").toUpperCase()] || data.contact.pipeline_status}</span>}
                {data && <span>{BRAND_LABELS[data.brandId] || data.brandId}</span>}
              </div>
              <h2 className="mt-3 truncate text-2xl font-bold text-white md:text-3xl">
                {data?.contact?.name || data?.contact?.email || (loading ? "Henter kundekort …" : "Kunde")}
              </h2>
              {data?.contact && (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
                  {data.contact.email && <a href={`mailto:${data.contact.email}`} className="inline-flex items-center gap-1.5 hover:text-white"><Mail size={15} />{data.contact.email}</a>}
                  {data.contact.phone && <a href={`tel:${data.contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-white"><Phone size={15} />{data.contact.phone}</a>}
                  <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={15} />{money(data.contact.pipeline_value)}</span>
                  <span className="inline-flex items-center gap-1.5"><Building2 size={15} />{data.contact.property_interest || "Boliginteresse ikke satt"}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}Oppdater
              </Button>
              <Button asChild variant="outline" size="sm"><Link href="/closing"><Target size={15} className="mr-2" />Closing</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/lead-intelligence">Lead Intelligence</Link></Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Lukk kundekort"><X size={20} /></Button>
            </div>
          </div>

          <nav className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70 p-1">
            {([
              ["overview", "Oversikt"],
              ["update", "Detaljer & oppdatering"],
              ["timeline", "Historikk"],
              ["property", "Kjøperprofil, boliger & oppgaver"],
            ] as Array<[CustomerCardTab, string]>).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${tab === id ? "bg-cyan-500/15 text-cyan-100" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </nav>
        </CardHeader>

        <CardContent className="p-4 md:p-6">
          {error && <div className="mb-4 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
          {loading && !data ? (
            <div className="flex min-h-72 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Bygger samlet kundekort …</div>
          ) : !data ? null : (
            <>
              {data.warnings.map((warning) => <div key={warning} className="mb-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><AlertTriangle size={17} />{warning}</div>)}

              {tab === "overview" && (
                <div className="space-y-5">
                  <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                    <article className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-emerald-300">Neste handling</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClasses(data.nextAction?.priority)}`}>{data.nextAction?.priority || "MEDIUM"}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-white">{data.nextAction?.title || "Følg opp kunden"}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{data.nextAction?.description || "Åpne kundeoppdatering og registrer neste steg."}</p>
                      <p className="mt-2 text-xs text-slate-500">Oppfølging: {dateLabel(data.contact.next_followup)}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setTab("update")}>Registrer oppdatering</Button>
                        {data.nextAction?.secondaryHref && <Button asChild size="sm" variant="outline"><Link href={data.nextAction.secondaryHref}>{data.nextAction.secondaryLabel || "Åpne"}</Link></Button>}
                      </div>
                    </article>
                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                      <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-wide text-slate-500">Profilkompletthet</p><strong className="mt-1 block text-3xl text-white">{data.completeness.score}%</strong></div><ClipboardCheck className="text-cyan-300" size={30} /></div>
                      <div className="mt-4 space-y-2">
                        {data.completeness.checks.map((check) => <div key={check.id} className="flex items-center gap-2 text-sm"><CheckCircle2 size={15} className={check.complete ? "text-emerald-400" : "text-slate-600"} /><span className={check.complete ? "text-slate-300" : "text-slate-500"}>{check.label}</span></div>)}
                      </div>
                    </article>
                  </section>

                  <section className="grid gap-4 xl:grid-cols-3">
                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 xl:col-span-2">
                      <h3 className="text-lg font-semibold text-white">Kundedetaljer</h3>
                      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                        {[
                          ["Navn", data.contact.name],
                          ["E-post", data.contact.email],
                          ["Telefon", data.contact.phone],
                          ["Land", data.contact.country],
                          ["Språk", data.contact.language],
                          ["Ønsket område", data.contact.preferred_location],
                          ["Boliginteresse", data.contact.property_interest],
                          ["Pipeline-verdi", money(data.contact.pipeline_value)],
                        ].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-slate-200">{String(value || "Ikke satt")}</dd></div>)}
                      </dl>
                      <Button className="mt-5" size="sm" onClick={() => setTab("update")}>Rediger detaljer</Button>
                    </article>
                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                      <h3 className="text-lg font-semibold text-white">Kjøperprofil</h3>
                      {data.activeBuyerProfile ? <>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{data.activeBuyerProfile.status}</span><span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{data.activeBuyerProfile.purchase_readiness || "unknown"}</span></div>
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{data.activeBuyerProfile.summary || "Profilen mangler oppsummering."}</p>
                      </> : <p className="mt-3 text-sm text-slate-500">Ingen koblet kjøperprofil.</p>}
                    </article>
                  </section>
                </div>
              )}

              {tab === "update" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <h3 className="font-semibold text-white">Samme kundekort – ingen separat Customer 360-side</h3>
                    <p className="mt-1 text-sm text-slate-400">Rediger kundedata eller registrer samtale, WhatsApp, e-post, møte, visning, tilbud, økonomi eller closing direkte her.</p>
                  </div>
                  <CustomerUpdatePanel contactId={contactId} defaultExpanded defaultTab="update" onSaved={() => void load()} />
                </div>
              )}

              {tab === "timeline" && (
                <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                  <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-white">Samlet kundehistorikk</h3><p className="text-sm text-slate-500">CRM-oppdateringer, visninger, meldinger, profiler, oppgaver og revenue-hendelser.</p></div><MessageSquare className="text-cyan-300" /></div>
                  {data.timeline.length === 0 ? <p className="mt-5 text-sm text-slate-500">Ingen aktiviteter er registrert.</p> : <div className="mt-5 space-y-4">{data.timeline.slice(0, 150).map((item) => { const Icon = timelineIcon(item.kind); return <div key={`${item.kind}-${item.id}`} className="flex gap-3"><div className="mt-0.5 rounded-full border border-slate-700 bg-slate-800 p-2"><Icon size={15} className="text-slate-300" /></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><strong className="text-sm text-slate-200">{item.title}</strong><span className="text-xs text-slate-600">{dateLabel(item.occurredAt)}</span></div>{item.detail && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-400">{item.detail}</p>}</div></div>; })}</div>}
                </section>
              )}

              {tab === "property" && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                    <h3 className="text-lg font-semibold text-white">Kriterier</h3>
                    {data.criteria.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen strukturerte kriterier.</p> : <div className="mt-4 space-y-4">{Object.entries(groupedCriteria).map(([type, items]) => items.length > 0 && <div key={type}><p className="text-xs uppercase tracking-wide text-slate-500">{type.replaceAll("_", " ")}</p><div className="mt-2 flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300"><strong className="text-slate-100">{CRITERION_LABELS[item.key] || item.other_key || item.key}</strong>: {criterionValue(item.value)}</span>)}</div></div>)}</div>}
                  </section>

                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                    <h3 className="text-lg font-semibold text-white">Åpne oppgaver</h3>
                    {openTasks.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen åpne kundeoppgaver.</p> : <div className="mt-4 space-y-3">{openTasks.slice(0, 20).map((item) => <article key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3"><div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-200">{item.title}</strong><span className="text-[11px] text-slate-500">{item.priority}</span></div><p className="mt-1 text-xs text-slate-400">{item.next_action || item.description || "Neste handling ikke satt"}</p></article>)}</div>}
                    <Button asChild variant="outline" size="sm" className="mt-4"><Link href="/execution">Åpne Execution</Link></Button>
                  </section>

                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 xl:col-span-2">
                    <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-white">Shortlists og presentasjoner</h3><p className="text-sm text-slate-500">Alt som er koblet til kunden i Lead Intelligence.</p></div><Home className="text-cyan-300" /></div>
                    {data.shortlists.length === 0 ? <p className="mt-4 text-sm text-slate-500">Ingen shortlist er lagret.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{data.shortlists.map((shortlist) => <article key={shortlist.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-4"><div className="flex items-start justify-between gap-3"><strong className="text-white">{shortlist.title || "Boligshortlist"}</strong><span className="text-xs text-slate-500">{shortlist.status}</span></div><div className="mt-3 space-y-2">{shortlist.items.slice(0, 10).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-300">{item.rank}. {item.property_title || item.property_reference || "Bolig"}</span><span className="shrink-0 text-slate-500">{item.property_price ? money(item.property_price) : `${item.score || 0}/100`}</span></div>)}</div></article>)}</div>}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{data.presentations.length} presentasjoner</span><span>·</span><span>{data.messageDrafts.length} meldingsutkast</span><Button asChild variant="ghost" size="sm"><Link href="/lead-intelligence">Administrer i Lead Intelligence <ArrowRight size={13} className="ml-1" /></Link></Button></div>
                  </section>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
