"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CircleDollarSign,
  LayoutGrid,
  Loader2,
  Mail,
  MailCheck,
  MailQuestion,
  MessageSquareReply,
  PauseCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldOff,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmCustomerCard } from "@/components/crm/crm-customer-card";
import { CrmCommandMenu } from "@/components/crm/crm-command-menu";
import { DomainWorkItems } from "@/components/hub/domain-work-items";
import {
  REAL_ESTATE_STAGE_LABELS,
  REAL_ESTATE_STAGE_ORDER,
  buildCustomerListAction,
  normalizeRealEstateStage,
  type CustomerListActionPriority,
} from "@/lib/customers/action-priority";

type MailStatus = "ALL" | "READY_NOT_STARTED" | "AUTO_PLANNED" | "SENT" | "REPLIED" | "PAUSED" | "STOPPED" | "CLOSED" | "NO_EMAIL";

type Communication = {
  status: Exclude<MailStatus, "ALL">;
  label: string;
  sentCount: number;
  lastSentAt: string | null;
  lastInboundReplyAt: string | null;
  automationState: string;
  shouldReceiveEmail: boolean;
  blockedReason: string | null;
  hasReplyAfterLastSend: boolean;
};

interface Contact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  property_interest?: string | null;
  preferred_location?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  next_followup?: string | null;
  last_contact?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  source?: string | null;
  interactions?: Array<Record<string, unknown>> | null;
  communication?: Communication;
}

type CrmTab = "leads" | "pipeline" | "customers" | "all";

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  keyholding: "Keyholding",
};

const STAGE_CLASSES: Record<string, string> = {
  NEW: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  CONTACT: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  QUALIFIED: "border-purple-500/30 bg-purple-500/10 text-purple-200",
  MATCHING: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
  VIEWING: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  NEGOTIATION: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  RESERVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  ON_HOLD: "border-slate-600 bg-slate-800 text-slate-300",
  WON: "border-green-500/30 bg-green-500/10 text-green-200",
  LOST: "border-red-500/30 bg-red-500/10 text-red-200",
};

const ACTION_CLASSES: Record<CustomerListActionPriority, string> = {
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-100",
  HIGH: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  MEDIUM: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
  LOW: "border-slate-700 bg-slate-800/70 text-slate-300",
};

const MAIL_CLASSES: Record<Exclude<MailStatus, "ALL">, string> = {
  READY_NOT_STARTED: "border-blue-500/30 bg-blue-500/10 text-blue-100",
  AUTO_PLANNED: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
  SENT: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  REPLIED: "border-violet-500/30 bg-violet-500/10 text-violet-100",
  PAUSED: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  STOPPED: "border-red-500/30 bg-red-500/10 text-red-100",
  CLOSED: "border-slate-600 bg-slate-800 text-slate-300",
  NO_EMAIL: "border-slate-700 bg-slate-900 text-slate-500",
};

const MAIL_FILTERS: Array<{ id: MailStatus; label: string }> = [
  { id: "ALL", label: "Alle" },
  { id: "READY_NOT_STARTED", label: "Klar – ikke sendt" },
  { id: "AUTO_PLANNED", label: "Auto planlagt" },
  { id: "SENT", label: "Sendt" },
  { id: "REPLIED", label: "Har svart" },
  { id: "PAUSED", label: "Pauset" },
  { id: "STOPPED", label: "STOPP / blokkert" },
  { id: "NO_EMAIL", label: "Mangler e-post" },
];

const TAB_STAGES: Record<Exclude<CrmTab, "all">, Set<string>> = {
  leads: new Set(["NEW"]),
  pipeline: new Set(["CONTACT", "QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED", "ON_HOLD"]),
  customers: new Set(["WON", "LOST"]),
};

const ACTIVE_VALUE_STAGES = new Set(["NEW", "CONTACT", "QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED"]);

function normalizeStatus(value: unknown) {
  return normalizeRealEstateStage(value);
}

function stageLabel(status: string) {
  return REAL_ESTATE_STAGE_LABELS[status as keyof typeof REAL_ESTATE_STAGE_LABELS] || status;
}

function money(value: unknown) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: Number(value || 0) >= 1_000_000 ? "compact" : "standard" }).format(Number(value || 0));
}

