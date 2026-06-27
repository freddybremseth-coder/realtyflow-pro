"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRANDS } from "@/lib/constants";
import { SaasSubscriptionOverview } from "@/components/business/saas-subscription-overview";
import { Banknote, BarChart, FileText, Home, Leaf, Loader2, PieChart, RefreshCw, TrendingUp, Users } from "lucide-react";

type BrandData = {
  brandId: string;
  revenue: string;
  revenueAmount: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionPending: number;
  wonDeals: number;
  totalPosts: number;
  publishedPosts: number;
  pipelineLeads: number;
  crmContacts: number;
  growthActions: number;
  saasApps: number;
  saasMrr: number;
  saasRevenue: number;
  publishingRoyalties: number;
  oliviaRevenue: number;
  oliviaNetProfit: number;
  financialIncome: number;
  financialExpense: number;
  financialNet: number;
};

type OliviaData = {
  farmName: string;
  supabaseHost?: string | null;
  warnings?: string[];
  parcels: { count: number; totalTrees: number };
  financials: {
    totalRevenue: number;
    totalExpenses: number;
    totalSubsidies: number;
    netProfit: number;
    totalHarvestKg: number;
  };
};

const MONDEO_MONTHLY_INTEREST_NOK = 36_000;
const MONDEO_MIN_PAYMENT_NOK = 33_000;

