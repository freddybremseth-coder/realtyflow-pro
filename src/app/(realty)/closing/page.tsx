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
  FileCheck2,
  Flame,
  Handshake,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Scale,
  ShieldAlert,
  Sparkles,
  Target,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CLOSING_STAGES,
  CLOSING_STAGE_LABELS,
  type ClosingRiskLevel,
  type ClosingStage,
} from "@/lib/closing/deal";

interface ClosingContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  brand_id: string | null;
  brand: string | null;
  pipeline_status: string | null;
  pipeline_value: number | null;
  property_interest: string | null;
  next_followup: string | null;
}

interface ClosingDeal {
  id: string;
  contact_id: string;
  brand_id: string;
  title: string;
  stage: ClosingStage;
  status: "ACTIVE" | "ON_HOLD" | "WON" | "LOST";
  property_refs: string[];
  preferred_property_ref: string | null;
  decision_makers: string[];
  objections: string[];
  next_customer_decision: string | null;
  next_action: string | null;
  next_action_due_at: string | null;
  expected_closing_date: string | null;
  probability: number;
  financing_status: string;
  legal_status: string;
  reservation_status: string;
  estimated_purchase_price: number | null;
  expected_commission: number | null;
  notes: string | null;
  calculated_risk_level: ClosingRiskLevel;
  calculated_risk_score: number;
  calculated_risk_reasons: string[];
  is_overdue: boolean;
  is_missing_next_action: boolean;
  recommended_action: string;
  contact: ClosingContact | null;
  updated_at: string;
}

interface ClosingResponse {
  deals: ClosingDeal[];
  candidates: ClosingContact[];
  summary: {
    activeDeals: number;
    atRisk: number;
    viewing: number;
    offerOrLater: number;
    expectedPipelineValue: number;
    expectedCommission: number;
  };
  tableNotReady?: boolean;
  migration?: string;
  warning?: string;
  error?: string;
}

type Filter = "all" | "risk" | "viewing" | "offer" | "on_hold" | "won";

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

const FINANCING_OPTIONS = [
  ["UNKNOWN", "Ikke avklart"],
  ["NOT_NEEDED", "Ikke nødvendig"],
  ["PENDING", "Under avklaring"],
  ["PRE_APPROVED", "Forhåndsgodkjent"],
  ["APPROVED", "Godkjent"],
  ["BLOCKED", "Blokkert"],
] as const;

const LEGAL_OPTIONS = [
  ["NOT_STARTED", "Ikke startet"],
  ["LAWYER_ASSIGNED", "Advokat valgt"],
  ["IN_PROGRESS", "Under kontroll"],
  ["CLEARED", "Godkjent"],
  ["ISSUE", "Problem oppdaget"],
  ["BLOCKED", "Blokkert"],
] as const;

const RESERVATION_OPTIONS = [
  ["NOT_STARTED", "Ikke startet"],
  ["TERMS_DISCUSSING", "Vilkår diskuteres"],
  ["OFFER_SENT", "Bud sendt"],
  ["ACCEPTED", "Akseptert"],
  ["PAYMENT_PENDING", "Venter betaling"],
  ["PAID", "Reservasjon betalt"],
  ["EXPIRED", "Utløpt"],
] as const;

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: Number(value || 0) >= 1_000_000 ? "compact" : "standard",
  }).format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Ikke satt";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function riskClasses(level: ClosingRiskLevel) {
  if (level === "CRITICAL") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (level === "HIGH") return "border-orange-500/40 bg-orange-500/10 text-orange-200";
  if (level === "MEDIUM") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function filterDeal(deal: ClosingDeal, filter: Filter) {
  if (filter === "all") return deal.status !== "LOST";
  if (filter === "risk") return ["HIGH", "CRITICAL"].includes(deal.calculated_risk_level);
  if (filter === "viewing") return ["VIEWING_PLANNED", "VIEWING_COMPLETED", "PREFERRED_PROPERTY"].includes(deal.stage);
  if (filter === "offer") return ["OFFER_RESERVATION", "LEGAL_DUE_DILIGENCE", "CONTRACT_SIGNED"].includes(deal.stage);
  if (filter === "on_hold") return deal.status === "ON_HOLD";
  if (filter === "won") return deal.status === "WON";
  return true;
}

