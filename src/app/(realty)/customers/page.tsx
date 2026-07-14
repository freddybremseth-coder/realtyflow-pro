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
  Phone,
  RefreshCw,
  Search,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmCustomerCard } from "@/components/crm/crm-customer-card";

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
  updated_at?: string | null;
  source?: string | null;
  interactions?: Array<Record<string, unknown>> | null;
}

type CrmTab = "leads" | "pipeline" | "customers" | "all";

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  keyholding: "Keyholding",
};

const STAGE_LABELS: Record<string, string> = {
  NEW: "Ny lead",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  WON: "Kunde / vunnet",
  LOST: "Tapt",
  ON_HOLD: "På vent",
};

const STAGE_CLASSES: Record<string, string> = {
  NEW: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  CONTACT: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  QUALIFIED: "border-purple-500/30 bg-purple-500/10 text-purple-200",
  VIEWING: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  NEGOTIATION: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  WON: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  LOST: "border-red-500/30 bg-red-500/10 text-red-200",
  ON_HOLD: "border-slate-600 bg-slate-800 text-slate-300",
};

const TAB_STAGES: Record<Exclude<CrmTab, "all">, Set<string>> = {
  leads: new Set(["NEW"]),
  pipeline: new Set(["CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"]),
  customers: new Set(["WON", "LOST"]),
};

