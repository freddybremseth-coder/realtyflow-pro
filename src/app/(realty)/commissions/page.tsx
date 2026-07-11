"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileWarning,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CaseStatus = "MISSING_TERMS" | "READY_TO_INVOICE" | "INVOICE_PREPARED" | "INVOICED" | "OVERDUE" | "PAID";
type Priority = "HIGH" | "MEDIUM" | "LOW";

interface CommissionCase {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  brandId: string;
  propertyInterest: string | null;
  dealValue: number;
  commissionAmount: number;
  commissionPercent: number | null;
  commissionConfirmed: boolean;
  commissionEstimated: boolean;
  wonAt: string;
  ageDays: number;
  status: CaseStatus;
  priority: Priority;
  score: number;
  invoicePreparedAt: string | null;
  invoiceSentAt: string | null;
  invoiceDueAt: string | null;
  invoiceNumber: string | null;
  paidAt: string | null;
  daysOutstanding: number;
  nextFollowupAt: string | null;
  followupOverdue: boolean;
  issues: string[];
  recommendedAction: string;
  href: string;
}

interface Collection {
  generatedAt: string;
  assumptions: { fallbackCommissionPercent: number; defaultInvoiceDueDays: number; note: string };
  summary: {
    wonDeals: number;
    confirmedCommission: number;
    estimatedUnconfirmedCommission: number;
    readyToInvoiceCommission: number;
    preparedCommission: number;
    invoicedOutstandingCommission: number;
    overdueOutstandingCommission: number;
    paidCommission: number;
    missingTermsCount: number;
    overdueCount: number;
    followupDueCount: number;
    collectionRate: number | null;
  };
  brands: Array<{
    brandId: string;
    wonDeals: number;
    confirmedCommission: number;
    estimatedCommission: number;
    outstandingCommission: number;
    overdueCommission: number;
    paidCommission: number;
    readyCount: number;
    missingTermsCount: number;
  }>;
  cases: CommissionCase[];
}

interface FormState {
  amount: string;
  percent: string;
  invoiceNumber: string;
  dueDays: string;
}

type Filter = "all" | "missing" | "ready" | "prepared" | "invoiced" | "overdue" | "paid";

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  MISSING_TERMS: "Mangler provisjonsgrunnlag",
  READY_TO_INVOICE: "Klar til fakturering",
  INVOICE_PREPARED: "Faktura klargjort",
  INVOICED: "Fakturert",
  OVERDUE: "Forfalt",
  PAID: "Betalt",
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

function percentage(value: number | null) {
  if (value === null) return "–";
  return `${Math.round(value * 100)} %`;
}

function statusClass(status: CaseStatus) {
  if (status === "OVERDUE") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (status === "PAID") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
  if (status === "MISSING_TERMS") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "INVOICED") return "border-blue-500/35 bg-blue-500/10 text-blue-200";
  return "border-slate-600 bg-slate-800 text-slate-300";
}

function priorityClass(priority: Priority) {
  if (priority === "HIGH") return "text-red-300";
  if (priority === "MEDIUM") return "text-amber-300";
  return "text-slate-400";
}

