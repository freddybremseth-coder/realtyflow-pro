"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  ExternalLink,
  GripVertical,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildCustomerListAction } from "@/lib/customers/action-priority";
import {
  CUSTOMER_PIPELINE_STATUS_LABELS,
  normalizeCustomerPipelineStatus,
  type CustomerPipelineStatus,
} from "@/lib/customer-updates";

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
}

const ACTIVE_STAGES: CustomerPipelineStatus[] = [
  "NEW",
  "CONTACT",
  "QUALIFIED",
  "MATCHING",
  "VIEWING",
  "NEGOTIATION",
  "RESERVED",
  "ON_HOLD",
];

const STAGE_ACCENTS: Record<CustomerPipelineStatus, string> = {
  NEW: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  CONTACT: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  QUALIFIED: "border-purple-500/30 bg-purple-500/10 text-purple-200",
  MATCHING: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  VIEWING: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  NEGOTIATION: "border-orange-500/30 bg-orange-500/10 text-orange-200",
  RESERVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  WON: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  LOST: "border-red-500/30 bg-red-500/10 text-red-200",
  ON_HOLD: "border-slate-600 bg-slate-800 text-slate-300",
};

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
  keyholding: "Keyholding",
};

function money(value: unknown) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: Number(value || 0) >= 1_000_000 ? "compact" : "standard",
  }).format(Number(value || 0));
}

function dateInfo(value: unknown) {
  if (!value) return { label: "Ikke planlagt", overdue: false, future: false };
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return { label: "Ugyldig dato", overdue: false, future: false };
  const now = Date.now();
  return {
    label: date.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" }),
    overdue: date.getTime() < now,
    future: date.getTime() >= now,
  };
}

