"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRANDS } from "@/lib/constants";
import { createClient } from "@supabase/supabase-js";
import { PieChart, BarChart, TrendingUp, DollarSign, Users, Loader2, Banknote } from "lucide-react";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

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
}

export default function BusinessOverviewPage() {
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [brandDataMap, setBrandDataMap] = useState<Record<string, BrandData>>({});
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    totalPosts: 0,
    publishedPosts: 0,
    connectedAccounts: 0,
    totalBrands: BRANDS.length,
    pipelineLeads: 0,
    crmContacts: 0,
  });

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all data sources in parallel
      const supabase = getSupabase();

      const [contentRes, accountsRes, allContactsRes, actionsRes] = await Promise.allSettled([
        // Fetch content_publications directly from Supabase (not /api/content which queries wrong table)
        supabase
          ? supabase.from("content_publications").select("id, brand_id, status, created_at").order("created_at", { ascending: false }).limit(500).then(r => ({ publications: r.data || [] }))
          : Promise.resolve({ publications: [] }),
        fetch("/api/social-accounts").then(r => r.json()).catch(() => ({ accounts: [] })),
        // Fetch ALL contacts in a single call to avoid double-counting
        fetch("/api/contacts?view=pipeline").then(r => r.json()).catch(() => ({ contacts: [] })),
        fetch("/api/growth/actions").then(r => r.json()).catch(() => ({ actions: [] })),
      ]);

      const publications = contentRes.status === "fulfilled" ? (contentRes.value.publications || []) : [];
      const socialAccounts = accountsRes.status === "fulfilled" ? (accountsRes.value.accounts || []) : [];
      const allContacts: Record<string, unknown>[] = allContactsRes.status === "fulfilled" ? (allContactsRes.value.contacts || []) : [];
      const growthActions = actionsRes.status === "fulfilled" ? (actionsRes.value.actions || []) : [];

      // Derive pipeline and CRM views from single contacts list (no duplicates)
      const pipelineContacts = allContacts;
      const crmContacts = allContacts.filter((c) => c.pipeline_status !== "NEW");

      // Build per-brand data
      const newBrandData: Record<string, BrandData> = {};

      for (const brand of BRANDS) {
        const brandPosts = publications.filter((p: Record<string, unknown>) =>
          p.brand_id === brand.id || p.brand === brand.id
        );
        const brandPublished = brandPosts.filter((p: Record<string, unknown>) =>
          p.status === "published"
        );
        const brandAccounts = socialAccounts.filter((a: Record<string, unknown>) =>
          a.brand === brand.id || a.brand_id === brand.id
        );
        const brandPipeline = pipelineContacts.filter((c: Record<string, unknown>) =>
          c.brand_id === brand.id
        );
        const brandCrm = crmContacts.filter((c: Record<string, unknown>) =>
          c.brand_id === brand.id
        );
        const brandActions = growthActions.filter((a: Record<string, unknown>) =>
          a.brand === brand.id || a.brand_id === brand.id
        );

        // Calculate commission income from WON contacts (use allContacts directly, no duplicates)
        const uniqueWon = allContacts.filter((c: Record<string, unknown>) =>
          c.pipeline_status === "WON" && c.brand_id === brand.id
        );
        const commissionTotal = uniqueWon.reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
        const commissionPaid = uniqueWon.filter((c) => c.commission_paid_date).reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
        const saleTotal = uniqueWon.reduce((s, c) => s + (Number(c.sale_price) || 0), 0);

        newBrandData[brand.id] = {
          brandId: brand.id,
          revenue: saleTotal > 0 ? `€${saleTotal.toLocaleString()}` : "Ikke tilgjengelig",
          revenueAmount: saleTotal,
          commissionTotal,
          commissionPaid,
          commissionPending: commissionTotal - commissionPaid,
          wonDeals: uniqueWon.length,
          customers: brandCrm.length,
          totalPosts: brandPosts.length,
          publishedPosts: brandPublished.length,
          connectedAccounts: brandAccounts.length,
          pipelineLeads: brandPipeline.length,
          crmContacts: brandCrm.length,
          growthActions: brandActions.length,
        };
      }

      setBrandDataMap(newBrandData);

      setTotals({
        totalPosts: publications.length,
        publishedPosts: publications.filter((p: Record<string, unknown>) => p.status === "published").length,
        connectedAccounts: socialAccounts.length,
        totalBrands: BRANDS.length,
        pipelineLeads: pipelineContacts.length,
        crmContacts: crmContacts.length,
      });
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
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
