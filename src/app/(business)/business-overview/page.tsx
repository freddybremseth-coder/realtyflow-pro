"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRANDS } from "@/lib/constants";
import { PieChart, BarChart, TrendingUp, DollarSign, Users, Loader2, Banknote, Leaf } from "lucide-react";

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
}

interface OliviaData {
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
  });

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

  const brandsToShow = selectedBrand === "all" ? BRANDS : BRANDS.filter((b) => b.id === selectedBrand);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <PieChart className="text-primary-400" size={28} />
          Business Oversikt
        </h1>
        <p className="text-sm text-slate-400 mt-1">Samlet ytelse og analyse per brand (sanntidsdata)</p>
      </div>

      {/* Commission Income Banner */}
      {(() => {
        const allCommission = Object.values(brandDataMap).reduce((s, d) => s + d.commissionTotal, 0);
        const allPaid = Object.values(brandDataMap).reduce((s, d) => s + d.commissionPaid, 0);
        const allPending = allCommission - allPaid;
        const allRevenue = Object.values(brandDataMap).reduce((s, d) => s + d.revenueAmount, 0);
        const totalWon = Object.values(brandDataMap).reduce((s, d) => s + d.wonDeals, 0);
        if (allCommission <= 0 && totalWon <= 0) return null;
        return (
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-emerald-500/10">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Banknote size={22} className="text-amber-400" />
                <h2 className="text-lg font-bold text-white">Inntektsoversikt</h2>
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
            {/* Expense breakdown */}
            {Object.keys(oliviaData.expensesByCategory).length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-700/50">
                <p className="text-[10px] text-slate-500 uppercase mb-2">Utgifter per kategori</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(oliviaData.expensesByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 6)
                    .map(([cat, amount]) => (
                      <div key={cat} className="bg-slate-800/50 rounded-lg px-3 py-1.5">
                        <span className="text-xs text-slate-300">{cat}</span>
                        <span className="text-xs text-slate-400 ml-2">€{amount.toLocaleString()}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
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
            <p className="text-2xl font-bold text-emerald-400">{totals.publishedPosts}</p>
            <p className="text-[10px] text-slate-500 uppercase">Publisert</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{totals.connectedAccounts}</p>
            <p className="text-[10px] text-slate-500 uppercase">Sosiale kontoer</p>
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
        <Button size="sm" variant={selectedBrand === "all" ? "default" : "outline"} onClick={() => setSelectedBrand("all")}>
          Alle brands
        </Button>
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
              {BRANDS.map((brand) => {
                const data = brandDataMap[brand.id];
                if (!data) return null;
                const maxPosts = Math.max(...BRANDS.map(b => brandDataMap[b.id]?.totalPosts || 0), 1);
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
          return (
            <Card key={brand.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                    style={{ backgroundColor: brand.color + "33", color: brand.color }}
                  >
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
                {/* KPIs */}
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
                    {data.commissionPending > 0 && (
                      <p className="text-[9px] text-orange-400 mt-0.5">€{data.commissionPending.toLocaleString()} ventende</p>
                    )}
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

                {/* Additional KPIs */}
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
