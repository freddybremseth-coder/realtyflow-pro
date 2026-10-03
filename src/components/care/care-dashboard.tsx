"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileSpreadsheet,
  ExternalLink,
  Gauge,
  Home,
  Image,
  Inbox,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CareCalendarEvent,
  CareCharge,
  CareDashboard as CareDashboardData,
  CareInspection,
  CareInvoice,
  CareLead,
  CareKey,
  CarePhoto,
  CarePlan,
  CareProperty,
  CareReport,
  CareSalesStage,
  CareView,
} from "@/lib/care/dashboard";

const VIEW_TABS: Array<{ id: CareView; label: string; href: string; icon: LucideIcon }> = [
  { id: "overview", label: "Oversikt", href: "/care", icon: Gauge },
  { id: "leads", label: "Leads & tilbud", href: "/care/leads", icon: Inbox },
  { id: "customers", label: "Kunder & eiendommer", href: "/care/customers", icon: Users },
  { id: "visits", label: "Besøk & tilsyn", href: "/care/visits", icon: ClipboardCheck },
  { id: "reports", label: "Rapporter & bilder", href: "/care/reports", icon: Image },
  { id: "invoices", label: "Faktura & tillegg", href: "/care/invoices", icon: FileSpreadsheet },
  { id: "keys", label: "Nøkler & kalender", href: "/care/keys", icon: CalendarCheck2 },
];

function moneyFromCents(value: number, currency = "EUR") {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((value || 0) / 100);
}