export default function CommissionCollectionPage() {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [brand, setBrand] = useState("all");
  const [forms, setForms] = useState<Record<string, FormState>>({});

  async function load(nextBrand = brand) {
    setLoading(true);
    setError("");
    try {
      const query = nextBrand === "all" ? "" : `?brand=${encodeURIComponent(nextBrand)}`;
      const response = await fetch(`/api/revenue/commissions${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente provisjonsdata.");
      setCollection(body.collection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente provisjonsdata.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load("all"); }, []);

  const visible = useMemo(() => (collection?.cases || []).filter((item) => {
    if (filter === "missing") return item.status === "MISSING_TERMS";
    if (filter === "ready") return item.status === "READY_TO_INVOICE";
    if (filter === "prepared") return item.status === "INVOICE_PREPARED";
    if (filter === "invoiced") return item.status === "INVOICED";
    if (filter === "overdue") return item.status === "OVERDUE";
    if (filter === "paid") return item.status === "PAID";
    return true;
  }), [collection?.cases, filter]);

  function formFor(item: CommissionCase): FormState {
    return forms[item.id] || {
      amount: item.commissionConfirmed ? String(Math.round(item.commissionAmount)) : "",
      percent: item.commissionPercent ? String(item.commissionPercent) : "",
      invoiceNumber: item.invoiceNumber || "",
      dueDays: String(collection?.assumptions.defaultInvoiceDueDays || 14),
    };
  }

  function updateForm(id: string, patch: Partial<FormState>, item: CommissionCase) {
    setForms((previous) => ({ ...previous, [id]: { ...formFor(item), ...patch } }));
  }

  async function runAction(item: CommissionCase, action: string, extra: Record<string, unknown> = {}) {
    setActionId(item.id);
    setFeedback("");
    setError("");
    try {
      const response = await fetch("/api/revenue/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: item.id, action, ...extra }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Oppdateringen feilet.");
      setFeedback(body?.warning || "Den interne provisjonsstatusen er oppdatert. Ingen kundemelding ble sendt.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oppdateringen feilet.");
    } finally {
      setActionId(null);
    }
  }

  function changeBrand(value: string) {
    setBrand(value);
    void load(value);
  }

  const summaryCards: Array<{ label: string; value: string; icon: LucideIcon }> = collection ? [
    { label: "Bekreftet provisjon", value: money(collection.summary.confirmedCommission), icon: CircleDollarSign },
    { label: "Klar til fakturering", value: money(collection.summary.readyToInvoiceCommission + collection.summary.preparedCommission), icon: ReceiptText },
    { label: "Utestående", value: money(collection.summary.invoicedOutstandingCommission), icon: Clock3 },
    { label: "Forfalt", value: money(collection.summary.overdueOutstandingCommission), icon: ShieldAlert },
    { label: "Betalt", value: money(collection.summary.paidCommission), icon: CheckCircle2 },
    { label: "Inndrivelsesgrad", value: percentage(collection.summary.collectionRate), icon: Banknote },
  ] : [];

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Alle" },
    { id: "missing", label: "Mangler grunnlag" },
    { id: "ready", label: "Klar" },
    { id: "prepared", label: "Klargjort" },
    { id: "invoiced", label: "Fakturert" },
    { id: "overdue", label: "Forfalt" },
    { id: "paid", label: "Betalt" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/70 p-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-300"><Banknote size={17} /> Freddy Revenue OS</div>
          <h1 className="text-3xl font-bold text-white">Commission & Cash Collection</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Fra vunnet salg til dokumentert betaling, med tydelig skille mellom bekreftet provisjon og interne estimater.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={brand} onChange={(event) => changeBrand(event.target.value)} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200">
            <option value="all">Alle brands</option>
            <option value="zeneco">Zen Eco Homes</option>
            <option value="soleada">Soleada.no</option>
            <option value="pinosoecolife">Pinoso EcoLife</option>
          </select>
          <Button asChild variant="outline"><Link href="/forecast">Forecast</Link></Button>
          <Button asChild variant="outline"><Link href="/after-sales">After-sales</Link></Button>
          <Button onClick={() => load()} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
      {feedback && <div className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle2 size={18} />{feedback}</div>}

      {collection && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return <article key={card.label} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"><Icon size={20} className="text-emerald-300" /><p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{card.label}</p><strong className="mt-1 block text-xl text-white">{card.value}</strong></article>;
          })}
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-xs uppercase tracking-wide text-amber-300">Mangler provisjonsgrunnlag</p><strong className="mt-1 block text-2xl text-white">{collection.summary.missingTermsCount}</strong><p className="mt-1 text-xs text-slate-500">Internt 3 %-estimat: {money(collection.summary.estimatedUnconfirmedCommission)}</p></div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4"><p className="text-xs uppercase tracking-wide text-red-300">Forfalte saker</p><strong className="mt-1 block text-2xl text-white">{collection.summary.overdueCount}</strong><p className="mt-1 text-xs text-slate-500">Forsinket intern oppfølging: {collection.summary.followupDueCount}</p></div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Beregningsregel</p><p className="mt-2 text-sm text-slate-300">{collection.assumptions.note}</p></div>
        </div>
      </>}

      <div className="flex flex-wrap gap-2">{filters.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${filter === item.id ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}</div>

      {loading && !collection ? <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/50 text-slate-400"><Loader2 size={20} className="mr-2 animate-spin" />Analyserer provisjoner …</div> : visible.length === 0 ? <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">Ingen provisjonssaker i dette filteret.</div> : <section className="space-y-4">
        {visible.map((item) => {
          const form = formFor(item);
          const busy = actionId === item.id;
          return <article key={item.id} className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(item.status)}`}>{STATUS_LABELS[item.status]}</span><span className={`text-xs font-medium ${priorityClass(item.priority)}`}>{item.priority} PRIORITET · {item.score}/100</span><span className="text-xs text-slate-500">{BRAND_LABELS[item.brandId] || item.brandId}</span></div>
                <h2 className="mt-3 text-xl font-semibold text-white">{item.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{item.propertyInterest || "Bolig ikke registrert"} · salgsverdi {money(item.dealValue)}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs text-slate-500">Provisjon</p><p className="font-semibold text-white">{money(item.commissionAmount)}</p><p className="text-[11px] text-slate-500">{item.commissionEstimated ? "3 % internt estimat" : item.commissionPercent ? `${item.commissionPercent} % registrert` : "Beløp registrert"}</p></div>
                  <div><p className="text-xs text-slate-500">Vunnet</p><p className="font-semibold text-slate-200">{dateLabel(item.wonAt)}</p><p className="text-[11px] text-slate-500">{item.ageDays} dager siden</p></div>
                  <div><p className="text-xs text-slate-500">Faktura / frist</p><p className="font-semibold text-slate-200">{item.invoiceNumber || "Ikke registrert"}</p><p className="text-[11px] text-slate-500">{dateLabel(item.invoiceDueAt)}</p></div>
                  <div><p className="text-xs text-slate-500">Neste oppfølging</p><p className={item.followupOverdue ? "font-semibold text-red-300" : "font-semibold text-slate-200"}>{dateLabel(item.nextFollowupAt)}</p><p className="text-[11px] text-slate-500">Utestående {item.daysOutstanding} dager</p></div>
                </div>
                <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="text-xs uppercase tracking-wide text-emerald-300">Anbefalt neste steg</p><p className="mt-1 text-sm text-slate-200">{item.recommendedAction}</p></div>
                {item.issues.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.issues.map((issue) => <span key={issue} className="rounded-full border border-red-500/20 bg-red-500/5 px-2.5 py-1 text-xs text-red-200">{issue}</span>)}</div>}
              </div>

              <div className="w-full space-y-3 xl:w-[420px]">
                {item.status === "MISSING_TERMS" && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-amber-300">Registrer faktisk provisjon</p>
                  <div className="grid grid-cols-2 gap-2"><Input value={form.amount} onChange={(event) => updateForm(item.id, { amount: event.target.value }, item)} placeholder="Beløp EUR" /><Input value={form.percent} onChange={(event) => updateForm(item.id, { percent: event.target.value }, item)} placeholder="Prosent" /></div>
                  <Button className="mt-2 w-full" size="sm" disabled={busy} onClick={() => runAction(item, "set_terms", { commissionAmount: form.amount, commissionPercent: form.percent })}>Lagre provisjonsgrunnlag</Button>
                </div>}

                {["READY_TO_INVOICE", "INVOICE_PREPARED"].includes(item.status) && <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Fakturaflyt</p>
                  <div className="grid grid-cols-2 gap-2"><Input value={form.invoiceNumber} onChange={(event) => updateForm(item.id, { invoiceNumber: event.target.value }, item)} placeholder="Fakturanummer" /><Input value={form.dueDays} onChange={(event) => updateForm(item.id, { dueDays: event.target.value }, item)} placeholder="Dager til frist" /></div>
                  <div className="mt-2 flex gap-2">{item.status === "READY_TO_INVOICE" && <Button className="flex-1" size="sm" variant="outline" disabled={busy} onClick={() => runAction(item, "mark_invoice_prepared", { invoiceNumber: form.invoiceNumber })}><FileCheck2 size={14} className="mr-1" />Klargjort</Button>}<Button className="flex-1" size="sm" disabled={busy} onClick={() => runAction(item, "mark_invoice_sent", { invoiceNumber: form.invoiceNumber, dueDays: Number(form.dueDays) })}><ReceiptText size={14} className="mr-1" />Registrer sendt</Button></div>
                </div>}

                {["INVOICED", "OVERDUE"].includes(item.status) && <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-blue-300">Betalingsoppfølging</p>
                  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(item, "log_payment_followup")}><FileWarning size={14} className="mr-1" />Logg oppfølging</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(item, "schedule_followup", { days: 7 })}>+7 dager</Button><Button size="sm" disabled={busy} onClick={() => runAction(item, "mark_paid")}><CheckCircle2 size={14} className="mr-1" />Marker betalt</Button></div>
                </div>}

                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(item, "schedule_followup", { days: 14 })}>Oppfølging +14</Button><Button asChild size="sm" variant="ghost"><Link href={item.href}>Customer 360 <ArrowRight size={14} className="ml-1" /></Link></Button></div>
                <p className="text-[11px] text-slate-600">Alle handlinger er interne. RealtyFlow sender ingen faktura, e-post, WhatsApp eller SMS fra denne siden.</p>
              </div>
            </div>
          </article>;
        })}
      </section>}
    </div>
  );
}
