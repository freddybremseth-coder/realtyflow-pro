"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CircleDollarSign, Loader2, RefreshCw, Search, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Contact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  property_interest?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  next_followup?: string | null;
  updated_at?: string | null;
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

export default function CustomersPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/contacts?view=pipeline", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || body?.error || "Kunne ikke hente kunder.");
      setContacts(body?.contacts || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente kunder.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeStages = new Set(["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"]);
    return contacts
      .filter((contact) => {
        const status = String(contact.pipeline_status || "NEW").toUpperCase();
        if (stage === "ACTIVE" && !activeStages.has(status)) return false;
        if (stage !== "ALL" && stage !== "ACTIVE" && status !== stage) return false;
        if (!query) return true;
        return [contact.name, contact.email, contact.phone, contact.property_interest, contact.brand_id, contact.brand]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const stageWeight: Record<string, number> = { NEGOTIATION: 6, VIEWING: 5, QUALIFIED: 4, CONTACT: 3, NEW: 2, ON_HOLD: 1, WON: 0, LOST: -1 };
        const statusA = String(a.pipeline_status || "NEW").toUpperCase();
        const statusB = String(b.pipeline_status || "NEW").toUpperCase();
        return (stageWeight[statusB] || 0) - (stageWeight[statusA] || 0) || Number(b.pipeline_value || 0) - Number(a.pipeline_value || 0);
      });
  }, [contacts, search, stage]);

  const activeCount = contacts.filter((contact) => ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"].includes(String(contact.pipeline_status || "NEW").toUpperCase())).length;
  const closingCount = contacts.filter((contact) => ["VIEWING", "NEGOTIATION"].includes(String(contact.pipeline_status || "").toUpperCase())).length;
  const pipelineValue = contacts.filter((contact) => ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION"].includes(String(contact.pipeline_status || "").toUpperCase())).reduce((sum, contact) => sum + Number(contact.pipeline_value || 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Users size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">Kunder</h1>
          <p className="mt-2 text-sm text-slate-400">Én inngang til Customer 360, CRM, kjøperprofil, aktiviteter og closing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/today">I dag</Link></Button>
          <Button asChild variant="outline"><Link href="/closing"><Target size={16} className="mr-2" />Closing</Link></Button>
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Users className="text-blue-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Aktive kunder</p><strong className="mt-1 block text-2xl text-white">{activeCount}</strong></article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Target className="text-emerald-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Mot closing</p><strong className="mt-1 block text-2xl text-white">{closingCount}</strong></article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><CircleDollarSign className="text-amber-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Aktiv pipeline</p><strong className="mt-1 block text-2xl text-white">{money(pipelineValue)}</strong></article>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søk navn, e-post, telefon, bolig eller brand" className="pl-10" /></div>
        <div className="flex flex-wrap gap-2">
          {[{ id: "ACTIVE", label: "Aktive" }, { id: "QUALIFIED", label: "Kvalifisert" }, { id: "VIEWING", label: "Visning" }, { id: "NEGOTIATION", label: "Forhandling" }, { id: "WON", label: "Kunder" }, { id: "ALL", label: "Alle" }].map((item) => <button key={item.id} onClick={() => setStage(item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${stage === item.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}
        </div>
      </section>

      {loading && contacts.length === 0 ? <div className="flex min-h-48 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Henter kunder …</div> : visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen kunder i dette filteret.</div> : <section className="grid gap-3 lg:grid-cols-2">{visible.map((contact) => {
        const status = String(contact.pipeline_status || "NEW").toUpperCase();
        const brandId = String(contact.brand_id || contact.brand || "zeneco");
        return <Link key={contact.id} href={`/customers/${encodeURIComponent(contact.id)}`} className="group rounded-xl border border-slate-700/70 bg-slate-900/60 p-5 transition hover:border-emerald-500/40 hover:bg-slate-900">
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{STAGE_LABELS[status] || status}</span><span className="text-xs text-slate-500">{BRAND_LABELS[brandId] || brandId}</span></div><h2 className="mt-3 truncate text-lg font-semibold text-white">{contact.name || contact.email || "Ukjent kunde"}</h2><p className="mt-1 truncate text-sm text-slate-400">{contact.property_interest || contact.email || "Ingen boliginteresse registrert"}</p></div><ArrowRight className="shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-300" /></div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span>{money(contact.pipeline_value)}</span><span>Oppfølging: {dateLabel(contact.next_followup)}</span></div>
        </Link>;
      })}</section>}
    </div>
  );
}