function splitLines(value: string) {
  return value.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
}

interface DealDraft {
  title: string;
  stage: ClosingStage;
  status: ClosingDeal["status"];
  propertyRefs: string;
  preferredPropertyRef: string;
  decisionMakers: string;
  objections: string;
  nextCustomerDecision: string;
  nextAction: string;
  nextActionDueAt: string;
  expectedClosingDate: string;
  probability: string;
  financingStatus: string;
  legalStatus: string;
  reservationStatus: string;
  estimatedPurchasePrice: string;
  expectedCommission: string;
  notes: string;
}

function draftFromDeal(deal: ClosingDeal): DealDraft {
  return {
    title: deal.title || "",
    stage: deal.stage,
    status: deal.status,
    propertyRefs: Array.isArray(deal.property_refs) ? deal.property_refs.join("\n") : "",
    preferredPropertyRef: deal.preferred_property_ref || "",
    decisionMakers: Array.isArray(deal.decision_makers) ? deal.decision_makers.join("\n") : "",
    objections: Array.isArray(deal.objections) ? deal.objections.join("\n") : "",
    nextCustomerDecision: deal.next_customer_decision || "",
    nextAction: deal.next_action || "",
    nextActionDueAt: toDateTimeLocal(deal.next_action_due_at),
    expectedClosingDate: toDateInput(deal.expected_closing_date),
    probability: String(deal.probability ?? 0),
    financingStatus: deal.financing_status || "UNKNOWN",
    legalStatus: deal.legal_status || "NOT_STARTED",
    reservationStatus: deal.reservation_status || "NOT_STARTED",
    estimatedPurchasePrice: deal.estimated_purchase_price ? String(deal.estimated_purchase_price) : "",
    expectedCommission: deal.expected_commission ? String(deal.expected_commission) : "",
    notes: deal.notes || "",
  };
}

