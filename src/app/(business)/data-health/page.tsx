import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Leaf,
  Server,
  ShoppingCart,
  Users,
  XCircle,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDataHealth,
  type BusinessModuleHealth,
  type HealthStatus,
  type SchemaHealth,
  type TableHealth,
} from "@/lib/business/data-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const statusLabel: Record<HealthStatus, string> = {
  ok: "OK",
  warning: "Sjekk",
  error: "Feil",
  missing: "Mangler",
  not_configured: "Ikke satt",
};

const statusVariant: Record<HealthStatus, BadgeVariant> = {
  ok: "success",
  warning: "warning",
  error: "destructive",
  missing: "warning",
  not_configured: "destructive",
};

function StatusBadge({ status }: { status: HealthStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>;
}

function StatusIcon({ status }: { status: HealthStatus }) {
  const Icon = status === "ok" ? CheckCircle2 : status === "error" || status === "not_configured" ? XCircle : AlertTriangle;
  const color = status === "ok" ? "text-emerald-400" : status === "error" || status === "not_configured" ? "text-red-400" : "text-amber-400";
  return <Icon className={color} size={18} />;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatMoney(value: number, currency: "EUR" | "NOK" = "EUR") {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "Ingen data";
  return new Intl.DateTimeFormat("nb-NO", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function TableRow({ table }: { table: TableHealth }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-700/40 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-100">{table.label}</p>
        <p className="truncate font-mono text-[11px] text-slate-500">
          {table.schema}.{table.table}
          {table.error ? ` · ${table.error}` : ""}
        </p>
      </div>
      <p className="font-mono text-xs text-slate-300">
        {table.count === null ? "-" : formatNumber(table.count)}
      </p>
      <StatusBadge status={table.status} />
    </div>
  );
}

function SchemaPanel({ schema }: { schema: SchemaHealth }) {
  const okCount = schema.tables.filter((table) => table.status === "ok").length;
  const requiredMissing = schema.tables.filter((table) => table.required && table.status !== "ok").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server size={18} />
              {schema.label}
            </CardTitle>
            <p className="mt-1 truncate font-mono text-xs text-slate-500">
              {schema.host || "Mangler host"} · schema {schema.schema}
            </p>
          </div>
          <StatusBadge status={schema.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-900/50 p-3">
            <p className="font-mono text-lg font-bold text-white">{okCount}</p>
            <p className="text-[10px] uppercase text-slate-500">Svarte</p>
          </div>
          <div className="rounded-lg bg-slate-900/50 p-3">
            <p className="font-mono text-lg font-bold text-amber-300">{requiredMissing}</p>
            <p className="text-[10px] uppercase text-slate-500">Krever sjekk</p>
          </div>
          <div className="rounded-lg bg-slate-900/50 p-3">
            <p className="font-mono text-lg font-bold text-white">{schema.tables.length}</p>
            <p className="text-[10px] uppercase text-slate-500">Tabeller</p>
          </div>
        </div>
        <div className="space-y-0">
          {schema.tables.map((table) => (
            <TableRow key={`${table.schema}.${table.table}`} table={table} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/50 p-3">
      <p className="truncate text-[10px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function ModuleCard({
  title,
  icon: Icon,
  data,
  metrics,
}: {
  title: string;
  icon: typeof ShoppingCart;
  data: BusinessModuleHealth;
  metrics: { label: string; value: string }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon size={18} />
              {title}
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              {data.sourceSchema ? `schema ${data.sourceSchema}` : "Ingen lesbar kilde"} · sist {formatDate(data.latestDate)}
            </p>
          </div>
          <StatusBadge status={data.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <Metric key={metric.label} label={metric.label} value={metric.value} />
          ))}
        </div>
        {data.warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-amber-300">Varsler</p>
            <div className="space-y-1">
              {data.warnings.slice(0, 3).map((warning) => (
                <p key={warning} className="truncate text-xs text-amber-100/80">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function DataHealthPage() {
  const report = await getDataHealth();
  const familyCurrency = report.modules.familyResults.currency;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Database className="text-primary-400" size={28} />
            Data Health
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            RealtyFlow, Doña Anna/Olivia og Family i samme Supabase-kontroll.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={report.status} />
          <a
            href="/api/business/data-health"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-600 px-3 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            JSON
          </a>
        </div>
      </div>

      <Card className="border-primary-500/30 bg-primary-500/10">
        <CardContent className="grid gap-4 p-5 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <StatusIcon status={report.status} />
              <p className="text-sm font-semibold text-white">Oppdatert {new Date(report.generatedAt).toLocaleString("nb-NO")}</p>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Service role: {report.environment.usesServiceRole ? "aktiv" : "mangler"} · Olivia schema: {report.environment.oliviaSchema} · Family schema: {report.environment.familySchema}
            </p>
          </div>
          <Metric label="RealtyFlow host" value={report.environment.mainHost || "mangler"} />
          <Metric label="Olivia host" value={report.environment.oliviaHost || "mangler"} />
          <Metric label="Family host" value={report.environment.familyHost || "mangler"} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ModuleCard
          title="B2B ordre og faktura"
          icon={ShoppingCart}
          data={report.modules.b2b}
          metrics={[
            { label: "Ordre", value: formatNumber(report.modules.b2b.metrics.orders) },
            { label: "Åpne ordre", value: formatNumber(report.modules.b2b.metrics.openOrders) },
            { label: "Ordreverdi", value: formatMoney(report.modules.b2b.metrics.orderValue) },
            { label: "Faktura", value: formatNumber(report.modules.b2b.metrics.invoices) },
            { label: "Ubetalt", value: formatMoney(report.modules.b2b.metrics.unpaidInvoiceValue) },
            { label: "Kunder", value: formatNumber(report.modules.b2b.metrics.customers) },
          ]}
        />
        <ModuleCard
          title="Olivia batch-sporing"
          icon={Leaf}
          data={report.modules.oliviaBatch}
          metrics={[
            { label: "Batches", value: formatNumber(report.modules.oliviaBatch.metrics.batches) },
            { label: "Aktive", value: formatNumber(report.modules.oliviaBatch.metrics.activeBatches) },
            { label: "Høst kg", value: formatNumber(report.modules.oliviaBatch.metrics.harvestKg) },
            { label: "Høstinntekt", value: formatMoney(report.modules.oliviaBatch.metrics.harvestRevenue) },
            { label: "Netto", value: formatMoney(report.modules.oliviaBatch.metrics.net) },
            { label: "Trær", value: formatNumber(report.modules.oliviaBatch.metrics.trees) },
          ]}
        />
        <ModuleCard
          title="Family resultatsammendrag"
          icon={Users}
          data={report.modules.familyResults}
          metrics={[
            { label: "Måneder", value: formatNumber(report.modules.familyResults.metrics.months) },
            { label: "YTD total", value: formatMoney(report.modules.familyResults.metrics.ytdTotal, familyCurrency) },
            { label: "Siste måned", value: formatMoney(report.modules.familyResults.metrics.lastMonthTotal, familyCurrency) },
            { label: "Olivia net", value: formatMoney(report.modules.familyResults.metrics.oliviaNet, familyCurrency) },
            { label: "RealtyFlow net", value: formatMoney(report.modules.familyResults.metrics.realtyflowNet, familyCurrency) },
            { label: "Mondeo rente", value: formatMoney(report.modules.familyResults.metrics.mondeoInterest, familyCurrency) },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {report.schemas.map((schema) => (
          <SchemaPanel key={schema.id} schema={schema} />
        ))}
      </div>

      {report.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity size={18} />
              Neste tekniske steg
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {report.recommendations.map((recommendation) => (
                <div key={recommendation} className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-sm text-slate-300">
                  {recommendation}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
