import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarDays,
  FileText,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  MONDEO_BRAND_ID,
  MONDEO_CONTRACT,
  buildForwardPaymentPlan,
  buildMinimumPaymentsThrough,
  calculateMondeoSnapshot,
  formatDate,
  formatNok,
  formatPercent,
  summarizeMondeoLedgerEvents,
  type MondeoLedgerEvent,
} from "@/lib/mondeo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

async function getMondeoLedger() {
  const supabase = getSupabase();
  const warnings: string[] = [];
  let events: MondeoLedgerEvent[] = [];

  if (!supabase) {
    warnings.push("Supabase er ikke konfigurert i miljøvariablene, så siden viser kun kontraktsmodellen.");
  } else {
    const { data, error } = await supabase
      .from("business_financial_events")
      .select("id, stream, direction, status, amount, currency, event_date, description, source_type, metadata")
      .eq("brand_id", MONDEO_BRAND_ID)
      .order("event_date", { ascending: true });

    if (error) {
      warnings.push(`Kunne ikke lese business_financial_events for Mondeo: ${error.message}`);
    } else {
      events = (data || []) as MondeoLedgerEvent[];
    }
  }

  return { events, warnings };
}

function MetricCard({
  label,
  value,
  sub,
  tone = "white",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "white" | "green" | "amber" | "red" | "blue";
}) {
  const toneClass = {
    white: "text-white",
    green: "text-emerald-400",
    amber: "text-amber-400",
    red: "text-red-400",
    blue: "text-blue-400",
  }[tone];

  return (
    <Card className="border-slate-700/50 bg-slate-800/50">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function MondeoPage() {
  const asOf = new Date();
  const ledger = await getMondeoLedger();
  const ledgerSummary = summarizeMondeoLedgerEvents(ledger.events);
  const payments = ledgerSummary.payments;
  const kpiAdjustments = ledgerSummary.kpiAdjustments;
  const warnings = [...ledger.warnings];
  if (ledger.events.length > 0 && payments.length === 0 && kpiAdjustments.length === 0) {
    warnings.push("Fant Mondeo-rader i RealtyFlow-ledgeren, men ingen med stream=mondeo_payment eller stream=kpi_adjustment.");
  }

  const scheduledSnapshot = calculateMondeoSnapshot({
    asOf,
    payments: buildMinimumPaymentsThrough(asOf),
  });
  const actualSnapshot = payments.length > 0 || kpiAdjustments.length > 0
    ? calculateMondeoSnapshot({ asOf, payments, kpiAdjustments })
    : null;
  const activeSnapshot = actualSnapshot || scheduledSnapshot;
  const forwardPlan = buildForwardPaymentPlan(activeSnapshot.balance, new Date(activeSnapshot.nextDueDate), 12);
  const recentPayments = payments.slice(-8).reverse();
  const gapToMinimum = Math.max(0, activeSnapshot.totalMinimumDue - activeSnapshot.totalPaid);
  const monthlyInterestGap = activeSnapshot.currentMonthlyInterest - MONDEO_CONTRACT.monthlyMinimumNok;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Building2 className="text-primary-400" size={28} />
            Mondeo Eiendom AS
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Selgerkreditt, betalinger, rente, KPI og sikkerheter for Raveien 152E.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/business-overview">Business Overview</Link>
          </Button>
          <Button asChild>
            <Link href="/brands">Brand-innstillinger</Link>
          </Button>
        </div>
      </div>

      {warnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="flex gap-3 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="font-semibold">
                Viser kontraktsmodell til faktiske Mondeo-betalinger er registrert i RealtyFlow-ledger.
              </p>
              {warnings.map((warning) => <p key={warning} className="mt-1 text-amber-100/80">{warning}</p>)}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Brand: {MONDEO_BRAND_ID}</Badge>
                <Badge variant="secondary">Org.nr. {MONDEO_CONTRACT.orgNr}</Badge>
              </div>
              <h2 className="mt-3 text-xl font-bold text-white">{MONDEO_CONTRACT.propertyAddress}</h2>
              <p className="mt-1 text-sm text-slate-300">
                {MONDEO_CONTRACT.municipality}, {MONDEO_CONTRACT.cadastral}. Økonomisk virkning fra {formatDate(MONDEO_CONTRACT.effectiveDate)}.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 text-sm text-slate-300">
              <p><span className="text-slate-500">Selger:</span> {MONDEO_CONTRACT.seller}</p>
              <p className="mt-1"><span className="text-slate-500">Kjøper/debitor:</span> {MONDEO_CONTRACT.buyer}</p>
              <p className="mt-1 text-xs text-slate-500">Fødselsnummer/personnumre er bevisst ikke lagret i kildekoden.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <MetricCard label="Kjøpesum / selgerkreditt" value={formatNok(MONDEO_CONTRACT.sellerCreditNok)} sub="100 % aksjer" />
        <MetricCard label={actualSnapshot ? "Restgjeld faktisk" : "Restgjeld modell"} value={formatNok(activeSnapshot.balance)} sub={actualSnapshot ? "Fra ledger" : "Forutsatt min. betaling"} tone={activeSnapshot.needsSecurityFollowUp ? "red" : "white"} />
        <MetricCard label="Termin minimum" value={formatNok(MONDEO_CONTRACT.monthlyMinimumNok)} sub="Forfall hver 1. måned" tone="green" />
        <MetricCard label="Rente" value={formatPercent(MONDEO_CONTRACT.annualInterestRate)} sub={`${formatNok(activeSnapshot.currentMonthlyInterest)} / mnd nå`} tone="amber" />
        <MetricCard label="Betalt i RealtyFlow" value={formatNok(activeSnapshot.totalPaid)} sub={`${payments.length} registrerte betalinger`} tone={payments.length ? "green" : "amber"} />
        <MetricCard label="Avvik mot minimum" value={formatNok(gapToMinimum)} sub={`${activeSnapshot.monthsDue} terminer forfalt`} tone={gapToMinimum > 0 ? "red" : "green"} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote size={18} />
              Betalings- og rentestatus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-slate-800/40 p-3">
                <p className="text-[10px] uppercase text-slate-500">Neste forfall</p>
                <p className="mt-1 text-lg font-semibold text-white">{formatDate(activeSnapshot.nextDueDate)}</p>
                <p className="mt-1 text-xs text-slate-400">Neste kontraktsmessige termin.</p>
              </div>
              <div className="rounded-lg bg-slate-800/40 p-3">
                <p className="text-[10px] uppercase text-slate-500">Månedsrente vs termin</p>
                <p className={`mt-1 text-lg font-semibold ${monthlyInterestGap > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {monthlyInterestGap > 0 ? "+" : ""}{formatNok(monthlyInterestGap)}
                </p>
                <p className="mt-1 text-xs text-slate-400">Differanse mellom beregnet rente og kr 33 000.</p>
              </div>
              <div className="rounded-lg bg-slate-800/40 p-3">
                <p className="text-[10px] uppercase text-slate-500">Kapitalisert rente</p>
                <p className="mt-1 text-lg font-semibold text-amber-400">{formatNok(activeSnapshot.totalCapitalizedInterest)}</p>
                <p className="mt-1 text-xs text-slate-400">Basert på registrerte/forutsatte betalinger.</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-white">Overgang og KPI</p>
              <p className="mt-2 text-sm text-slate-300">
                Overgangsperioden er lagt inn til og med {formatDate(MONDEO_CONTRACT.transitionNoCapitalizationUntil)} med ingen kapitalisering av løpende renter utover kr 33 000 per måned. Ordinær rentemodell gjelder etter dette. Første KPI-kontroll ligger til {formatDate(MONDEO_CONTRACT.kpiFirstAdjustmentDate)}.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck size={18} />
              Sikkerhet og varsler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3">
              <span className="text-slate-400">Sikkerhetsgrense</span>
              <span className="font-semibold text-white">{formatNok(MONDEO_CONTRACT.securityLimitNok)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3">
              <span className="text-slate-400">Pant / kausjon</span>
              <span className="font-semibold text-white">{formatNok(MONDEO_CONTRACT.propertyMortgageNok)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3">
              <span className="text-slate-400">Kjøpers egeninnsats</span>
              <span className="font-semibold text-white">kr {MONDEO_CONTRACT.buyerInvestmentOutsidePurchasePriceNok}</span>
            </div>
            <div className={`rounded-lg border p-3 ${activeSnapshot.needsSecurityFollowUp ? "border-red-500/40 bg-red-500/10 text-red-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>
              {activeSnapshot.needsSecurityFollowUp
                ? "Restgjeld/modell er over sikkerhetsgrensen. Følg opp ekstra innbetaling, tilleggssikkerhet eller refinansiering."
                : "Restgjeld/modell er under den interne sikkerhetsgrensen."}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp size={18} />
            Neste 12 terminer etter dagens modell
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase text-slate-500">
                <tr className="border-b border-slate-700/60">
                  <th className="py-2 pr-3">Måned</th>
                  <th className="py-2 pr-3">Restgjeld start</th>
                  <th className="py-2 pr-3">Rente</th>
                  <th className="py-2 pr-3">Termin</th>
                  <th className="py-2 pr-3">Kapitalisering</th>
                  <th className="py-2 pr-3">Restgjeld slutt</th>
                </tr>
              </thead>
              <tbody>
                {forwardPlan.map((row) => (
                  <tr key={row.month} className="border-b border-slate-800/80 text-slate-300">
                    <td className="py-2 pr-3 font-medium text-white">{row.label}</td>
                    <td className="py-2 pr-3">{formatNok(row.openingBalance)}</td>
                    <td className="py-2 pr-3">{formatNok(row.interest)}</td>
                    <td className="py-2 pr-3 text-emerald-400">{formatNok(row.minimumDue)}</td>
                    <td className="py-2 pr-3 text-amber-400">{row.transitionProtected ? "Overgang" : formatNok(row.capitalizedInterest)}</td>
                    <td className="py-2 pr-3 font-medium text-white">{formatNok(row.closingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays size={18} />
              Siste registrerte betalinger
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Ingen faktiske betalinger er registrert i RealtyFlow-ledger for Mondeo ennå.
              </div>
            ) : (
              <div className="space-y-2">
                {recentPayments.map((payment, index) => (
                  <div key={`${payment.date}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-800/40 p-3 text-sm">
                    <div>
                      <p className="font-medium text-white">{formatDate(payment.date)}</p>
                      <p className="text-xs text-slate-500">{payment.note || payment.source}</p>
                    </div>
                    <p className="font-semibold text-emerald-400">{formatNok(payment.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText size={18} />
              Kontraktsdata som overvåkes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-300">
            {MONDEO_CONTRACT.notes.map((note) => (
              <div key={note} className="rounded-lg bg-slate-800/40 p-3">{note}</div>
            ))}
            <div className="rounded-lg bg-slate-800/40 p-3">
              Selgers kjente månedlige lånebelastning: {formatNok(MONDEO_CONTRACT.sellerMonthlyLoanLoadNok)}. Kommunale avgifter: {formatNok(MONDEO_CONTRACT.municipalFeesMonthlyNok)} per måned.
            </div>
            <div className="rounded-lg bg-slate-800/40 p-3">
              Betalinger leses fra <code>business_financial_events</code> med <code>stream=mondeo_payment</code>. KPI kan legges som <code>stream=kpi_adjustment</code>.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
