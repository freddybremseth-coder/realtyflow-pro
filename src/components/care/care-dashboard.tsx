"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileSpreadsheet,
  Gauge,
  Home,
  Image,
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
  CareKey,
  CarePhoto,
  CarePlan,
  CareProperty,
  CareReport,
  CareView,
} from "@/lib/care/dashboard";

const VIEW_TABS: Array<{ id: CareView; label: string; href: string; icon: LucideIcon }> = [
  { id: "overview", label: "Oversikt", href: "/care", icon: Gauge },
  { id: "customers", label: "Kunder & eiendommer", href: "/care/customers", icon: Users },
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

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (["active", "ok", "sent", "paid", "approved", "completed", "complete"].includes(normalized)) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (["draft", "planned", "open", "issued", "pending"].includes(normalized)) {
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

function Overview({ dashboard }: { dashboard: CareDashboardData }) {
  return (
    <div className="space-y-5">
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
          {(property.openIssues > 0 || property.openWorkOrders > 0) && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-100">
              {property.openIssues} åpne avvik · {property.openWorkOrders} åpne arbeidsordre
            </div>
          )}
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
    { label: "Care-kunder", value: dashboard.summary.customers, icon: Users, detail: `${dashboard.summary.properties} eiendommer` },
    { label: "Aktive avtaler", value: dashboard.summary.activeContracts, icon: ShieldCheck, detail: moneyFromCents(dashboard.summary.monthlyRecurringRevenueCents) },
    { label: "Rapporter", value: dashboard.summary.draftReports, icon: ClipboardCheck, detail: `${dashboard.summary.photos} bilder` },
    { label: "Faktura", value: dashboard.summary.draftInvoices, icon: FileSpreadsheet, detail: moneyFromCents(dashboard.summary.invoiceTotalCents) },
    { label: "Nøkler", value: dashboard.summary.keys, icon: KeyRound, detail: `${dashboard.summary.upcomingEvents} kommende` },
    { label: "Avvik", value: dashboard.summary.openIssues + dashboard.summary.openWorkOrders, icon: Wrench, detail: "Åpne saker" },
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
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((card) => <MetricCard key={card.label} {...card} />)}
          </section>

          {initialView === "overview" && <Overview dashboard={dashboard} />}
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