function formatCurrency(value: number, currency = "EUR") {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function BusinessOverviewPage() {
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [brandDataMap, setBrandDataMap] = useState<Record<string, BrandData>>({});
  const [oliviaData, setOliviaData] = useState<OliviaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingFinance, setSyncingFinance] = useState(false);
  const [financeStatus, setFinanceStatus] = useState<string | null>(null);
  const [totals, setTotals] = useState({
    totalPosts: 0,
    publishedPosts: 0,
    totalBrands: BRANDS.length,
    pipelineLeads: 0,
    crmContacts: 0,
    saasApps: 0,
    saasMrr: 0,
    saasRevenue: 0,
    publishingRoyalties: 0,
    oliviaNetProfit: 0,
    financeEvents: 0,
    financialNet: 0,
  });

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business/overview", { cache: "no-store" });
      const data = await res.json();
      setBrandDataMap(data.brandDataMap || {});
      setTotals((prev) => ({ ...prev, ...(data.totals || {}) }));
      setOliviaData(data.oliviaData && !data.oliviaData.error ? (data.oliviaData as OliviaData) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  async function syncFinance() {
    setSyncingFinance(true);
    setFinanceStatus(null);
    try {
      const res = await fetch("/api/business/finance/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFinanceStatus(data.error || "Kunne ikke synke økonomi.");
        return;
      }
      setFinanceStatus(`${data.synced || 0} økonomihendelser synket.`);
      await fetchOverviewData();
    } catch (err) {
      setFinanceStatus(err instanceof Error ? err.message : "Kunne ikke synke økonomi.");
    } finally {
      setSyncingFinance(false);
    }
  }

  const brandsToShow = selectedBrand === "all" ? BRANDS : BRANDS.filter((brand) => brand.id === selectedBrand);
  const regularBrandData = Object.values(brandDataMap).filter((data) => data.brandId !== "mondeo");
  const mondeoData = brandDataMap.mondeo;
  const totalCommission = regularBrandData.reduce((sum, data) => sum + Number(data.commissionTotal || 0), 0);
  const totalPaid = regularBrandData.reduce((sum, data) => sum + Number(data.commissionPaid || 0), 0);
  const totalSales = regularBrandData.reduce((sum, data) => sum + Number(data.revenueAmount || 0), 0);
  const wonDeals = regularBrandData.reduce((sum, data) => sum + Number(data.wonDeals || 0), 0);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <PieChart className="text-primary-400" size={28} />
            Business Oversikt
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Lukket backend for admin, økonomi, CRM, SaaS, abonnement og endringer.
          </p>
        </div>
        <Button onClick={syncFinance} disabled={syncingFinance}>
          {syncingFinance ? <Loader2 className="mr-2 animate-spin" size={16} /> : <RefreshCw className="mr-2" size={16} />}
          Synk økonomi
        </Button>
      </div>

      {financeStatus && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {financeStatus}
        </div>
      )}

      {mondeoData && (
        <Card className="border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-amber-500/10">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <Home size={24} className="text-orange-400" />
              <div>
                <h2 className="text-lg font-bold text-white">Mondeo Eiendom AS — boligsalg og selgerkreditt</h2>
                <p className="text-xs text-slate-400">Salgsverdi, renter, KPI og innbetalinger. Ikke leads eller kommisjon.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Metric label="Salgsverdi bolig" value={mondeoData.revenue} />
              <Metric label="Månedlig rente" value={formatCurrency(MONDEO_MONTHLY_INTEREST_NOK, "NOK")} tone="amber" />
              <Metric label="Minimum betaling" value={formatCurrency(MONDEO_MIN_PAYMENT_NOK, "NOK")} tone="blue" />
              <Metric label="Mottatt / KPI" value={formatCurrency(Number(mondeoData.financialNet || 0), "NOK")} tone="green" />
            </div>
          </CardContent>
        </Card>
      )}

      <SaasSubscriptionOverview />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Brands" value={String(totals.totalBrands)} />
        <StatCard label="Totalt innlegg" value={Number(totals.totalPosts || 0).toLocaleString()} />
        <StatCard label="SaaS MRR" value={formatCurrency(Number(totals.saasMrr || 0), "NOK")} tone="green" />
        <StatCard label="Kommisjon" value={formatCurrency(totalCommission, "EUR")} tone="amber" />
        <StatCard label="CRM kunder" value={String(totals.crmContacts)} tone="blue" />
        <StatCard label="Olivia netto" value={formatCurrency(Number(totals.oliviaNetProfit || 0), "EUR")} tone={Number(totals.oliviaNetProfit || 0) >= 0 ? "green" : "red"} />
      </div>

      {(totalCommission > 0 || wonDeals > 0) && (
        <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-emerald-500/10">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <Banknote size={22} className="text-amber-400" />
              <h2 className="text-lg font-bold text-white">Inntektsoversikt — kommisjon og øvrige salg</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <Metric label="Total salgsverdi" value={formatCurrency(totalSales, "EUR")} />
              <Metric label="Total kommisjon" value={formatCurrency(totalCommission, "EUR")} tone="amber" />
              <Metric label="Utbetalt" value={formatCurrency(totalPaid, "EUR")} tone="green" />
              <Metric label="Ventende" value={formatCurrency(totalCommission - totalPaid, "EUR")} tone="orange" />
              <Metric label="Avsluttede salg" value={String(wonDeals)} />
            </div>
          </CardContent>
        </Card>
      )}

      {oliviaData && (
        <Card className="border-green-500/30 bg-gradient-to-r from-green-500/10 to-amber-500/10">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <Leaf size={22} className="text-green-400" />
              <h2 className="text-lg font-bold text-white">{oliviaData.farmName} — Gårdsdrift</h2>
              <Badge variant="secondary" className="ml-auto text-[10px]">Olivia</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
              <Metric label="Høstinntekter" value={formatCurrency(oliviaData.financials.totalRevenue, "EUR")} tone="green" />
              <Metric label="Subsidier" value={formatCurrency(oliviaData.financials.totalSubsidies, "EUR")} tone="blue" />
              <Metric label="Utgifter" value={formatCurrency(oliviaData.financials.totalExpenses, "EUR")} tone="red" />
              <Metric label="Netto resultat" value={formatCurrency(oliviaData.financials.netProfit, "EUR")} tone={oliviaData.financials.netProfit >= 0 ? "green" : "red"} />
              <Metric label="Parseller / trær" value={`${oliviaData.parcels.count} / ${oliviaData.parcels.totalTrees}`} />
              <Metric label="Total høst kg" value={oliviaData.financials.totalHarvestKg.toLocaleString()} tone="amber" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={selectedBrand === "all" ? "default" : "outline"} onClick={() => setSelectedBrand("all")}>Alle brands</Button>
        {BRANDS.map((brand) => (
          <Button key={brand.id} size="sm" variant={selectedBrand === brand.id ? "default" : "outline"} onClick={() => setSelectedBrand(brand.id)} style={selectedBrand === brand.id ? { backgroundColor: brand.color } : {}}>
            {brand.name}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart size={18} /> Brand-oversikt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {brandsToShow.map((brand) => {
              const data = brandDataMap[brand.id];
              if (!data) return null;
              return (
                <div key={brand.id} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: brand.color }} />
                    <div>
                      <p className="font-semibold text-white">{brand.name}</p>
                      <p className="text-xs text-slate-500">{brand.type}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniMetric icon={<TrendingUp size={15} />} label="Salgsverdi" value={data.revenue} />
                    <MiniMetric icon={<Users size={15} />} label="CRM" value={String(data.crmContacts)} />
                    <MiniMetric icon={<FileText size={15} />} label="Publisert" value={String(data.publishedPosts)} />
                    <MiniMetric icon={<Banknote size={15} />} label="Netto" value={brand.id === "mondeo" ? formatCurrency(data.financialNet, "NOK") : formatCurrency(data.financialNet, "EUR")} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function toneClass(tone?: string) {
  if (tone === "green") return "text-emerald-400";
  if (tone === "amber") return "text-amber-400";
  if (tone === "orange") return "text-orange-400";
  if (tone === "blue") return "text-blue-400";
  if (tone === "red") return "text-red-400";
  return "text-white";
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] uppercase text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${toneClass(tone)}`}>{value}</p>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="border-slate-700/50 bg-slate-800/50">
      <CardContent className="p-4 text-center">
        <p className={`text-2xl font-bold ${toneClass(tone)}`}>{value}</p>
        <p className="text-[10px] uppercase text-slate-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-800/50 p-3 text-center">
      <div className="mb-1 flex justify-center text-slate-400">{icon}</div>
      <p className="truncate text-sm font-semibold text-white">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