export default function ClosingWorkspacePage() {
  const [data, setData] = useState<ClosingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedDeal, setSelectedDeal] = useState<ClosingDeal | null>(null);
  const [draft, setDraft] = useState<DealDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newContactId, setNewContactId] = useState("");
  const [newTitle, setNewTitle] = useState("");

  async function loadDeals() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/closing/deals", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as ClosingResponse | null;
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente closing-saker.");
      setData(body);
      if (selectedDeal) {
        const refreshed = body?.deals.find((item) => item.id === selectedDeal.id) || null;
        setSelectedDeal(refreshed);
        setDraft(refreshed ? draftFromDeal(refreshed) : null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente closing-saker.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDeals();
  }, []);

  const visibleDeals = useMemo(
    () => (data?.deals || []).filter((deal) => filterDeal(deal, filter)),
    [data?.deals, filter],
  );

  function openDeal(deal: ClosingDeal) {
    setSelectedDeal(deal);
    setDraft(draftFromDeal(deal));
    setFeedback("");
  }

  async function createDeal() {
    if (!newContactId) return;
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/closing/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: newContactId, title: newTitle || undefined }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke opprette closing-saken.");
      setShowCreate(false);
      setNewContactId("");
      setNewTitle("");
      setFeedback("Closing-saken er opprettet med anbefalt neste handling.");
      await loadDeals();
    } catch (createError) {
      setFeedback(createError instanceof Error ? createError.message : "Kunne ikke opprette closing-saken.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDeal() {
    if (!selectedDeal || !draft) return;
    setSaving(true);
    setFeedback("");
    try {
      const payload = {
        id: selectedDeal.id,
        title: draft.title,
        stage: draft.stage,
        status: draft.status,
        property_refs: splitLines(draft.propertyRefs),
        preferred_property_ref: draft.preferredPropertyRef || null,
        decision_makers: splitLines(draft.decisionMakers),
        objections: splitLines(draft.objections),
        next_customer_decision: draft.nextCustomerDecision || null,
        next_action: draft.nextAction || null,
        next_action_due_at: draft.nextActionDueAt ? new Date(draft.nextActionDueAt).toISOString() : null,
        expected_closing_date: draft.expectedClosingDate || null,
        probability: Number(draft.probability || 0),
        financing_status: draft.financingStatus,
        legal_status: draft.legalStatus,
        reservation_status: draft.reservationStatus,
        estimated_purchase_price: draft.estimatedPurchasePrice ? Number(draft.estimatedPurchasePrice) : null,
        expected_commission: draft.expectedCommission ? Number(draft.expectedCommission) : null,
        notes: draft.notes || null,
        sync_contact_status: true,
        confirm_won: draft.status === "WON",
      };
      const response = await fetch("/api/closing/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lagre closing-saken.");
      setFeedback("Closing-saken og CRM-oppfølgingen er oppdatert.");
      await loadDeals();
    } catch (saveError) {
      setFeedback(saveError instanceof Error ? saveError.message : "Kunne ikke lagre closing-saken.");
    } finally {
      setSaving(false);
    }
  }

  function useRecommendedAction() {
    if (!selectedDeal || !draft) return;
    setDraft({ ...draft, nextAction: selectedDeal.recommended_action });
  }

  const summaryCards = data
    ? [
        { label: "Aktive saker", value: data.summary.activeDeals, icon: Handshake, tone: "text-blue-300" },
        { label: "Høy risiko", value: data.summary.atRisk, icon: ShieldAlert, tone: "text-red-300" },
        { label: "Visningsfase", value: data.summary.viewing, icon: Building2, tone: "text-cyan-300" },
        { label: "Bud / kontrakt", value: data.summary.offerOrLater, icon: FileCheck2, tone: "text-emerald-300" },
        { label: "Kjøpsverdi", value: formatCurrency(data.summary.expectedPipelineValue), icon: CircleDollarSign, tone: "text-amber-300" },
        { label: "Forventet kommisjon", value: formatCurrency(data.summary.expectedCommission), icon: Target, tone: "text-purple-300" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
            <Handshake size={18} /> Freddy Revenue OS
          </div>
          <h1 className="text-3xl font-bold text-white">Closing Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Bevar fremdriften fra rådgivningsmøte til reservasjon, juridisk kontroll, kontrakt og gjennomført handel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/today"><Target size={16} className="mr-2" />I dag</Link></Button>
          <Button asChild variant="outline"><Link href="/pipeline"><Users size={16} className="mr-2" />CRM</Link></Button>
          <Button variant="outline" onClick={loadDeals} disabled={loading}>
            {loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater
          </Button>
          <Button onClick={() => setShowCreate(true)} disabled={Boolean(data?.tableNotReady)}><Plus size={16} className="mr-2" />Ny closing-sak</Button>
        </div>
      </header>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
      {feedback && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200"><CheckCircle2 size={17} />{feedback}</div>}
      {data?.tableNotReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div><strong>Databasetabellen må aktiveres.</strong><p className="mt-1 text-amber-200/80">Kjør migrasjonen <code>{data.migration}</code>. Ingen closing-data kan lagres før dette er gjort.</p></div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return <article key={card.label} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className={card.tone} /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{card.label}</p><strong className="mt-1 block text-2xl text-white">{card.value}</strong></article>;
        })}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="text-xl font-semibold text-white">Aktive kjøpsprosesser</h2><p className="text-sm text-slate-400">Risiko beregnes fra frister, innsigelser, beslutningstakere og closing-status.</p></div>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "Alle"], ["risk", "Høy risiko"], ["viewing", "Visning"], ["offer", "Bud / kontrakt"], ["on_hold", "På vent"], ["won", "Vunnet"],
            ] as Array<[Filter, string]>).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${filter === id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white"}`}>{label}</button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 className="mr-2 animate-spin" size={20} />Henter closing-saker …</div>
        ) : visibleDeals.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen closing-saker i dette filteret.</div>
        ) : (
          <div className="space-y-3">
            {visibleDeals.map((deal) => (
              <article key={deal.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClasses(deal.calculated_risk_level)}`}>{deal.calculated_risk_level} · {deal.calculated_risk_score}</span>
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">{CLOSING_STAGE_LABELS[deal.stage]}</span>
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-400">{BRAND_LABELS[deal.brand_id] || deal.brand_id}</span>
                      {deal.is_overdue && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-200">Forsinket</span>}
                    </div>
                    <h3 className="mt-3 truncate text-lg font-semibold text-white">{deal.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{deal.contact?.name || deal.contact?.email || "Kontakt mangler"}{deal.contact?.property_interest ? ` · ${deal.contact.property_interest}` : ""}</p>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                      <div><span className="block text-xs text-slate-500">Sannsynlighet</span><strong className="text-white">{deal.probability}%</strong></div>
                      <div><span className="block text-xs text-slate-500">Neste frist</span><strong className={deal.is_overdue ? "text-red-300" : "text-white"}>{formatDate(deal.next_action_due_at)}</strong></div>
                      <div><span className="block text-xs text-slate-500">Forventet closing</span><strong className="text-white">{formatDate(deal.expected_closing_date)}</strong></div>
                      <div><span className="block text-xs text-slate-500">Kjøpsverdi</span><strong className="text-white">{formatCurrency(deal.estimated_purchase_price || deal.contact?.pipeline_value)}</strong></div>
                    </div>
                    <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Anbefalt handling</p>
                      <p className="mt-1 text-sm text-slate-200">{deal.recommended_action}</p>
                    </div>
                    {deal.calculated_risk_reasons?.length > 0 && (
                      <p className="mt-3 text-xs text-slate-500">Risiko: {deal.calculated_risk_reasons.join(" · ")}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col">
                    <Button onClick={() => openDeal(deal)}><ArrowRight size={16} className="mr-2" />Åpne closing</Button>
                    <Button asChild variant="outline"><Link href={`/pipeline?contactId=${encodeURIComponent(deal.contact_id)}`}><Users size={16} className="mr-2" />CRM</Link></Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-white">Ny closing-sak</h2><p className="text-sm text-slate-400">Velg en aktiv CRM-kontakt uten eksisterende sak.</p></div><Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}><X size={18} /></Button></div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm text-slate-300">Kunde<select value={newContactId} onChange={(event) => setNewContactId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"><option value="">Velg kontakt</option>{(data?.candidates || []).map((contact) => <option key={contact.id} value={contact.id}>{contact.name || contact.email} · {contact.pipeline_status} · {formatCurrency(contact.pipeline_value)}</option>)}</select></label>
              <label className="block text-sm text-slate-300">Navn på saken<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="F.eks. Gerald – villa i Altea" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
              <Button className="w-full" onClick={createDeal} disabled={!newContactId || saving}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Plus size={16} className="mr-2" />}Opprett closing-sak</Button>
            </div>
          </div>
        </div>
      )}

      {selectedDeal && draft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 sm:p-6" onClick={() => setSelectedDeal(null)}>
          <div className="mx-auto max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700 bg-slate-900/95 p-5 backdrop-blur">
              <div><div className="flex items-center gap-2 text-xs text-emerald-300"><Handshake size={15} />Closing Workspace</div><h2 className="mt-1 text-xl font-semibold text-white">{selectedDeal.contact?.name || selectedDeal.title}</h2></div>
              <div className="flex gap-2"><Button onClick={saveDeal} disabled={saving}>{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}Lagre</Button><Button variant="ghost" size="icon" onClick={() => setSelectedDeal(null)}><X size={19} /></Button></div>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-white"><Target size={17} className="text-emerald-300" />Fremdrift og verdi</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm text-slate-300 sm:col-span-2">Saksnavn<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                    <label className="text-sm text-slate-300">Fase<select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value as ClosingStage })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white">{CLOSING_STAGES.map((stage) => <option key={stage} value={stage}>{CLOSING_STAGE_LABELS[stage]}</option>)}</select></label>
                    <label className="text-sm text-slate-300">Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ClosingDeal["status"] })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white"><option value="ACTIVE">Aktiv</option><option value="ON_HOLD">På vent</option><option value="WON">Vunnet</option><option value="LOST">Tapt</option></select></label>
                    <label className="text-sm text-slate-300">Sannsynlighet: {draft.probability}%<input type="range" min="0" max="100" step="5" value={draft.probability} onChange={(event) => setDraft({ ...draft, probability: event.target.value })} className="mt-2 w-full" /></label>
                    <label className="text-sm text-slate-300">Forventet closing<input type="date" value={draft.expectedClosingDate} onChange={(event) => setDraft({ ...draft, expectedClosingDate: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                    <label className="text-sm text-slate-300">Forventet kjøpspris (€)<input type="number" min="0" value={draft.estimatedPurchasePrice} onChange={(event) => setDraft({ ...draft, estimatedPurchasePrice: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                    <label className="text-sm text-slate-300">Forventet kommisjon (€)<input type="number" min="0" value={draft.expectedCommission} onChange={(event) => setDraft({ ...draft, expectedCommission: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-white"><Building2 size={17} className="text-cyan-300" />Boliger og kundens beslutning</h3>
                  <div className="mt-4 space-y-4">
                    <label className="block text-sm text-slate-300">Boligreferanser i aktiv vurdering<textarea rows={3} value={draft.propertyRefs} onChange={(event) => setDraft({ ...draft, propertyRefs: event.target.value })} placeholder="Én referanse per linje" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                    <label className="block text-sm text-slate-300">Foretrukket bolig<input value={draft.preferredPropertyRef} onChange={(event) => setDraft({ ...draft, preferredPropertyRef: event.target.value })} placeholder="Eiendomsreferanse eller prosjektnavn" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                    <label className="block text-sm text-slate-300">Neste beslutning kunden må ta<textarea rows={3} value={draft.nextCustomerDecision} onChange={(event) => setDraft({ ...draft, nextCustomerDecision: event.target.value })} placeholder="F.eks. velge mellom to områder eller godkjenne reservasjonsvilkår" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-white"><CalendarClock size={17} className="text-amber-300" />Neste handling</h3>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3"><p className="text-xs uppercase tracking-wide text-emerald-300">Systemets forslag</p><p className="mt-1 text-sm text-emerald-100">{selectedDeal.recommended_action}</p><Button size="sm" variant="outline" className="mt-3" onClick={useRecommendedAction}><Sparkles size={14} className="mr-2" />Bruk forslaget</Button></div>
                    <label className="block text-sm text-slate-300">Neste konkrete handling<textarea rows={3} value={draft.nextAction} onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                    <label className="block text-sm text-slate-300">Frist<input type="datetime-local" value={draft.nextActionDueAt} onChange={(event) => setDraft({ ...draft, nextActionDueAt: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" /></label>
                  </div>
                </section>
              </div>

              <div className="space-y-5">
                <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-white"><UserRoundCheck size={17} className="text-blue-300" />Beslutningstakere</h3>
                  <textarea rows={5} value={draft.decisionMakers} onChange={(event) => setDraft({ ...draft, decisionMakers: event.target.value })} placeholder="Én person per linje" className="mt-4 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" />
                </section>

                <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-white"><ShieldAlert size={17} className="text-red-300" />Åpne innsigelser</h3>
                  <textarea rows={6} value={draft.objections} onChange={(event) => setDraft({ ...draft, objections: event.target.value })} placeholder="F.eks. pris, område, finansiering eller uenighet i familien" className="mt-4 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" />
                  <p className="mt-2 text-xs text-slate-500">Fjern en linje når innsigelsen er løst.</p>
                </section>

                <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-white"><Scale size={17} className="text-purple-300" />Finansiering og juridisk</h3>
                  <div className="mt-4 space-y-4">
                    <label className="block text-sm text-slate-300">Finansiering<select value={draft.financingStatus} onChange={(event) => setDraft({ ...draft, financingStatus: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white">{FINANCING_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="block text-sm text-slate-300">Juridisk kontroll<select value={draft.legalStatus} onChange={(event) => setDraft({ ...draft, legalStatus: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white">{LEGAL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="block text-sm text-slate-300">Bud / reservasjon<select value={draft.reservationStatus} onChange={(event) => setDraft({ ...draft, reservationStatus: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white">{RESERVATION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-white"><FileCheck2 size={17} className="text-slate-300" />Interne notater</h3>
                  <textarea rows={8} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Interne closing-notater. Ikke sendes til kunden." className="mt-4 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white" />
                </section>

                <div className={`rounded-xl border p-4 ${riskClasses(selectedDeal.calculated_risk_level)}`}>
                  <div className="flex items-center gap-2"><Flame size={18} /><strong>Closing-risiko: {selectedDeal.calculated_risk_level} ({selectedDeal.calculated_risk_score}/100)</strong></div>
                  <ul className="mt-3 space-y-1 text-sm">{selectedDeal.calculated_risk_reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