function normalizeStatus(value: unknown) {
  const status = String(value || "NEW").trim().toUpperCase();
  if (["CUSTOMER", "KUNDE", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON"].includes(status)) return "WON";
  if (["TAPT", "CLOSED_LOST"].includes(status)) return "LOST";
  return status;
}

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
  return Number.isNaN(date.getTime()) ? "Ikke satt" : date.toLocaleDateString("nb-NO");
}

function isOverdue(value: unknown) {
  const date = new Date(String(value || ""));
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export default function CustomersPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<CrmTab>("pipeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/contacts?view=pipeline", { cache: "no-store" });
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
    if (contactId) setSelectedContactId(contactId);
    if (requestedTab && ["leads", "pipeline", "customers", "all"].includes(requestedTab)) setTab(requestedTab);
  }, []);

  function openCustomer(contact: Contact) {
    setSelectedContactId(contact.id);
    const status = normalizeStatus(contact.pipeline_status);
    const nextTab: CrmTab = status === "NEW" ? "leads" : ["WON", "LOST"].includes(status) ? "customers" : "pipeline";
    setTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set("contactId", contact.id);
    params.set("tab", nextTab);
    window.history.replaceState(null, "", `/customers?${params.toString()}`);
  }

  function closeCustomer() {
    setSelectedContactId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("contactId");
    params.set("tab", tab);
    window.history.replaceState(null, "", `/customers?${params.toString()}`);
    void load();
  }

  function selectTab(nextTab: CrmTab) {
    setTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", nextTab);
    if (!selectedContactId) params.delete("contactId");
    window.history.replaceState(null, "", `/customers?${params.toString()}`);
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const weights: Record<string, number> = { NEGOTIATION: 8, VIEWING: 7, QUALIFIED: 6, CONTACT: 5, NEW: 4, ON_HOLD: 3, WON: 2, LOST: 1 };
    return contacts
      .filter((contact) => {
        const status = normalizeStatus(contact.pipeline_status);
        if (tab !== "all" && !TAB_STAGES[tab].has(status)) return false;
        if (!query) return true;
        return [contact.name, contact.email, contact.phone, contact.property_interest, contact.preferred_location, contact.brand_id, contact.brand, contact.source]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const statusA = normalizeStatus(a.pipeline_status);
        const statusB = normalizeStatus(b.pipeline_status);
        const overdueA = isOverdue(a.next_followup) ? 1 : 0;
        const overdueB = isOverdue(b.next_followup) ? 1 : 0;
        return overdueB - overdueA || (weights[statusB] || 0) - (weights[statusA] || 0) || Number(b.pipeline_value || 0) - Number(a.pipeline_value || 0);
      });
  }, [contacts, search, tab]);

  const counts = useMemo(() => ({
    leads: contacts.filter((item) => normalizeStatus(item.pipeline_status) === "NEW").length,
    pipeline: contacts.filter((item) => TAB_STAGES.pipeline.has(normalizeStatus(item.pipeline_status))).length,
    customers: contacts.filter((item) => TAB_STAGES.customers.has(normalizeStatus(item.pipeline_status))).length,
    overdue: contacts.filter((item) => isOverdue(item.next_followup) && !["WON", "LOST"].includes(normalizeStatus(item.pipeline_status))).length,
    value: contacts.filter((item) => ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION"].includes(normalizeStatus(item.pipeline_status))).reduce((sum, item) => sum + Number(item.pipeline_value || 0), 0),
  }), [contacts]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-300"><LayoutGrid size={17} /> Samlet kundeopplevelse</div>
          <h1 className="text-3xl font-bold text-white">CRM & kunder</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Leads, pipeline, kunder, kundedetaljer, visningsnotater, Customer 360, kjøperprofil, boliger, oppgaver og tidslinje er samlet her.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/lead-intelligence"><Bot size={16} className="mr-2" />AI Lead Inbox</Link></Button>
          <Button asChild variant="outline"><Link href="/closing"><Target size={16} className="mr-2" />Closing</Link></Button>
          <Button asChild variant="outline"><Link href="/pipeline">Avansert Kanban</Link></Button>
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Users className="text-blue-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Nye leads</p><strong className="mt-1 block text-2xl text-white">{counts.leads}</strong></article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Target className="text-purple-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Aktiv pipeline</p><strong className="mt-1 block text-2xl text-white">{counts.pipeline}</strong></article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Users className="text-emerald-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Kunder / avsluttet</p><strong className="mt-1 block text-2xl text-white">{counts.customers}</strong></article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><CalendarClock className="text-red-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Forfalt oppfølging</p><strong className="mt-1 block text-2xl text-white">{counts.overdue}</strong></article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><CircleDollarSign className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Pipeline-verdi</p><strong className="mt-1 block text-2xl text-white">{money(counts.value)}</strong></article>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <nav className="flex flex-wrap gap-2">
            {([
              ["leads", `Leads (${counts.leads})`],
              ["pipeline", `Pipeline (${counts.pipeline})`],
              ["customers", `Kunder (${counts.customers})`],
              ["all", `Alle (${contacts.length})`],
            ] as Array<[CrmTab, string]>).map(([id, label]) => <button key={id} onClick={() => selectTab(id)} className={`rounded-full border px-4 py-2 text-sm transition ${tab === id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"}`}>{label}</button>)}
          </nav>
          <div className="relative w-full max-w-xl"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk navn, e-post, telefon, område, bolig eller brand" className="pl-10" /></div>
        </div>
      </section>

      {loading && contacts.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Henter CRM …</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-10 text-center text-slate-400">Ingen kontakter i dette filteret.</div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((contact) => {
            const status = normalizeStatus(contact.pipeline_status);
            const brandId = String(contact.brand_id || contact.brand || "zeneco");
            const overdue = isOverdue(contact.next_followup) && !["WON", "LOST"].includes(status);
            return (
              <button key={contact.id} type="button" onClick={() => openCustomer(contact)} className="group rounded-xl border border-slate-700/70 bg-slate-900/60 p-5 text-left transition hover:border-cyan-500/50 hover:bg-slate-900 hover:shadow-lg hover:shadow-cyan-950/20">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] ${STAGE_CLASSES[status] || STAGE_CLASSES.ON_HOLD}`}>{STAGE_LABELS[status] || status}</span>
                      <span className="text-xs text-slate-500">{BRAND_LABELS[brandId] || brandId}</span>
                      {overdue && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-200">Forfalt</span>}
                    </div>
                    <h2 className="mt-3 truncate text-lg font-semibold text-white">{contact.name || contact.email || "Ukjent kontakt"}</h2>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-400">{contact.property_interest || contact.preferred_location || "Ingen boliginteresse registrert"}</p>
                  </div>
                  <span className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-cyan-300 transition group-hover:border-cyan-500/30 group-hover:bg-cyan-500/10"><LayoutGrid size={18} /></span>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5"><Mail size={12} /><span className="truncate">{contact.email || "Ingen e-post"}</span></span>
                  <span className="inline-flex min-w-0 items-center gap-1.5"><Phone size={12} /><span className="truncate">{contact.phone || "Ingen telefon"}</span></span>
                  <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={12} />{money(contact.pipeline_value)}</span>
                  <span className={`inline-flex items-center gap-1.5 ${overdue ? "text-red-300" : ""}`}><CalendarClock size={12} />{dateLabel(contact.next_followup)}</span>
                </div>
                <div className="mt-4 border-t border-slate-800 pt-3 text-xs font-medium text-cyan-300">Åpne samlet kundekort →</div>
              </button>
            );
          })}
        </section>
      )}

      {selectedContactId && <CrmCustomerCard contactId={selectedContactId} onClose={closeCustomer} />}
    </div>
  );
}