export default function PipelinePage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/contacts", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || body?.error || "Kunne ikke hente pipeline.");
      setContacts(body?.contacts || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente pipeline.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeContacts = useMemo(() => contacts.filter((contact) => ACTIVE_STAGES.includes(normalizeCustomerPipelineStatus(contact.pipeline_status))), [contacts]);

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeContacts;
    return activeContacts.filter((contact) => [
      contact.name,
      contact.email,
      contact.phone,
      contact.property_interest,
      contact.preferred_location,
      contact.brand_id,
      contact.brand,
      contact.source,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [activeContacts, search]);

  const byStage = useMemo(() => {
    const result = new Map<CustomerPipelineStatus, Contact[]>();
    for (const stage of ACTIVE_STAGES) result.set(stage, []);
    for (const contact of visibleContacts) {
      const stage = normalizeCustomerPipelineStatus(contact.pipeline_status);
      result.get(stage)?.push(contact);
    }
    for (const rows of result.values()) {
      rows.sort((a, b) => buildCustomerListAction(b).score - buildCustomerListAction(a).score || Number(b.pipeline_value || 0) - Number(a.pipeline_value || 0));
    }
    return result;
  }, [visibleContacts]);

  const metrics = useMemo(() => {
    const actions = activeContacts.map((contact) => buildCustomerListAction(contact));
    return {
      active: activeContacts.length,
      needsAction: actions.filter((action) => action.needsAction).length,
      overdue: activeContacts.filter((contact) => dateInfo(contact.next_followup).overdue).length,
      matching: activeContacts.filter((contact) => normalizeCustomerPipelineStatus(contact.pipeline_status) === "MATCHING").length,
      reserved: activeContacts.filter((contact) => normalizeCustomerPipelineStatus(contact.pipeline_status) === "RESERVED").length,
      value: activeContacts.reduce((sum, contact) => sum + Number(contact.pipeline_value || 0), 0),
    };
  }, [activeContacts]);

  async function moveContact(contactId: string, stage: CustomerPipelineStatus) {
    if (!ACTIVE_STAGES.includes(stage)) return;
    const current = contacts.find((contact) => contact.id === contactId);
    if (!current) return;
    const previousStatus = current.pipeline_status || "NEW";
    if (normalizeCustomerPipelineStatus(previousStatus) === stage) return;

    setSavingId(contactId);
    setError("");
    setContacts((rows) => rows.map((contact) => contact.id === contactId ? { ...contact, pipeline_status: stage } : contact));
    try {
      const response = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId, pipeline_status: stage }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || body?.error || "Kunne ikke flytte kunden.");
      if (body?.contact) {
        setContacts((rows) => rows.map((contact) => contact.id === contactId ? { ...contact, ...body.contact } : contact));
      }
    } catch (moveError) {
      setContacts((rows) => rows.map((contact) => contact.id === contactId ? { ...contact, pipeline_status: previousStatus } : contact));
      setError(moveError instanceof Error ? moveError.message : "Kunne ikke flytte kunden.");
    } finally {
      setSavingId(null);
      setDraggedId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1900px] space-y-5">
      <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-300"><LayoutDashboard size={17} /> Salgspipeline</div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Kanban</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Én enkel pipeline-visning. Flytt kunden mellom steg her; åpne Customer 360 for detaljer, historikk, Buyer Intelligence og videre arbeid.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button asChild variant="outline"><Link href="/customers"><Users size={16} className="mr-2" />CRM & leads</Link></Button>
            <Button asChild variant="outline"><Link href="/customers?action=1"><Sparkles size={16} className="mr-2" />Trenger handling</Link></Button>
            <Button onClick={load} disabled={loading} className="col-span-2 sm:col-span-1">{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
          </div>
        </div>
      </header>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} className="mt-0.5 shrink-0" />{error}</div>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Users className="text-cyan-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Aktiv pipeline</p><strong className="mt-1 block text-2xl text-white">{metrics.active}</strong></article>
        <article className="rounded-xl border border-red-500/20 bg-slate-900/60 p-4"><Sparkles className="text-red-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Trenger handling</p><strong className="mt-1 block text-2xl text-white">{metrics.needsAction}</strong></article>
        <article className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4"><CalendarClock className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Forfalt</p><strong className="mt-1 block text-2xl text-white">{metrics.overdue}</strong></article>
        <article className="rounded-xl border border-cyan-500/20 bg-slate-900/60 p-4"><Search className="text-cyan-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Matching</p><strong className="mt-1 block text-2xl text-white">{metrics.matching}</strong></article>
        <article className="rounded-xl border border-emerald-500/20 bg-slate-900/60 p-4"><CircleDollarSign className="text-emerald-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Reservert</p><strong className="mt-1 block text-2xl text-white">{metrics.reserved}</strong></article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><CircleDollarSign className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Pipeline-verdi</p><strong className="mt-1 block text-2xl text-white">{money(metrics.value)}</strong></article>
      </section>

      <section className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4">
        <div className="relative max-w-xl"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk navn, område, e-post, brand eller kilde" className="pl-10" /></div>
      </section>

      {loading && contacts.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Henter pipeline …</div>
      ) : (
        <section className="-mx-2 overflow-x-auto px-2 pb-4 [scrollbar-width:thin]">
          <div className="flex min-w-max gap-3">
            {ACTIVE_STAGES.map((stage) => {
              const rows = byStage.get(stage) || [];
              return (
                <div
                  key={stage}
                  className="w-[285px] shrink-0 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => draggedId && void moveContact(draggedId, stage)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STAGE_ACCENTS[stage]}`}>{CUSTOMER_PIPELINE_STATUS_LABELS[stage]}</span>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">{rows.length}</span>
                  </div>

                  <div className="space-y-3">
                    {rows.length === 0 && <div className="rounded-lg border border-dashed border-slate-700 p-5 text-center text-xs text-slate-600">Dra en kunde hit</div>}
                    {rows.map((contact) => {
                      const action = buildCustomerListAction(contact);
                      const followup = dateInfo(contact.next_followup);
                      const brandId = String(contact.brand_id || contact.brand || "zeneco");
                      return (
                        <article
                          key={contact.id}
                          draggable={savingId !== contact.id}
                          onDragStart={() => setDraggedId(contact.id)}
                          onDragEnd={() => setDraggedId(null)}
                          className={`rounded-lg border bg-slate-900 p-3 shadow-sm transition ${draggedId === contact.id ? "border-cyan-400/60 opacity-60" : "border-slate-700 hover:border-cyan-500/40"}`}
                        >
                          <div className="flex items-start gap-2">
                            <GripVertical size={16} className="mt-1 shrink-0 cursor-grab text-slate-600" />
                            <div className="min-w-0 flex-1">
                              <h2 className="truncate text-sm font-semibold text-white">{contact.name || contact.email || "Ukjent kontakt"}</h2>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">{BRAND_LABELS[brandId] || brandId}</p>
                            </div>
                            {savingId === contact.id && <Loader2 size={14} className="animate-spin text-cyan-300" />}
                          </div>

                          <p className="mt-3 line-clamp-2 min-h-9 text-xs text-slate-400">{contact.property_interest || contact.preferred_location || "Ingen boliginteresse registrert"}</p>

                          <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 p-2">
                            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-500"><span>Neste fokus</span><span>{action.score}/100</span></div>
                            <p className="mt-1 text-xs font-medium text-slate-200">{action.label}</p>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-1 text-slate-300">{money(contact.pipeline_value)}</span>
                            <span className={`rounded-full border px-2 py-1 ${followup.overdue ? "border-red-500/30 bg-red-500/10 text-red-200" : followup.future ? "border-cyan-500/20 bg-cyan-500/5 text-cyan-200" : "border-slate-700 bg-slate-800/60 text-slate-400"}`}>
                              {followup.overdue ? "Forfalt " : followup.future ? "Planlagt " : ""}{followup.label}
                            </span>
                          </div>

                          <Link href={`/customers?contactId=${encodeURIComponent(contact.id)}&tab=all`} className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs font-medium text-cyan-300 hover:text-cyan-200">
                            Åpne Customer 360 <ExternalLink size={13} />
                          </Link>
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-slate-500">Gjennomførte og tapte saker håndteres i <Link href="/customers?tab=customers" className="text-cyan-300 hover:underline">CRM & leads → Avsluttet</Link>. Kanban endrer kun pipeline-status; all kundehistorikk og videre arbeid ligger i Customer 360.</p>
    </div>
  );
}
