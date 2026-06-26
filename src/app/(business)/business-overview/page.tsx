"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRANDS } from "@/lib/constants";
import { PieChart, BarChart, TrendingUp, DollarSign, Users, Loader2, Banknote, Leaf, RefreshCw, Home } from "lucide-react";

interface BrandData {
  brandId: string;
  revenue: string;
  revenueAmount: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionPending: number;
  wonDeals: number;
  customers: number;
  totalPosts: number;
  publishedPosts: number;
  connectedAccounts: number;
  pipelineLeads: number;
  crmContacts: number;
  growthActions: number;
  saasApps: number;
  saasMrr: number;
  saasRevenue: number;
  publishingBooks: number;
  publishingOrders: number;
  publishingRoyalties: number;
  oliviaRevenue: number;
  oliviaNetProfit: number;
  financialIncome: number;
  financialExpense: number;
  financialNet: number;
}

interface OliviaData {
  supabaseHost?: string | null;
  configuredSeparateOliviaDb?: boolean;
  warnings?: string[];
  farmName: string;
  currency: string;
  parcels: { count: number; totalArea: number; totalTrees: number };
  financials: {
    totalRevenue: number;
    totalExpenses: number;
    totalSubsidies: number;
    netProfit: number;
    totalHarvestKg: number;
    harvestCount: number;
  };
  expensesByCategory: Record<string, number>;
  harvestsBySeason: Record<string, { kg: number; revenue: number }>;
}

const MONDEO_MONTHLY_INTEREST_NOK = 36_000;
const MONDEO_MIN_PAYMENT_NOK = 33_000;