function dateLabel(value: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function careStatusOpen(status: string) {
  return !["closed", "completed", "done", "cancelled", "canceled", "paid", "void", "archived"].includes(String(status || "").toLowerCase());
}

function careOperationalDateScore(value: string | null) {
  if (!value) return 25;
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return 25;
  const hours = (at - Date.now()) / 3_600_000;
  if (hours <= 0) return 120;
  if (hours <= 24) return 110;
  if (hours <= 72) return 90;
  if (hours <= 168) return 65;
  return 25;
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (["active", "ok", "sent", "paid", "approved", "completed", "complete", "done"].includes(normalized)) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (["draft", "planned", "open", "issued", "pending", "to_do", "in_progress"].includes(normalized)) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (["overdue", "critical", "blocked"].includes(normalized)) {
    return "border-red-500/35 bg-red-500/10 text-red-200";
  }
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function readinessClass(status: string) {
  if (status === "ok") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-slate-700 bg-slate-900 text-slate-300";
}

function shortId(value: string) {
  return value ? value.slice(0, 8) : "-";
}

const CARE_SERVICE_LABELS: Record<string, string> = {
  keyholding: "Keyholding",
  boligtilsyn: "Boligtilsyn",
  nokkeloppbevaring: "Nøkkeloppbevaring",
  klargjoring: "Klargjøring",
  uvaer: "Tilsyn etter uvær",
};

function careServiceLabel(value: string) {
  return CARE_SERVICE_LABELS[value] || value || "Keyholding";
}

const CARE_SALES_STAGE_LABELS: Record<CareSalesStage, string> = {
  new: "Ny",
  contacted: "Kontaktet",
  quote_sent: "Tilbud sendt",
  waiting_customer: "Venter svar",
  activated: "Aktivert",
  not_relevant: "Ikke aktuell",
};

function careSalesStageLabel(value: CareSalesStage) {
  return CARE_SALES_STAGE_LABELS[value] || value;
}

function careSalesStageClass(value: CareSalesStage) {
  if (value === "activated") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (value === "quote_sent" || value === "waiting_customer") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  if (value === "not_relevant") return "border-slate-700 bg-slate-800 text-slate-400";
  return "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

function sourcePageLabel(value: string | null) {
  if (!value) return "Kildeside ikke registrert";
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "forsiden" : url.pathname;
    return `${url.hostname} · ${path}`;
  } catch {
    return value;
  }
}

function sourcePageHref(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "care.zenecohomes.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

function careLeadOpen(lead: CareLead) {
  return !["DONE", "CANCELLED", "CANCELED", "CLOSED", "COMPLETED"].includes(lead.status.toUpperCase());
}

function careLeadAgeHours(lead: CareLead) {
  if (!lead.createdAt) return 0;
  const created = new Date(lead.createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 3_600_000));
}

function careLeadFollowUpDue(lead: CareLead) {
  if (!lead.followUpOn || !careLeadOpen(lead)) return false;
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return lead.followUpOn <= localToday;
}

function careLeadAttentionScore(lead: CareLead) {
  if (!careLeadOpen(lead)) return -1;
  let score = 0;
  if (careLeadFollowUpDue(lead)) score += 100;
  if (careLeadAgeHours(lead) >= 24) score += 70;
  if (lead.priority.toUpperCase() === "HIGH") score += 50;
  if (lead.salesStage === "new") score += 35;
  if (lead.salesStage === "quote_sent" || lead.salesStage === "waiting_customer") score += 25;
  if (!lead.carePropertyId) score += 10;
  return score;
}

function careLeadNeedsAttention(lead: CareLead) {
  return careLeadAttentionScore(lead) >= 35;
}

function careLeadAttentionLabel(lead: CareLead) {
  if (!careLeadOpen(lead)) return null;
  if (careLeadFollowUpDue(lead)) return "Oppfølging forfalt";
  if (careLeadAgeHours(lead) >= 24) return "Over 24 t";
  if (lead.priority.toUpperCase() === "HIGH") return "Høy prioritet";
  if (lead.salesStage === "new") return "Ny · kontakt nå";
  if (lead.salesStage === "quote_sent" || lead.salesStage === "waiting_customer") return "Tilbud i løp";
  return null;
}

function carePropertyType(value: string | null) {
  const normalized = String(value || "").toLowerCase();
  if (["apartment", "leilighet"].includes(normalized)) return "apartment";
  if (["townhouse", "rekkehus"].includes(normalized)) return "townhouse";
  if (normalized === "villa") return "villa";
  if (normalized === "finca") return "finca";
  return "";
}

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function CareOnboardingDialog({
  lead,
  plans,
  onClose,
  onSaved,
}: {
  lead: CareLead;
  plans: CarePlan[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const activatingAgreement = Boolean(lead.carePropertyId && !lead.careContractId);
  const existingProperty = Boolean(lead.carePropertyId);
  const [propertyType, setPropertyType] = useState(() => carePropertyType(lead.carePropertyType || lead.propertyType));
  const [propertyName, setPropertyName] = useState(lead.carePropertyName || "");
  const [addressLine, setAddressLine] = useState(lead.carePropertyAddress || "");
  const [municipality, setMunicipality] = useState(lead.careMunicipality || lead.preferredArea || "");
  const [postcode, setPostcode] = useState(lead.carePostcode || "");
  const [hasPool, setHasPool] = useState(lead.careHasPool);
  const [hasGarden, setHasGarden] = useState(lead.careHasGarden);
  const [planId, setPlanId] = useState("");
  const [startsOn, setStartsOn] = useState(todayInputValue());
  const [billingDay, setBillingDay] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/care/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workItemId: lead.id,
          contactId: lead.contactId,
          propertyType,
          propertyName,
          addressLine,
          municipality,
          postcode,
          hasPool,
          hasGarden,
          planId: planId || null,
          startsOn,
          billingDay: Number(billingDay || 1),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke opprette Care-kunden.");
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke opprette Care-kunden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">Care onboarding</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{activatingAgreement ? "Aktiver Care-avtale" : "Opprett Care-kunde"} · {lead.contactName}</h2>
            <p className="mt-1 text-sm text-slate-400">{activatingAgreement ? "Care-eiendommen finnes allerede. Velg planen som skal aktiveres; eiendomsdataene beholdes." : "CRM-kontakten beholdes som eier. Her oppretter du Care-eiendommen og velger eventuelt en aktiv avtale."}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Lukk</button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm text-slate-300">
              <span>Boligtype</span>
              <select required disabled={existingProperty} value={propertyType} onChange={(event) => setPropertyType(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-65">
                <option value="">Velg boligtype</option>
                <option value="apartment">Leilighet</option>
                <option value="townhouse">Rekkehus</option>
                <option value="villa">Villa</option>
                <option value="finca">Finca</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm text-slate-300">
              <span>Navn på bolig <span className="text-slate-500">(valgfritt)</span></span>
              <input readOnly={existingProperty} value={propertyName} onChange={(event) => setPropertyName(event.target.value)} maxLength={160} placeholder="f.eks. Casa Altea" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600 read-only:cursor-not-allowed read-only:opacity-65" />
            </label>
            <label className="space-y-1.5 text-sm text-slate-300 sm:col-span-2">
              <span>Adresse</span>
              <input required readOnly={existingProperty} value={addressLine} onChange={(event) => setAddressLine(event.target.value)} maxLength={240} placeholder="Gateadresse / urbanisasjon" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600 read-only:cursor-not-allowed read-only:opacity-65" />
            </label>
            <label className="space-y-1.5 text-sm text-slate-300">
              <span>Kommune / område</span>
              <input required readOnly={existingProperty} value={municipality} onChange={(event) => setMunicipality(event.target.value)} maxLength={120} placeholder="Altea" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600 read-only:cursor-not-allowed read-only:opacity-65" />
            </label>
            <label className="space-y-1.5 text-sm text-slate-300">
              <span>Postnummer <span className="text-slate-500">(valgfritt)</span></span>
              <input readOnly={existingProperty} value={postcode} onChange={(event) => setPostcode(event.target.value)} maxLength={24} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white read-only:cursor-not-allowed read-only:opacity-65" />
            </label>
          </div>

          <div className="flex flex-wrap gap-5 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" disabled={existingProperty} checked={hasPool} onChange={(event) => setHasPool(event.target.checked)} />Basseng</label>
            <label className="flex items-center gap-2"><input type="checkbox" disabled={existingProperty} checked={hasGarden} onChange={(event) => setHasGarden(event.target.checked)} />Hage</label>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="font-semibold text-amber-100">Avtale og MRR</h3>
            <p className="mt-1 text-xs text-amber-100/70">{activatingAgreement ? "Velg Care-planen som skal aktiveres. Når du bekrefter, legges første Care-besøk automatisk i kalenderen på startdatoen (eller neste tilgjengelige dag kl. 10)." : "Plan er valgfri. Lar du feltet stå tomt, opprettes kunden og eiendommen uten aktiv avtale eller fakturering. Velger du plan, legges første Care-besøk automatisk i kalenderen."}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5 text-sm text-slate-300 sm:col-span-3">
                <span>Care-plan</span>
                <select value={planId} onChange={(event) => setPlanId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                  <option value="">Ingen plan ennå</option>
                  {plans.filter((plan) => plan.active).map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name} · {plan.visitsPerMonth} besøk/mnd · {moneyFromCents(plan.priceCents, plan.currency)}/mnd</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm text-slate-300 sm:col-span-2">
                <span>Startdato</span>
                <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
              <label className="space-y-1.5 text-sm text-slate-300">
                <span>Faktureringsdag</span>
                <input type="number" min={1} max={28} value={billingDay} onChange={(event) => setBillingDay(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
              </label>
            </div>
          </div>

          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Ingen e-post eller faktura sendes av denne handlingen. Den oppretter kun Care-data du har valgt.</p>
            <Button type="submit" disabled={saving || !propertyType || !addressLine.trim() || !municipality.trim() || (activatingAgreement && !planId)}>
              {saving ? <><Loader2 size={16} className="mr-2 animate-spin" />Oppretter …</> : activatingAgreement ? "Aktiver Care-avtale" : planId ? "Opprett kunde + avtale" : "Opprett Care-kunde"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


function CareLeadFollowupDialog({
  lead,
  onClose,
  onSaved,
}: {
  lead: CareLead;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const initialStage = lead.salesStage === "activated" ? "contacted" : lead.salesStage;
  const [stage, setStage] = useState<Exclude<CareSalesStage, "activated">>(initialStage as Exclude<CareSalesStage, "activated">);
  const [followUpOn, setFollowUpOn] = useState(lead.followUpOn || "");
  const [note, setNote] = useState(lead.salesNote || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const needsFollowUp = stage === "quote_sent" || stage === "waiting_customer";
  const needsReason = stage === "not_relevant";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/care/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, followUpOn: followUpOn || null, note }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke oppdatere Care-oppfølgingen.");
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke oppdatere Care-oppfølgingen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="mx-auto my-10 max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">Care salgsoppfølging</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{lead.contactName}</h2>
            <p className="mt-1 text-sm text-slate-400">Registrer hvor henvendelsen står og når den skal følges opp. Dette styrer Care-listen og varseltallene.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Lukk</button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
          <label className="block space-y-1.5 text-sm text-slate-300">
            <span>Status</span>
            <select value={stage} onChange={(event) => setStage(event.target.value as Exclude<CareSalesStage, "activated">)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
              <option value="new">Ny</option>
              <option value="contacted">Kontaktet</option>
              <option value="quote_sent">Tilbud sendt</option>
              <option value="waiting_customer">Venter på kunden</option>
              <option value="not_relevant">Ikke aktuell</option>
            </select>
          </label>

          <label className="block space-y-1.5 text-sm text-slate-300">
            <span>Neste oppfølging {needsFollowUp ? <span className="text-amber-300">*</span> : <span className="text-slate-500">(valgfritt)</span>}</span>
            <input type="date" required={needsFollowUp} value={followUpOn} onChange={(event) => setFollowUpOn(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" />
          </label>

          <label className="block space-y-1.5 text-sm text-slate-300">
            <span>Notat {needsReason ? <span className="text-amber-300">*</span> : <span className="text-slate-500">(valgfritt)</span>}</span>
            <textarea required={needsReason} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={4} placeholder={needsReason ? "Hvorfor er henvendelsen ikke aktuell?" : "Kort notat om samtalen eller tilbudet"} className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600" />
          </label>

          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Denne handlingen sender ingen e-post. Den oppdaterer kun intern Care-oppfølging.</p>
            <Button type="submit" disabled={saving || (needsFollowUp && !followUpOn) || (needsReason && !note.trim())}>
              {saving ? <><Loader2 size={16} className="mr-2 animate-spin" />Lagrer …</> : "Lagre oppfølging"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ title, detail, icon: Icon }: { title: string; detail: string; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/45 p-8 text-center">
      <Icon size={28} className="mx-auto text-amber-300" />
      <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, detail }: { label: string; value: string | number; icon: LucideIcon; detail?: string }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/65 p-4">
      <Icon size={19} className="text-amber-300" />
      <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <strong className="mt-1 block text-2xl text-white">{value}</strong>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </article>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${statusClass(value)}`}>{value}</span>;
}

function CareLeadCard({
  lead,
  onOnboard,
  onFollowUp,
}: {
  lead: CareLead;
  onOnboard?: (lead: CareLead) => void;
  onFollowUp?: (lead: CareLead) => void;
}) {
  const open = careLeadOpen(lead);
  return (
    <article className={`rounded-lg border p-4 transition ${open ? "border-amber-500/20 bg-slate-950/55 hover:border-amber-500/40" : "border-slate-800 bg-slate-950/35 opacity-80"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">{careServiceLabel(lead.serviceIntent)}</span>
            <StatusBadge value={lead.status} />
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${careSalesStageClass(lead.salesStage)}`}>{careSalesStageLabel(lead.salesStage)}</span>
            {lead.pipelineStatus && <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">CRM {lead.pipelineStatus}</span>}
            {careLeadAttentionLabel(lead) && (
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-200">{careLeadAttentionLabel(lead)}</span>
            )}
            {lead.isExistingContact && <span className="text-[11px] text-cyan-300">Eksisterende kontakt</span>}
            {lead.carePropertyId && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">Care-kunde{lead.careContractId ? " + avtale" : ""}</span>}
          </div>
          <h3 className="mt-3 truncate text-base font-semibold text-white">{lead.contactName}</h3>
          <p className="mt-1 truncate text-xs text-slate-400">
            {[lead.email, lead.phone].filter(Boolean).join(" · ") || "Kontaktdata ligger i kundekortet"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-xs text-slate-500">{dateLabel(lead.createdAt)}</span>
          {open && <span className="mt-1 block text-[11px] text-slate-600">åpen henvendelse</span>}
        </div>
      </div>

      <div className="mt-3 grid gap-1.5 text-xs text-slate-500 sm:grid-cols-2">
        <p className="truncate"><span className="text-slate-400">Område:</span> {lead.preferredArea || "Ikke oppgitt"}</p>
        <p className="truncate"><span className="text-slate-400">Boligtype:</span> {lead.propertyType || "Ikke oppgitt"}</p>
        <p className="truncate sm:col-span-2">
          <span className="text-slate-400">Kildeside:</span>{" "}
          {sourcePageHref(lead.pageUrl) ? (
            <a href={sourcePageHref(lead.pageUrl) || undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
              {sourcePageLabel(lead.pageUrl)} <ExternalLink size={11} />
            </a>
          ) : sourcePageLabel(lead.pageUrl)}
        </p>
        <p className="truncate"><span className="text-slate-400">Kilde:</span> {lead.source || "Care webskjema"}</p>
        <p className="truncate"><span className="text-slate-400">Oppfølging:</span> {lead.followUpOn ? dateLabel(lead.followUpOn) : "Ikke satt"}</p>
        {(lead.utmSource || lead.utmCampaign) && (
          <p className="truncate"><span className="text-slate-400">Kampanje:</span> {[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")}</p>
        )}
      </div>

      {lead.nextAction && (
        <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300">
          <span className="font-semibold text-amber-200">Neste steg:</span> {lead.nextAction}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs">
        <span className="text-slate-500">{lead.priority} prioritet{lead.careReference ? ` · ${lead.careReference}` : ""}</span>
        <div className="flex flex-wrap gap-2">
          <Link href={lead.customerHref} className="rounded-lg border border-slate-700 px-3 py-2 font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800">Åpne kundekort</Link>
          {open && !lead.careContractId && onFollowUp && (
            <button type="button" onClick={() => onFollowUp(lead)} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 font-semibold text-cyan-200 hover:bg-cyan-500/15">Oppfølging</button>
          )}
          {lead.carePropertyId ? (
            <>
              <Link href="/care/customers" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-200">Se Care-kunde</Link>
              {!lead.careContractId && onOnboard && (
                <button type="button" onClick={() => onOnboard(lead)} className="rounded-lg bg-amber-400 px-3 py-2 font-semibold text-slate-950 hover:bg-amber-300">Aktiver avtale</button>
              )}
            </>
          ) : onOnboard ? (
            <button type="button" onClick={() => onOnboard(lead)} className="rounded-lg bg-amber-400 px-3 py-2 font-semibold text-slate-950 hover:bg-amber-300">Opprett Care-kunde</button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LeadsView({ dashboard, onReload }: { dashboard: CareDashboardData; onReload: () => Promise<void> | void }) {
  const [serviceFilter, setServiceFilter] = useState("all");
  const [openOnly, setOpenOnly] = useState(true);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [onboardingLead, setOnboardingLead] = useState<CareLead | null>(null);
  const [followupLead, setFollowupLead] = useState<CareLead | null>(null);

  const services = useMemo(() => {
    const values = Array.from(new Set(dashboard.leads.map((lead) => lead.serviceIntent).filter(Boolean)));
    return values.sort((a, b) => careServiceLabel(a).localeCompare(careServiceLabel(b), "nb"));
  }, [dashboard.leads]);

  const attentionCount = useMemo(
    () => dashboard.leads.filter(careLeadNeedsAttention).length,
    [dashboard.leads],
  );

  const filtered = useMemo(() => dashboard.leads
    .filter((lead) => {
      if (openOnly && !careLeadOpen(lead)) return false;
      if (attentionOnly && !careLeadNeedsAttention(lead)) return false;
      return serviceFilter === "all" || lead.serviceIntent === serviceFilter;
    })
    .sort((a, b) => careLeadAttentionScore(b) - careLeadAttentionScore(a)
      || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
  [dashboard.leads, openOnly, attentionOnly, serviceFilter]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-800 bg-slate-900/65 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Care pipeline</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Leads & tilbud</h2>
            <p className="mt-1 text-sm text-slate-400">Fra første Care-henvendelse til eiendom og aktiv avtale. Åpne kundekortet før du endrer Care-status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline"><Link href="/customers?tab=leads">Åpne alle CRM-leads</Link></Button>
            <Button onClick={() => onReload()} variant="outline"><RefreshCw size={15} className="mr-2" />Oppdater</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            ["Krever handling", attentionCount, "prioritert kø nå"],
            ["Åpne leads", dashboard.lifecycle.openLeads, "ikke ferdigbehandlet"],
            ["Over 24 t", dashboard.summary.staleOpenLeads, "åpne siden i går"],
            ["Tilbud i løp", dashboard.summary.offersInProgress, "tilbud sendt / venter svar"],
            ["Oppfølging nå", dashboard.summary.followUpsDue, "dato i dag eller passert"],
            ["Aktivert", dashboard.lifecycle.contractedLeads, `${dashboard.lifecycle.leadToContractPercent}% av målte leads`],
          ].map(([label, value, detail]) => (
            <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <strong className="mt-1 block text-2xl text-white">{value}</strong>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={() => setAttentionOnly((value) => !value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${attentionOnly ? "border-red-400 bg-red-400 text-slate-950" : "border-red-500/30 text-red-200 hover:bg-red-500/10"}`}>Krever handling ({attentionCount})</button>
          <button type="button" onClick={() => setServiceFilter("all")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${serviceFilter === "all" ? "border-amber-400 bg-amber-400 text-slate-950" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}>Alle tjenester</button>
          {services.map((service) => (
            <button key={service} type="button" onClick={() => setServiceFilter(service)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${serviceFilter === service ? "border-amber-400 bg-amber-400 text-slate-950" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}>{careServiceLabel(service)}</button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />Kun åpne</label>
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="Ingen leads i dette filteret" detail="Endre tjenestefilteret eller vis ferdige henvendelser." />
      ) : (
        <section className="grid gap-3 xl:grid-cols-2">
          {filtered.map((lead) => <CareLeadCard key={lead.id} lead={lead} onOnboard={setOnboardingLead} onFollowUp={setFollowupLead} />)}
        </section>
      )}

      {onboardingLead && (
        <CareOnboardingDialog
          lead={onboardingLead}
          plans={dashboard.plans}
          onClose={() => setOnboardingLead(null)}
          onSaved={onReload}
        />
      )}
      {followupLead && (
        <CareLeadFollowupDialog
          lead={followupLead}
          onClose={() => setFollowupLead(null)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}

function Overview({ dashboard, onReload }: { dashboard: CareDashboardData; onReload: () => Promise<void> | void }) {
  const openLeadCount = dashboard.leads.filter(careLeadOpen).length;
  const attentionLeads = [...dashboard.leads]
    .filter(careLeadNeedsAttention)
    .sort((a, b) => careLeadAttentionScore(b) - careLeadAttentionScore(a)
      || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const [onboardingLead, setOnboardingLead] = useState<CareLead | null>(null);
  const [followupLead, setFollowupLead] = useState<CareLead | null>(null);

  const propertyById = new Map(dashboard.properties.map((property) => [property.id, property]));
  const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const operationalQueue = [
    ...dashboard.calendarEvents
      .filter((event) => {
        const at = event.startsAt ? new Date(event.startsAt).getTime() : 0;
        return careStatusOpen(event.status) && at >= Date.now() && at <= sevenDaysFromNow;
      })
      .map((event) => ({
        id: `event:${event.id}`,
        kind: "Tilsyn / kalender",
        label: event.title,
        propertyId: event.propertyId,
        propertyLabel: event.propertyLabel,
        detail: `Planlagt ${dateLabel(event.startsAt)} · ${event.status}`,
        href: "/care/keys",
        score: careOperationalDateScore(event.startsAt) + 20,
        icon: CalendarCheck2 as LucideIcon,
      })),
    ...dashboard.issues
      .filter((issue) => careStatusOpen(issue.status))
      .map((issue) => {
        const severity = issue.severity.toLowerCase();
        const severityScore = severity === "critical" ? 140 : severity === "high" ? 115 : severity === "medium" ? 80 : 50;
        return {
          id: `issue:${issue.id}`,
          kind: "Avvik",
          label: issue.title,
          propertyId: issue.propertyId,
          propertyLabel: issue.propertyLabel,
          detail: `${issue.severity} · åpnet ${dateLabel(issue.openedAt)}`,
          href: "/care/customers",
          score: severityScore,
          icon: AlertTriangle as LucideIcon,
        };
      }),
    ...dashboard.workOrders
      .filter((order) => careStatusOpen(order.status))
      .map((order) => ({
        id: `work:${order.id}`,
        kind: "Arbeidsordre",
        label: order.description || order.reference || "Arbeidsordre",
        propertyId: order.propertyId,
        propertyLabel: order.propertyLabel,
        detail: `${order.status} · ${order.scheduledFor ? `planlagt ${dateLabel(order.scheduledFor)}` : "dato ikke satt"}`,
        href: "/care/customers",
        score: careOperationalDateScore(order.scheduledFor) + 10,
        icon: Wrench as LucideIcon,
      })),
  ].sort((a, b) => b.score - a.score || a.propertyLabel.localeCompare(b.propertyLabel, "nb"));

  const attentionItems = [
    dashboard.summary.followUpsDue > 0 ? {
      id: "followups",
      label: "Følg opp Care-tilbud",
      detail: "Tilbud eller kundesvar har oppfølgingsdato i dag eller tidligere.",
      count: dashboard.summary.followUpsDue,
      href: "/care/leads",
      icon: MessageSquareText,
    } : null,
    dashboard.lifecycle.awaitingProperty > 0 ? {
      id: "new-leads",
      label: "Kvalifiser nye Care-henvendelser",
      detail: "Åpne kundekortet, bekreft behov og opprett Care-eiendom når kunden er klar.",
      count: dashboard.lifecycle.awaitingProperty,
      href: "#care-leads",
      icon: Inbox,
    } : null,
    dashboard.lifecycle.awaitingContract > 0 ? {
      id: "agreements",
      label: "Aktiver Care-avtale",
      detail: "Care-eiendom er opprettet, men aktiv plan og MRR mangler.",
      count: dashboard.lifecycle.awaitingContract,
      href: "#care-leads",
      icon: ShieldCheck,
    } : null,
    dashboard.lifecycle.propertiesWithoutNextVisit > 0 ? {
      id: "visits",
      label: "Planlegg neste besøk",
      detail: "Aktive avtaler uten kommende kalenderhendelse bør få et konkret neste tilsyn.",
      count: dashboard.lifecycle.propertiesWithoutNextVisit,
      href: "/care/visits",
      icon: CalendarCheck2,
    } : null,
    dashboard.lifecycle.propertiesWithoutKey > 0 ? {
      id: "keys",
      label: "Registrer nøkkelrutine",
      detail: "Aktive Care-avtaler uten registrert nøkkel bør avklares operativt.",
      count: dashboard.lifecycle.propertiesWithoutKey,
      href: "/care/keys",
      icon: KeyRound,
    } : null,
    dashboard.lifecycle.openOperationalIssues > 0 ? {
      id: "issues",
      label: "Følg opp åpne Care-saker",
      detail: "Avvik eller arbeidsordre krever oppfølging før de blir liggende.",
      count: dashboard.lifecycle.openOperationalIssues,
      href: "/care/customers",
      icon: Wrench,
    } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; detail: string; count: number; href: string; icon: LucideIcon }>;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-cyan-500/20 bg-slate-900/65 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Care-flyt</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Henvendelse → Care-kunde → avtale → besøk → MRR</h2>
            <p className="mt-1 text-sm text-slate-400">Operativ flyt for de siste registrerte Care-henvendelsene og aktive avtalene.</p>
          </div>
          <p className="text-xs text-slate-500">{dashboard.lifecycle.trackedLeads} Care-leads målt · {dashboard.lifecycle.leadToContractPercent}% har aktivert avtale</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Nye leads", dashboard.lifecycle.awaitingProperty, "må kvalifiseres"],
            ["Care-eiendom", dashboard.lifecycle.awaitingContract, "venter på avtale"],
            ["Avtale aktivert", dashboard.lifecycle.contractedLeads, "fra Care-leads"],
            ["Kommende besøk", dashboard.summary.upcomingEvents, "kalenderhendelser"],
            ["MRR", moneyFromCents(dashboard.summary.monthlyRecurringRevenueCents), String(dashboard.summary.activeContracts) + " aktive avtaler"],
          ].map(([label, value, detail]) => (
            <article key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
              <strong className="mt-1 block text-2xl text-white">{value}</strong>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      {dashboard.serviceDemand.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/65 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Etterspørsel</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Hva kundene spør om</h2>
              <p className="mt-1 text-sm text-slate-400">Care-intent fra skjema og CRM. Bruk dette til å se hvilke tjenester som faktisk skaper henvendelser og avtaler.</p>
            </div>
            <Link href="/care/leads" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">Se alle leads →</Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {dashboard.serviceDemand.map((item) => (
              <article key={item.serviceIntent} className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-white">{careServiceLabel(item.serviceIntent)}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div><strong className="text-2xl text-white">{item.trackedLeads}</strong><p className="text-[11px] text-slate-500">henvendelser</p></div>
                  <div className="text-right"><strong className="text-lg text-amber-200">{item.openLeads}</strong><p className="text-[11px] text-slate-500">åpne</p></div>
                </div>
                <div className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-500">{item.contractedLeads} avtaler · {item.leadToContractPercent}% konvertering</div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/65 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Dette bør du gjøre i dag</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Care-oppmerksomhet</h2>
          </div>
          <span className="text-xs text-slate-500">{attentionItems.length} operative områder trenger oppfølging</span>
        </div>
        {attentionItems.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-200">
            <CheckCircle2 size={18} /> Ingen åpen Care-oppmerksomhet i dagens data.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {attentionItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.id} href={item.href} className="group flex items-start gap-4 rounded-lg border border-slate-800 bg-slate-950/45 p-4 transition hover:border-amber-500/35 hover:bg-slate-950/70">
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-amber-200"><Icon size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-white">{item.label}</strong>
                      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-950">{item.count}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p>
                  </div>
                  <ChevronRight size={16} className="mt-1 text-slate-600 transition group-hover:text-amber-300" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <section className="rounded-xl border border-slate-800 bg-slate-900/65 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Operativ Care-kø</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Besøk, avvik og arbeidsordre som kommer først</h2>
            <p className="mt-1 text-sm text-slate-400">Kritiske avvik og forfalte/nære oppgaver prioriteres automatisk. Klikk kundekortet for kontekst før du handler.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/care/keys" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">Kalender →</Link>
            <Link href="/care/customers" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">Eiendommer →</Link>
          </div>
        </div>

        {operationalQueue.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-200">
            <CheckCircle2 size={18} /> Ingen kommende tilsyn, åpne avvik eller arbeidsordre krever plass i køen nå.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/45">
            {operationalQueue.slice(0, 8).map((item) => {
              const Icon = item.icon;
              const property = propertyById.get(item.propertyId);
              return (
                <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-cyan-200"><Icon size={17} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.kind}</span>
                      <strong className="truncate text-sm text-white">{item.propertyLabel}</strong>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-300">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {property?.ownerId && (
                      <Link href={`/customers/${encodeURIComponent(property.ownerId)}`} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Kundekort</Link>
                    )}
                    <Link href={item.href} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/15">Åpne Care</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section id="care-leads" className="scroll-mt-24 rounded-xl border border-amber-500/20 bg-slate-900/65 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Prioriterte Care-henvendelser</h2>
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-200">{attentionLeads.length} krever handling</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">{openLeadCount} åpne totalt</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">Forfalte oppfølginger, gamle åpne leads, høy prioritet og nye henvendelser kommer først. Tjeneste, kilde og kundekort følger med.</p>
          </div>
          <Button asChild variant="outline"><Link href="/customers?tab=leads">Åpne CRM</Link></Button>
        </div>

        {dashboard.leads.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-5 text-sm text-slate-400">
            Ingen Care-henvendelser er registrert ennå. Nye skjema fra care.zenecohomes.com vil vises her automatisk.
          </div>
        ) : attentionLeads.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-200">
            <CheckCircle2 size={18} /> Ingen Care-leads krever umiddelbar handling. Se hele køen under Leads & tilbud.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {attentionLeads.slice(0, 6).map((lead) => (
              <CareLeadCard key={lead.id} lead={lead} onOnboard={setOnboardingLead} onFollowUp={setFollowupLead} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {dashboard.workflows.map((workflow) => (
          <Link key={workflow.id} href={workflow.href} className="group rounded-xl border border-slate-800 bg-slate-900/65 p-5 transition hover:border-amber-500/40">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${readinessClass(workflow.status)}`}>{workflow.status}</span>
                <h2 className="mt-4 text-lg font-semibold text-white">{workflow.label}</h2>
                <p className="mt-2 text-sm text-slate-400">{workflow.detail}</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                <ChevronRight size={18} className="transition group-hover:translate-x-0.5" />
              </div>
            </div>
            <strong className="mt-5 block text-3xl text-white">{workflow.count}</strong>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-5">
          <h2 className="text-lg font-semibold text-white">Care readiness</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {dashboard.readiness.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.status === "ok" ? "bg-emerald-400" : item.status === "warning" ? "bg-amber-300" : "bg-slate-500"}`} />
                  <strong className="text-sm text-white">{item.label}</strong>
                </div>
                <p className="mt-2 text-sm text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-5">
          <h2 className="text-lg font-semibold text-white">Siste Care-aktivitet</h2>
          {dashboard.recentActivity.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/45 p-5 text-sm text-slate-400">Ingen aktivitet registrert i Care-tabellene ennå.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.recentActivity.map((item) => (
                <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-3 hover:border-slate-700">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="truncate text-xs text-slate-500">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{dateLabel(item.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {onboardingLead && (
        <CareOnboardingDialog
          lead={onboardingLead}
          plans={dashboard.plans}
          onClose={() => setOnboardingLead(null)}
          onSaved={onReload}
        />
      )}
      {followupLead && (
        <CareLeadFollowupDialog
          lead={followupLead}
          onClose={() => setFollowupLead(null)}
          onSaved={onReload}
        />
      )}
    </div>
  );
}

function CustomersView({ properties }: { properties: CareProperty[] }) {
  if (properties.length === 0) {
    return <EmptyState icon={Home} title="Ingen Care-eiendommer ennå" detail="Care-tabellene er klare, men kh_properties har ingen rader. Når første kunde/eiendom er registrert, vises eier, adresse, avtale, nøkler og servicebehov her." />;
  }
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {properties.map((property) => (
        <article key={property.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={property.status} />
            {property.contractStatus && <StatusBadge value={property.contractStatus} />}
            {property.planName && <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">{property.planName}</span>}
          </div>
          <h2 className="mt-4 text-xl font-semibold text-white">{property.name}</h2>
          <p className="mt-1 text-sm text-slate-400">{property.address || "Adresse mangler"}{property.municipality ? ` · ${property.municipality}` : ""}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3"><p className="text-xs text-slate-500">Eier</p><strong className="mt-1 block truncate text-sm text-white">{property.ownerName}</strong></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3"><p className="text-xs text-slate-500">MRR</p><strong className="mt-1 block text-sm text-white">{moneyFromCents(property.monthlyPriceCents)}</strong></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3"><p className="text-xs text-slate-500">Nøkler</p><strong className="mt-1 block text-sm text-white">{property.keyCount}</strong></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
            {property.hasPool && <span className="rounded-full bg-slate-800 px-2.5 py-1">Basseng</span>}
            {property.hasGarden && <span className="rounded-full bg-slate-800 px-2.5 py-1">Hage</span>}
            <span className="rounded-full bg-slate-800 px-2.5 py-1">Siste tilsyn {dateLabel(property.lastInspectionAt)}</span>
            <span className="rounded-full bg-slate-800 px-2.5 py-1">Neste besøk {dateLabel(property.nextEventAt)}</span>
          </div>
          <div className="mt-4 space-y-2">
            {!property.contractStatus && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">
                Ingen aktiv Care-avtale. Velg riktig plan før løpende MRR og tilsyn starter.
              </div>
            )}
            {property.contractStatus && !property.nextEventAt && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">
                Aktiv avtale uten planlagt neste besøk.
              </div>
            )}
            {property.contractStatus && property.keyCount === 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">
                Ingen registrert nøkkel. Avklar nøkkelrutine dersom tjenesten krever tilgang.
              </div>
            )}
            {(property.openIssues > 0 || property.openWorkOrders > 0) && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">
                {property.openIssues} åpne avvik · {property.openWorkOrders} åpne arbeidsordre
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
            <Button asChild size="sm" variant="outline">
              <Link href={`/customers/${encodeURIComponent(property.ownerId)}`}>Åpne kundekort</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/care/keys">Nøkler & kalender</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/care/invoices">Faktura & MRR</Link>
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}

function ReportsView({ inspections, reports, photos }: { inspections: CareInspection[]; reports: CareReport[]; photos: CarePhoto[] }) {
  if (inspections.length === 0 && reports.length === 0 && photos.length === 0) {
    return <EmptyState icon={ClipboardCheck} title="Ingen rapporter eller bilder ennå" detail="Inspeksjonsmalen ligger klar i Care. Når tilsyn registreres, samles sjekkpunkter, bilder, PDF-rapporter og utsendinger her." />;
  }
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Rapporter</h2>
        {reports.length === 0 ? <EmptyState icon={ClipboardCheck} title="Ingen rapportutkast" detail="Rapporter opprettes fra gjennomførte inspeksjoner." /> : reports.map((report) => (
          <article key={report.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge value={report.status} />
              <span className="text-xs text-slate-500">{report.locale.toUpperCase()} · {report.deliveryCount} utsendinger · {report.viewCount} visninger</span>
            </div>
            <h3 className="mt-3 font-semibold text-white">{report.reference || shortId(report.id)}</h3>
            <p className="mt-1 text-sm text-slate-400">{report.propertyLabel}</p>
            <p className="mt-2 text-xs text-slate-500">Godkjent {dateLabel(report.approvedAt)} · sendt {dateLabel(report.sentAt)}</p>
          </article>
        ))}
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Inspeksjoner og bilder</h2>
        {inspections.map((inspection) => (
          <article key={inspection.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge value={inspection.status} />
              <span className="text-xs text-slate-500">{inspection.photoCount} bilder · {inspection.issueCount} avvik</span>
            </div>
            <h3 className="mt-3 font-semibold text-white">{inspection.propertyLabel}</h3>
            <p className="mt-1 text-sm text-slate-400">{inspection.kind} · startet {dateLabel(inspection.startedAt)} · ferdig {dateLabel(inspection.completedAt)}</p>
          </article>
        ))}
        {photos.slice(0, 12).map((photo) => (
          <article key={photo.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-start gap-3">
              <Camera size={19} className="mt-1 text-amber-300" />
              <div className="min-w-0">
                <h3 className="font-semibold text-white">{photo.caption}</h3>
                <p className="mt-1 text-sm text-slate-400">{photo.propertyLabel} · {dateLabel(photo.takenAt)}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{photo.storagePath}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function InvoicesView({ invoices, charges, plans }: { invoices: CareInvoice[]; charges: CareCharge[]; plans: CarePlan[] }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Fakturaer</h2>
        {invoices.length === 0 ? <EmptyState icon={FileSpreadsheet} title="Ingen Care-fakturaer ennå" detail="Fakturatabellene er klare. Når kontrakter og tillegg er registrert, vises utkast, perioder, totalsum og linjer her." /> : invoices.map((invoice) => (
          <article key={invoice.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge value={invoice.status} />
              <strong className="text-white">{moneyFromCents(invoice.totalCents, invoice.currency)}</strong>
            </div>
            <h3 className="mt-3 font-semibold text-white">{invoice.reference || shortId(invoice.id)}</h3>
            <p className="mt-1 text-sm text-slate-400">{invoice.propertyLabel}</p>
            <p className="mt-2 text-xs text-slate-500">{dateLabel(invoice.periodStart)} til {dateLabel(invoice.periodEnd)} · {invoice.lineCount} linjer</p>
          </article>
        ))}
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Tillegg og planer</h2>
        {charges.length > 0 && charges.map((charge) => (
          <article key={charge.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge value={charge.status} />
              <strong className="text-white">{moneyFromCents(charge.amountCents, charge.currency)}</strong>
            </div>
            <h3 className="mt-3 font-semibold text-white">{charge.description || charge.kind}</h3>
            <p className="mt-1 text-sm text-slate-400">{charge.propertyLabel} · {dateLabel(charge.occurredOn)}</p>
          </article>
        ))}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-white">Care-planer</h3>
          <div className="mt-3 space-y-2">
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/45 p-3">
                <div>
                  <p className="text-sm font-medium text-white">{plan.name}</p>
                  <p className="text-xs text-slate-500">{plan.visitsPerMonth} besøk/mnd</p>
                </div>
                <strong className="shrink-0 text-sm text-amber-200">{moneyFromCents(plan.priceCents, plan.currency)}</strong>
              </div>
            ))}
            {plans.length === 0 && <p className="text-sm text-slate-400">Ingen prisplaner funnet i care.kh_plans.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function KeysView({
  keys,
  events,
  issues,
  workOrders,
}: {
  keys: CareKey[];
  events: CareCalendarEvent[];
  issues: Array<{ id: string; propertyLabel: string; title: string; severity: string; status: string; openedAt: string | null }>;
  workOrders: Array<{ id: string; propertyLabel: string; reference: string; status: string; description: string; scheduledFor: string | null; ownerTotalCents: number; currency: string }>;
}) {
  if (keys.length === 0 && events.length === 0 && issues.length === 0 && workOrders.length === 0) {
    return <EmptyState icon={KeyRound} title="Ingen nøkler eller kalenderhendelser ennå" detail="Care har tabeller for nøkkelregister, nøkkelhendelser, planlagte besøk, avvik og arbeidsordre. De blir synlige her når de får data." />;
  }
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Nøkkelregister</h2>
        {keys.map((key) => (
          <article key={key.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge value={key.status} />
              <span className="text-xs text-slate-500">{key.storageLocation || "Plassering mangler"}</span>
            </div>
            <h3 className="mt-3 font-semibold text-white">{key.label}</h3>
            <p className="mt-1 text-sm text-slate-400">{key.propertyLabel}</p>
            <p className="mt-2 text-xs text-slate-500">Siste hendelse {dateLabel(key.lastEventAt)}{key.lastHolder ? ` · ${key.lastHolder}` : ""}</p>
          </article>
        ))}
        {keys.length === 0 && <EmptyState icon={KeyRound} title="Ingen nøkler registrert" detail="Nøkkelregisteret fylles fra care.kh_keys." />}
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Kalender, avvik og arbeid</h2>
        {events.map((event) => (
          <article key={event.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge value={event.status} />
              <span className="text-xs text-slate-500">{event.billable ? "Fakturerbar" : "Ikke fakturerbar"}</span>
            </div>
            <h3 className="mt-3 font-semibold text-white">{event.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{event.propertyLabel} · {dateLabel(event.startsAt)}</p>
          </article>
        ))}
        {issues.map((issue) => (
          <article key={issue.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={issue.status} />
              <StatusBadge value={issue.severity} />
            </div>
            <h3 className="mt-3 font-semibold text-white">{issue.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{issue.propertyLabel} · åpnet {dateLabel(issue.openedAt)}</p>
          </article>
        ))}
        {workOrders.map((order) => (
          <article key={order.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge value={order.status} />
              <strong className="text-white">{moneyFromCents(order.ownerTotalCents, order.currency)}</strong>
            </div>
            <h3 className="mt-3 font-semibold text-white">{order.reference || shortId(order.id)}</h3>
            <p className="mt-1 text-sm text-slate-400">{order.propertyLabel} · {dateLabel(order.scheduledFor)}</p>
            <p className="mt-2 text-xs text-slate-500">{order.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CareDashboard({ initialView = "overview" }: { initialView?: CareView }) {
  const [dashboard, setDashboard] = useState<CareDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/care/dashboard", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || body?.dashboard?.warnings?.[0] || "Kunne ikke hente Care-data.");
      setDashboard(body.dashboard);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Care-data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summaryCards = useMemo(() => dashboard ? [
    { label: "Åpne Care-leads", value: dashboard.lifecycle.openLeads, icon: Inbox, detail: "nye + leads i oppfølging" },
    { label: "Leads over 24 t", value: dashboard.summary.staleOpenLeads, icon: AlertTriangle, detail: dashboard.summary.staleOpenLeads ? "bør behandles nå" : "ingen gamle åpne leads" },
    { label: "Tilbud må følges", value: dashboard.summary.followUpsDue, icon: ShieldCheck, detail: `${dashboard.summary.offersInProgress} tilbud / venter svar` },
    { label: "Tilsyn neste 7 dager", value: dashboard.summary.upcomingEvents7d, icon: CalendarCheck2, detail: `${dashboard.summary.upcomingEvents} kommende totalt` },
    { label: "Åpne avvik", value: dashboard.summary.openIssues + dashboard.summary.openWorkOrders, icon: Wrench, detail: "avvik + arbeidsordre" },
    { label: "MRR Care", value: moneyFromCents(dashboard.summary.monthlyRecurringRevenueCents), icon: CircleDollarSign, detail: `${dashboard.summary.activeContracts} aktive avtaler` },
  ] : [], [dashboard]);

  const warnings = dashboard?.warnings || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-300"><KeyRound size={18} /> Keyholding Care</div>
          <h1 className="text-3xl font-bold text-white">Care OS</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Kunder, eiendommer, inspeksjoner, bilder, rapporter, nøkler, kalender, tillegg og faktura samlet fra Realtyflow Supabase.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/service-revenue"><CircleDollarSign size={16} className="mr-2" />Serviceinntekt</Link></Button>
          <Button asChild variant="outline"><Link href="/communications"><MessageSquareText size={16} className="mr-2" />Kommunikasjon</Link></Button>
          <Button onClick={() => load()} disabled={loading}>{loading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}Oppdater</Button>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/55 p-2">
        {VIEW_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = initialView === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${active ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {error && (
        <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">
          <div className="flex items-center gap-2 font-semibold text-amber-200"><AlertTriangle size={17} />Care-varsler</div>
          <div className="mt-2 space-y-1 text-xs text-amber-100/80">
            {warnings.slice(0, 5).map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </div>
      )}

      {loading && !dashboard ? (
        <div className="flex min-h-52 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/55 text-slate-400">
          <Loader2 size={20} className="mr-2 animate-spin" />Henter Care-data
        </div>
      ) : dashboard ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map((card) => <MetricCard key={card.label} {...card} />)}
          </section>

          {initialView === "overview" && <Overview dashboard={dashboard} onReload={load} />}
          {initialView === "leads" && <LeadsView dashboard={dashboard} onReload={load} />}
          {initialView === "customers" && <CustomersView properties={dashboard.properties} />}
          {initialView === "reports" && <ReportsView inspections={dashboard.inspections} reports={dashboard.reports} photos={dashboard.photos} />}
          {initialView === "invoices" && <InvoicesView invoices={dashboard.invoices} charges={dashboard.charges} plans={dashboard.plans} />}
          {initialView === "keys" && <KeysView keys={dashboard.keys} events={dashboard.calendarEvents} issues={dashboard.issues} workOrders={dashboard.workOrders} />}

          <footer className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/55 p-4 text-xs text-slate-500">
            <CheckCircle2 size={16} className="text-emerald-300" />
            <span>Care hentes fra schema <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{dashboard.schema}</code> · oppdatert {dateLabel(dashboard.generatedAt)}</span>
          </footer>
        </>
      ) : null}
    </div>
  );
}