function dateLabel(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "Ikke satt" : date.toLocaleDateString("nb-NO");
}

function isOverdue(value: unknown) {
  const date = new Date(String(value || ""));
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export default function CustomersPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<CrmTab>("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [mailFilter, setMailFilter] = useState<MailStatus>("ALL");
  const [actionOnly, setActionOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/contacts", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || body?.error || "Kunne ikke hente CRM-kontakter.");
      setContacts(body?.contacts || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente CRM-kontakter.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    const contactId = params.get("contactId");
    const requestedTab = params.get("tab") as CrmTab | null;
    const requestedStage = params.get("stage");
    const requestedMail = params.get("mail") as MailStatus | null;
    if (contactId) setSelectedContactId(contactId);
    if (requestedTab && ["leads", "pipeline", "customers", "all"].includes(requestedTab)) setTab(requestedTab);
    if (requestedStage) setStageFilter(normalizeStatus(requestedStage));
    if (requestedMail && MAIL_FILTERS.some((item) => item.id === requestedMail)) setMailFilter(requestedMail);
    if (params.get("action") === "1") setActionOnly(true);
  }, []);

  function syncUrl(next: { contactId?: string | null; tab?: CrmTab; actionOnly?: boolean; stage?: string; mail?: MailStatus }) {
    const params = new URLSearchParams(window.location.search);
    const nextTab = next.tab ?? tab;
    const nextActionOnly = next.actionOnly ?? actionOnly;
    const nextStage = next.stage ?? stageFilter;
    const nextMail = next.mail ?? mailFilter;
    params.set("tab", nextTab);
    if (next.contactId === null) params.delete("contactId");
    else if (next.contactId) params.set("contactId", next.contactId);
    if (nextActionOnly) params.set("action", "1"); else params.delete("action");
    if (nextStage && nextStage !== "all") params.set("stage", nextStage); else params.delete("stage");
    if (nextMail !== "ALL") params.set("mail", nextMail); else params.delete("mail");
    const suffix = params.toString();
    window.history.replaceState(null, "", suffix ? `/customers?${suffix}` : "/customers");
  }

  function openCustomer(contact: Contact) { setSelectedContactId(contact.id); syncUrl({ contactId: contact.id }); }
  function closeCustomer() { setSelectedContactId(null); syncUrl({ contactId: null }); void load(); }
  function selectTab(nextTab: CrmTab) { setTab(nextTab); setStageFilter("all"); syncUrl({ tab: nextTab, stage: "all" }); }
  function selectStage(nextStage: string) { setStageFilter(nextStage); setTab("all"); syncUrl({ tab: "all", stage: nextStage }); }
  function selectMail(nextMail: MailStatus) { setMailFilter(nextMail); syncUrl({ mail: nextMail }); }
  function toggleActionOnly() { const next = !actionOnly; setActionOnly(next); syncUrl({ actionOnly: next }); }

  function applyCommandView(next: { tab?: CrmTab; mail?: MailStatus; actionOnly?: boolean }) {
    const nextTab = next.tab || "all";
    const nextMail = next.mail || "ALL";
    const nextActionOnly = Boolean(next.actionOnly);
    setTab(nextTab);
    setStageFilter("all");
    setMailFilter(nextMail);
    setActionOnly(nextActionOnly);
    setSearch("");
    syncUrl({ tab: nextTab, stage: "all", mail: nextMail, actionOnly: nextActionOnly });
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts
      .map((contact) => ({ contact, action: buildCustomerListAction(contact) }))
      .filter(({ contact, action }) => {
        const status = normalizeStatus(contact.pipeline_status);
        if (tab !== "all" && !TAB_STAGES[tab].has(status)) return false;
        if (stageFilter !== "all" && status !== stageFilter) return false;
        if (mailFilter !== "ALL" && contact.communication?.status !== mailFilter) return false;
        if (actionOnly && !action.needsAction) return false;
        if (!query) return true;
        return [contact.name, contact.email, contact.phone, contact.property_interest, contact.preferred_location, contact.brand_id, contact.brand, contact.source, action.label, action.reason, contact.communication?.label]
          .filter(Boolean).join(" ").toLowerCase().includes(query);
      })
      .sort((a, b) => b.action.score - a.action.score || Number(b.contact.pipeline_value || 0) - Number(a.contact.pipeline_value || 0));
  }, [contacts, search, tab, stageFilter, mailFilter, actionOnly]);

  const counts = useMemo(() => ({
    leads: contacts.filter((item) => normalizeStatus(item.pipeline_status) === "NEW").length,
    pipeline: contacts.filter((item) => TAB_STAGES.pipeline.has(normalizeStatus(item.pipeline_status))).length,
    customers: contacts.filter((item) => TAB_STAGES.customers.has(normalizeStatus(item.pipeline_status))).length,
    overdue: contacts.filter((item) => isOverdue(item.next_followup) && !["WON", "LOST"].includes(normalizeStatus(item.pipeline_status))).length,
    action: contacts.filter((item) => buildCustomerListAction(item).needsAction && !["WON", "LOST"].includes(normalizeStatus(item.pipeline_status))).length,
    value: contacts.filter((item) => ACTIVE_VALUE_STAGES.has(normalizeStatus(item.pipeline_status))).reduce((sum, item) => sum + Number(item.pipeline_value || 0), 0),
  }), [contacts]);

  const stageCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const contact of contacts) { const status = normalizeStatus(contact.pipeline_status); result[status] = (result[status] || 0) + 1; }
    return result;
  }, [contacts]);

  const mailCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const contact of contacts) { const status = contact.communication?.status || "NO_EMAIL"; result[status] = (result[status] || 0) + 1; }
    return result;
  }, [contacts]);

  const stageOptions = useMemo(() => {
    const canonical = REAL_ESTATE_STAGE_ORDER.filter((status) => stageCounts[status]);
    const extras = Object.keys(stageCounts).filter((status) => !REAL_ESTATE_STAGE_ORDER.includes(status as any)).sort();
    return [...canonical, ...extras];
  }, [stageCounts]);

  const brandOptions = useMemo(() => {
    const ids = [...new Set(contacts.map((contact) => String(contact.brand_id || contact.brand || "").trim()).filter(Boolean))].sort();
    return ids.map((id) => ({ id, label: BRAND_LABELS[id] || id }));
  }, [contacts]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-300"><LayoutGrid size={17} /> Samlet kundeopplevelse</div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">CRM & leads</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Pipeline, kundedialog og faktisk e-poststatus samlet på ett sted. «Klar – ikke sendt» betyr at kunden kan kontaktes, men at RealtyFlow ikke har registrert en reell utsendelse ennå.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button asChild variant="outline"><Link href="/today"><Sparkles size={16} className="mr-2" />I dag</Link></Button>
          <Button asChild variant="outline"><Link href="/lead-intelligence"><Bot size={16} className="mr-2" />AI Lead Inbox</Link></Button>
          <Button asChild variant="outline"><Link href="/closing"><Target size={16} className="mr-2" />Closing</Link></Button>
          <Button asChild variant="outline"><Link href="/pipeline">Kanban</Link></Button>
          <Button onClick={load} disabled={loading} className="col-span-2 sm:col-span-1">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}

      <CrmCommandMenu
        brands={brandOptions}
        onShowReady={() => applyCommandView({ mail: "READY_NOT_STARTED" })}
        onShowReplied={() => applyCommandView({ mail: "REPLIED" })}
        onShowStopped={() => applyCommandView({ mail: "STOPPED" })}
        onShowAction={() => applyCommandView({ actionOnly: true })}
        onShowPipeline={() => applyCommandView({ tab: "pipeline" })}
        onShowClosed={() => applyCommandView({ tab: "customers" })}
        onShowNoEmail={() => applyCommandView({ mail: "NO_EMAIL" })}
        onRefresh={() => void load()}
      />

      <DomainWorkItems title="Salg & CRM-hub" description="Åpne salgs- og kundeoppgaver fra Oppgave-HUB-en — fullfør dem her." icon={<Users className="h-4 w-4" />} sources={["crm", "website_lead", "chatbot"]} links={[{ label: "Lead Intelligence", href: "/lead-intelligence" }, { label: "Oppgave-HUB", href: "/marketing-tasks" }, { label: "E-post AI", href: "/email" }]} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <button onClick={() => selectMail("READY_NOT_STARTED")} className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-left"><MailQuestion className="text-blue-300" /><p className="mt-3 text-xs uppercase tracking-wide text-blue-200/70">Klar – ikke sendt</p><strong className="mt-1 block text-2xl text-white">{mailCounts.READY_NOT_STARTED || 0}</strong></button>
        <button onClick={() => selectMail("AUTO_PLANNED")} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-left"><Mail className="text-cyan-300" /><p className="mt-3 text-xs uppercase tracking-wide text-cyan-200/70">Auto planlagt</p><strong className="mt-1 block text-2xl text-white">{mailCounts.AUTO_PLANNED || 0}</strong></button>
        <button onClick={() => selectMail("SENT")} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left"><MailCheck className="text-emerald-300" /><p className="mt-3 text-xs uppercase tracking-wide text-emerald-200/70">Sendt</p><strong className="mt-1 block text-2xl text-white">{mailCounts.SENT || 0}</strong></button>
        <button onClick={() => selectMail("REPLIED")} className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-left"><MessageSquareReply className="text-violet-300" /><p className="mt-3 text-xs uppercase tracking-wide text-violet-200/70">Har svart</p><strong className="mt-1 block text-2xl text-white">{mailCounts.REPLIED || 0}</strong></button>
        <button onClick={() => selectMail("PAUSED")} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left"><PauseCircle className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-amber-200/70">Pauset</p><strong className="mt-1 block text-2xl text-white">{mailCounts.PAUSED || 0}</strong></button>
        <button onClick={() => selectMail("STOPPED")} className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-left"><ShieldOff className="text-red-300" /><p className="mt-3 text-xs uppercase tracking-wide text-red-200/70">STOPP / blokkert</p><strong className="mt-1 block text-2xl text-white">{mailCounts.STOPPED || 0}</strong></button>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <button onClick={() => selectTab("all")} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-left"><Users className="text-cyan-300" /><p className="mt-3 text-xs uppercase tracking-wide text-cyan-200/70">Alle</p><strong className="mt-1 block text-2xl text-white">{contacts.length}</strong></button>
        <button onClick={toggleActionOnly} className="rounded-xl border border-red-500/20 bg-slate-900/60 p-4 text-left"><Sparkles className="text-red-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Trenger handling</p><strong className="mt-1 block text-2xl text-white">{counts.action}</strong></button>
        <article className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4"><CalendarClock className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Forfalt</p><strong className="mt-1 block text-2xl text-white">{counts.overdue}</strong></article>
        <button onClick={() => selectStage("NEW")} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 text-left"><Users className="text-blue-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Nye</p><strong className="mt-1 block text-2xl text-white">{stageCounts.NEW || 0}</strong></button>
        <button onClick={() => selectStage("QUALIFIED")} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 text-left"><Target className="text-purple-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Kvalifisert</p><strong className="mt-1 block text-2xl text-white">{stageCounts.QUALIFIED || 0}</strong></button>
        <button onClick={() => selectStage("MATCHING")} className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4 text-left"><Search className="text-cyan-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Matching</p><strong className="mt-1 block text-2xl text-white">{stageCounts.MATCHING || 0}</strong></button>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><CircleDollarSign className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Aktiv verdi</p><strong className="mt-1 block text-2xl text-white">{money(counts.value)}</strong></article>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([["all", `Alle (${contacts.length})`], ["leads", `Nye (${counts.leads})`], ["pipeline", `Aktiv pipeline (${counts.pipeline})`], ["customers", `Avsluttet (${counts.customers})`]] as Array<[CrmTab, string]>).map(([id, label]) => <button key={id} onClick={() => selectTab(id)} className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${tab === id && stageFilter === "all" ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"}`}>{label}</button>)}
          <button onClick={toggleActionOnly} className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${actionOnly ? "border-red-400/50 bg-red-500/15 text-red-100" : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"}`}><Sparkles size={14} className="mr-1.5 inline" />Kun handling</button>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">E-poststatus</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MAIL_FILTERS.map((filter) => <button key={filter.id} onClick={() => selectMail(filter.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${mailFilter === filter.id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-slate-700 text-slate-400"}`}>{filter.label} {filter.id === "ALL" ? contacts.length : (mailCounts[filter.id] || 0)}</button>)}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Pipeline-steg</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button onClick={() => selectStage("all")} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${stageFilter === "all" ? "border-white/30 bg-white/10 text-white" : "border-slate-700 text-slate-400"}`}>Alle {contacts.length}</button>
            {stageOptions.map((status) => <button key={status} onClick={() => selectStage(status)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${stageFilter === status ? (STAGE_CLASSES[status] || "border-cyan-500/40 bg-cyan-500/10 text-cyan-100") : "border-slate-700 text-slate-400"}`}>{stageLabel(status)} {stageCounts[status] || 0}</button>)}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Viser <b className="text-slate-200">{visible.length}</b> av <b className="text-slate-200">{contacts.length}</b>.</p>
          <div className="relative w-full sm:max-w-xl"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk navn, område, e-poststatus, brand eller handling" className="pl-10" /></div>
        </div>
      </section>

      {loading && contacts.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Henter CRM …</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-10 text-center text-slate-400">Ingen kontakter i dette filteret. <button onClick={() => { selectStage("all"); selectMail("ALL"); }} className="ml-1 text-cyan-300 underline">Vis alle</button></div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map(({ contact, action }) => {
            const status = normalizeStatus(contact.pipeline_status);
            const brandId = String(contact.brand_id || contact.brand || "zeneco");
            const overdue = isOverdue(contact.next_followup) && !["WON", "LOST"].includes(status);
            const communication = contact.communication;
            const mailStatus = communication?.status || "NO_EMAIL";
            return (
              <button key={contact.id} type="button" onClick={() => openCustomer(contact)} className="group rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 text-left transition hover:border-cyan-500/50 hover:bg-slate-900 hover:shadow-lg hover:shadow-cyan-950/20 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] ${STAGE_CLASSES[status] || STAGE_CLASSES.ON_HOLD}`}>{stageLabel(status)}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] ${MAIL_CLASSES[mailStatus]}`}>{communication?.label || "E-poststatus ukjent"}</span>
                      <span className="text-xs text-slate-500">{BRAND_LABELS[brandId] || brandId}</span>
                      {overdue && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">Forfalt</span>}
                    </div>
                    <h2 className="mt-3 truncate text-lg font-semibold text-white">{contact.name || contact.email || "Ukjent kontakt"}</h2>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-400">{contact.property_interest || contact.preferred_location || "Ingen boliginteresse registrert"}</p>
                  </div>
                  <span className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-cyan-300 transition group-hover:border-cyan-500/30 group-hover:bg-cyan-500/10"><LayoutGrid size={18} /></span>
                </div>

                <div className={`mt-4 rounded-lg border p-3 ${ACTION_CLASSES[action.priority]}`}>
                  <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-wide">{action.needsAction ? `Neste fokus · ${action.priority}` : "Planlagt"}</span><span className="text-[10px] opacity-70">{action.score}/100</span></div>
                  <p className="mt-1 text-sm font-semibold">{action.label}</p>
                  <p className="mt-1 text-xs opacity-75">Hvorfor: {action.reason}</p>
                </div>

                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                  <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-300">E-postoppfølging</span><span>{communication?.automationState || "ukjent"}</span></div>
                  <div className="mt-1 flex items-center justify-between gap-3"><span>Siste sendt</span><span>{communication?.lastSentAt ? dateLabel(communication.lastSentAt) : "Aldri"}</span></div>
                  {communication?.sentCount ? <div className="mt-1 flex items-center justify-between gap-3"><span>Registrerte utsendelser</span><span>{communication.sentCount}</span></div> : null}
                </div>

                <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5"><Mail size={12} /><span className="truncate">{contact.email || "Ingen e-post"}</span></span>
                  <span className="inline-flex min-w-0 items-center gap-1.5"><Phone size={12} /><span className="truncate">{contact.phone || "Ingen telefon"}</span></span>
                  <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={12} />{money(contact.pipeline_value)}</span>
                  <span className={`inline-flex items-center gap-1.5 ${overdue ? "text-red-300" : ""}`}><CalendarClock size={12} />{dateLabel(contact.next_followup)}</span>
                </div>
                <div className="mt-4 border-t border-slate-800 pt-3 text-xs font-medium text-cyan-300">Åpne Customer 360 og gjør neste steg →</div>
              </button>
            );
          })}
        </section>
      )}

      {selectedContactId && <CrmCustomerCard contactId={selectedContactId} onClose={closeCustomer} />}
    </div>
  );
}