function formatNok(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function BusinessOverviewPage() {
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [brandDataMap, setBrandDataMap] = useState<Record<string, BrandData>>({});
  const [loading, setLoading] = useState(true);
  const [oliviaData, setOliviaData] = useState<OliviaData | null>(null);
  const [totals, setTotals] = useState({
    totalPosts: 0,
    publishedPosts: 0,
    connectedAccounts: 0,
    totalBrands: BRANDS.length,
    pipelineLeads: 0,
    crmContacts: 0,
    saasApps: 0,
    saasMrr: 0,
    saasRevenue: 0,
    publishingBooks: 0,
    publishingOrders: 0,
    publishingRoyalties: 0,
    oliviaRevenue: 0,
    oliviaNetProfit: 0,
    financeEvents: 0,
    financialIncome: 0,
    financialExpense: 0,
    financialNet: 0,
  });
  const [syncingFinance, setSyncingFinance] = useState(false);
  const [financeStatus, setFinanceStatus] = useState<string | null>(null);

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business/overview", { cache: "no-store" });
      const data = await res.json();
      setBrandDataMap(data.brandDataMap || {});
      setTotals((prev) => ({ ...prev, ...(data.totals || {}) }));
      setOliviaData(data.oliviaData && !data.oliviaData.error ? data.oliviaData as OliviaData : null);
    } catch {
      // If all fetches fail, leave everything at 0
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
      const warnings = Array.isArray(data.warnings) && data.warnings.length > 0 ? ` Varsler: ${data.warnings.join(" | ")}` : "";
      setFinanceStatus(`${data.synced || 0} økonomihendelser synket.${warnings}`);
      await fetchOverviewData();
    } catch (err) {
      setFinanceStatus(err instanceof Error ? err.message : "Kunne ikke synke økonomi.");
    } finally {
      setSyncingFinance(false);
    }
  }

  const brandsToShow = selectedBrand === "all" ? BRANDS : BRANDS.filter((b) => b.id === selectedBrand);
  const contentBrands = BRANDS.filter((brand) => brand.id !== "mondeo");
  const regularBrandData = Object.values(brandDataMap).filter((data) => data.brandId !== "mondeo");
  const mondeoData = brandDataMap.mondeo;
  const mondeoReceivedNok = Number(mondeoData?.financialIncome || 0);
  const mondeoNetNok = Number(mondeoData?.financialNet || 0);
  const nonMondeoFinancialNet = regularBrandData.reduce((sum, data) => sum + Number(data.financialNet || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <PieChart className="text-primary-400" size={28} />
            Business Oversikt
          </h1>
          <p className="text-sm text-slate-400 mt-1">Samlet ytelse og analyse per businessområde</p>
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="flex items-center gap-3">
                <Home size={24} className="text-orange-400" />
                <div>
                  <h2 className="text-lg font-bold text-white">Mondeo Eiendom AS — boligsalg og selgerkreditt</h2>
                  <p className="text-xs text-slate-400">Ikke leads eller kommisjon. Dette er salgsverdi, renter, KPI og innbetalinger.</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedBrand("mondeo")}>Se Mondeo</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Salgsverdi bolig</p>
                <p className="text-2xl font-bold text-white">{mondeoData.revenue}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Månedlig renteinntekt</p>
                <p className="text-2xl font-bold text-amber-400">{formatNok(MONDEO_MONTHLY_INTEREST_NOK)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Minimum innbetaling</p>
                <p className="text-2xl font-bold text-blue-400">{formatNok(MONDEO_MIN_PAYMENT_NOK)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Mottatt / KPI fra Family</p>
                <p className="text-2xl font-bold text-emerald-400">{formatNok(mondeoReceivedNok)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Betalinger registreres i Family og speiles til RealtyFlow. Business Overview viser huset som salgsverdi og rente-/betalingsinntekt, ikke som pipeline.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Commission Income Banner - excludes Mondeo because Mondeo is not commission/pipeline */}
      {(() => {
        const allCommission = regularBrandData.reduce((s, d) => s + d.commissionTotal, 0);
        const allPaid = regularBrandData.reduce((s, d) => s + d.commissionPaid, 0);
        const allPending = allCommission - allPaid;
        const allRevenue = regularBrandData.reduce((s, d) => s + d.revenueAmount, 0);
        const totalWon = regularBrandData.reduce((s, d) => s + d.wonDeals, 0);
        if (allCommission <= 0 && totalWon <= 0) return null;
        return (
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-emerald-500/10">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Banknote size={22} className="text-amber-400" />
                <h2 className="text-lg font-bold text-white">Inntektsoversikt — kommisjon og øvrige salg</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Total salgsverdi</p>
                  <p className="text-xl font-bold text-white">€{allRevenue.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Total kommisjon</p>
                  <p className="text-xl font-bold text-amber-400">€{allCommission.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Utbetalt</p>
                  <p className="text-xl font-bold text-emerald-400">€{allPaid.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Ventende</p>
                  <p className="text-xl font-bold text-orange-400">€{allPending.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Avsluttede salg</p>
                  <p className="text-xl font-bold text-white">{totalWon}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Olivia / DonaAnna Farm Overview */}
      {oliviaData && (
        <Card className="border-green-500/30 bg-gradient-to-r from-green-500/10 to-amber-500/10">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <Leaf size={22} className="text-green-400" />
              <h2 className="text-lg font-bold text-white">{oliviaData.farmName} — Gårdsdrift</h2>
              <Badge variant="secondary" className="text-[10px] ml-auto">Olivia</Badge>
            </div>
            {oliviaData.warnings && oliviaData.warnings.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="font-medium">Olivia har Supabase-kontakt, men mangler forventede tabeller/data.</p>
                <p className="mt-1 text-amber-100/80">
                  Host: {oliviaData.supabaseHost || "ukjent"}. Kjør <code>20260507135000_remaster_olivia_foundation.sql</code>, eller sett <code>OLIVIA_SUPABASE_URL</code> og <code>OLIVIA_SUPABASE_KEY</code> til riktig Olivia-prosjekt i Vercel.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Høstinntekter</p>
                <p className="text-xl font-bold text-emerald-400">€{oliviaData.financials.totalRevenue.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Subsidier</p>
                <p className="text-xl font-bold text-blue-400">€{oliviaData.financials.totalSubsidies.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Utgifter</p>
                <p className="text-xl font-bold text-red-400">€{oliviaData.financials.totalExpenses.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Netto resultat</p>
                <p className={`text-xl font-bold ${oliviaData.financials.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  €{oliviaData.financials.netProfit.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Parseller / Trær</p>
                <p className="text-xl font-bold text-white">
                  {oliviaData.parcels.count} <span className="text-sm text-slate-400">/ {oliviaData.parcels.totalTrees}</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase mb-1">Total høst (kg)</p>
                <p className="text-xl font-bold text-amber-400">{oliviaData.financials.totalHarvestKg.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {mondeoData && (
          <Card className="border-orange-500/30 bg-orange-500/10">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-300">{mondeoData.revenue}</p>
              <p className="text-[10px] text-slate-500 uppercase">Mondeo salgsverdi</p>
            </CardContent>
          </Card>
        )}
        {mondeoData && (
          <Card className="border-slate-700/50 bg-slate-800/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{formatNok(mondeoNetNok)}</p>
              <p className="text-[10px] text-slate-500 uppercase">Mondeo mottatt/KPI</p>
            </CardContent>
          </Card>
        )}
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${Number(nonMondeoFinancialNet || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              €{Number(nonMondeoFinancialNet || 0).toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 uppercase">Økonomi netto øvrig</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-white">{totals.totalBrands}</p>
            <p className="text-[10px] text-slate-500 uppercase">Brands</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-white">{totals.totalPosts}</p>
            <p className="text-[10px] text-slate-500 uppercase">Totalt innlegg</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-white">{Number(totals.financeEvents || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500 uppercase">Økonomihendelser</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{totals.pipelineLeads}</p>
            <p className="text-[10px] text-slate-500 uppercase">Pipeline leads</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-400">{totals.crmContacts}</p>
            <p className="text-[10px] text-slate-500 uppercase">CRM kunder</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-cyan-400">${Number(totals.saasMrr || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500 uppercase">ChatGenius MRR</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-rose-400">${Number(totals.publishingRoyalties || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500 uppercase">KDP royalties</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${Number(totals.oliviaNetProfit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              €{Number(totals.oliviaNetProfit || 0).toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500 uppercase">Olivia netto</p>
          </CardContent>
        </Card>
      </div>

      {/* Brand Selector */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={selectedBrand === "all" ? "default" : "outline"} onClick={() => setSelectedBrand("all")}>Alle brands</Button>
        {BRANDS.map((brand) => (
          <Button
            key={brand.id}
            size="sm"
            variant={selectedBrand === brand.id ? "default" : "outline"}
            onClick={() => setSelectedBrand(brand.id)}
            style={selectedBrand === brand.id ? { backgroundColor: brand.color } : {}}
          >
            {brand.name}
          </Button>
        ))}
      </div>

      {/* Comparative Overview (only when "all" is selected) */}
      {selectedBrand === "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart size={18} />
              Sammenlignende oversikt - Innlegg per brand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {contentBrands.map((brand) => {
                const data = brandDataMap[brand.id];
                if (!data) return null;
                const maxPosts = Math.max(...contentBrands.map(b => brandDataMap[b.id]?.totalPosts || 0), 1);
                const barWidth = (data.totalPosts / maxPosts) * 100;
                return (
                  <div key={brand.id} className="flex items-center gap-3">
                    <div className="w-32 shrink-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{brand.name}</p>
                    </div>
                    <div className="flex-1 bg-slate-800 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pr-2 text-[10px] font-medium text-white transition-all"
                        style={{ width: `${Math.max(barWidth, 5)}%`, backgroundColor: brand.color }}
                      >
                        {data.totalPosts} innlegg
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{data.publishedPosts} pub.</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Brand Sections */}
      <div className="grid grid-cols-1 gap-6">
        {brandsToShow.map((brand) => {
          const data = brandDataMap[brand.id];
          if (!data) return null;

          if (brand.id === "mondeo") {
            return (
              <Card key={brand.id} className="border-orange-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: brand.color + "33", color: brand.color }}>
                      ME
                    </div>
                    <div>
                      <CardTitle className="text-base">Mondeo Eiendom AS</CardTitle>
                      <p className="text-xs text-slate-500">Boligsalg, selgerkreditt, renter, KPI og innbetalinger</p>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-[10px]">boligsalg</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <Home size={16} className="mx-auto text-orange-400 mb-1" />
                      <p className="text-lg font-bold text-white">{data.revenue}</p>
                      <p className="text-[10px] text-slate-500">Salgsverdi bolig</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <Banknote size={16} className="mx-auto text-amber-400 mb-1" />
                      <p className="text-lg font-bold text-amber-400">{formatNok(MONDEO_MONTHLY_INTEREST_NOK)}</p>
                      <p className="text-[10px] text-slate-500">Månedlig rente</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <TrendingUp size={16} className="mx-auto text-blue-400 mb-1" />
                      <p className="text-lg font-bold text-blue-400">{formatNok(MONDEO_MIN_PAYMENT_NOK)}</p>
                      <p className="text-[10px] text-slate-500">Minimum betaling</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                      <PieChart size={16} className="mx-auto text-emerald-400 mb-1" />
                      <p className="text-lg font-bold text-emerald-400">{formatNok(data.financialNet)}</p>
                      <p className="text-[10px] text-slate-500">Mottatt / KPI</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 text-xs text-orange-100">
                    Mondeo er ikke med i leads, CRM-kunder eller kommisjon. Innbetalinger skal fortsatt registreres i Family og speiles automatisk hit.
                  </div>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={brand.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: brand.color + "33", color: brand.color }}>
                    {brand.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <CardTitle className="text-base">{brand.name}</CardTitle>
                    <p className="text-xs text-slate-500">{brand.description}</p>
                  </div>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{brand.type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <DollarSign size={16} className="mx-auto text-emerald-400 mb-1" />
                    <p className="text-lg font-bold text-white">{data.revenue}</p>
                    <p className="text-[10px] text-slate-500">Salgsverdi</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <Banknote size={16} className="mx-auto text-amber-400 mb-1" />
                    <p className="text-lg font-bold text-amber-400">€{data.commissionTotal.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">Kommisjon</p>
                    {data.commissionPending > 0 && <p className="text-[9px] text-orange-400 mt-0.5">€{data.commissionPending.toLocaleString()} ventende</p>}
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <Users size={16} className="mx-auto text-blue-400 mb-1" />
                    <p className="text-lg font-bold text-white">{data.crmContacts}</p>
                    <p className="text-[10px] text-slate-500">Kunder (CRM)</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <TrendingUp size={16} className="mx-auto text-cyan-400 mb-1" />
                    <p className="text-lg font-bold text-white">{data.pipelineLeads}</p>
                    <p className="text-[10px] text-slate-500">Pipeline leads</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <PieChart size={16} className="mx-auto text-purple-400 mb-1" />
                    <p className="text-lg font-bold text-white">{data.wonDeals}</p>
                    <p className="text-[10px] text-slate-500">Avsluttede salg</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                    <span className="text-xs text-slate-400">Totalt innlegg</span>
                    <span className="text-sm font-medium text-white">{data.totalPosts}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                    <span className="text-xs text-slate-400">Publiserte innlegg</span>
                    <span className="text-sm font-medium text-emerald-400">{data.publishedPosts}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                    <span className="text-xs text-slate-400">Veksthandlinger</span>
                    <span className="text-sm font-medium text-cyan-400">{data.growthActions}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                    <span className="text-xs text-slate-400">Økonomi netto</span>
                    <span className={`text-sm font-medium ${Number(data.financialNet || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      €{Number(data.financialNet || 0).toLocaleString()}
                    </span>
                  </div>
                  {brand.id === "chatgenius" && (
                    <>
                      <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <span className="text-xs text-slate-400">SaaS apps</span>
                        <span className="text-sm font-medium text-cyan-400">{data.saasApps}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <span className="text-xs text-slate-400">MRR</span>
                        <span className="text-sm font-medium text-emerald-400">${Number(data.saasMrr || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {brand.id === "freddypublishing" && (
                    <>
                      <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <span className="text-xs text-slate-400">Bøker</span>
                        <span className="text-sm font-medium text-rose-400">{data.publishingBooks}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <span className="text-xs text-slate-400">KDP royalties</span>
                        <span className="text-sm font-medium text-emerald-400">${Number(data.publishingRoyalties || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {brand.id === "donaanna" && (
                    <>
                      <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <span className="text-xs text-slate-400">Olivia inntekt</span>
                        <span className="text-sm font-medium text-emerald-400">€{Number(data.oliviaRevenue || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg">
                        <span className="text-xs text-slate-400">Olivia netto</span>
                        <span className={`text-sm font-medium ${Number(data.oliviaNetProfit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          €{Number(data.oliviaNetProfit || 0).toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
