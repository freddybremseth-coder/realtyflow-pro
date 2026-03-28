"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, Eye, Heart, DollarSign, Loader2, FileText, Calendar } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const CHART_COLORS = ["#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"];

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [realtyMetrics, setRealtyMetrics] = useState([
    { label: "Totale Leads", value: "0", change: "–", icon: Users },
    { label: "Eiendommer", value: "0", change: "–", icon: Eye },
    { label: "Publisert", value: "0", change: "–", icon: TrendingUp },
    { label: "Planlagt", value: "0", change: "–", icon: Calendar },
  ]);
  const [contentMetrics, setContentMetrics] = useState([
    { label: "Publiserte Innlegg", value: "0", change: "–", icon: Heart },
    { label: "Utkast", value: "0", change: "–", icon: FileText },
    { label: "Planlagte", value: "0", change: "–", icon: Calendar },
    { label: "Totalt innhold", value: "0", change: "–", icon: TrendingUp },
  ]);
  const [platformData, setPlatformData] = useState<{ platform: string; count: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; published: number; drafts: number }[]>([]);
  const [brandData, setBrandData] = useState<{ name: string; value: number; color: string }[]>([]);

  useEffect(() => {
    async function fetchAnalytics() {
      const supabase = getSupabase();
      if (!supabase) { setLoading(false); return; }

      try {
        const [leadsRes, propsRes, pubsRes, draftsRes, scheduledRes, allPubsRes] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }),
          supabase.from("properties").select("id", { count: "exact", head: true }),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "published"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "draft"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
          supabase.from("content_publications").select("id, brand_id, tags, status, created_at, published_at").limit(500),
        ]);

        const leads = leadsRes.count || 0;
        const props = propsRes.count || 0;
        const published = pubsRes.count || 0;
        const draftCount = draftsRes.count || 0;
        const scheduled = scheduledRes.count || 0;
        const total = published + draftCount + scheduled;
        const allPubs = allPubsRes.data || [];

        setRealtyMetrics([
          { label: "Totale Leads", value: String(leads), change: "–", icon: Users },
          { label: "Eiendommer", value: String(props), change: "–", icon: Eye },
          { label: "Publisert", value: String(published), change: "–", icon: TrendingUp },
          { label: "Planlagt", value: String(scheduled), change: "–", icon: Calendar },
        ]);

        setContentMetrics([
          { label: "Publiserte Innlegg", value: String(published), change: "–", icon: Heart },
          { label: "Utkast", value: String(draftCount), change: "–", icon: FileText },
          { label: "Planlagte", value: String(scheduled), change: "–", icon: Calendar },
          { label: "Totalt innhold", value: String(total), change: "–", icon: TrendingUp },
        ]);

        // Platform distribution from tags
        const platformCounts: Record<string, number> = {};
        for (const pub of allPubs) {
          const tags = pub.tags || [];
          for (const tag of tags) {
            const t = tag.toLowerCase();
            if (["instagram", "facebook", "linkedin", "youtube", "tiktok", "pinterest"].includes(t)) {
              platformCounts[t] = (platformCounts[t] || 0) + 1;
            }
          }
        }
        setPlatformData(
          Object.entries(platformCounts)
            .map(([platform, count]) => ({ platform: platform.charAt(0).toUpperCase() + platform.slice(1), count }))
            .sort((a, b) => b.count - a.count)
        );

        // Monthly data - last 6 months
        const months: { month: string; published: number; drafts: number }[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const monthStr = d.toLocaleDateString("nb-NO", { month: "short" });
          const year = d.getFullYear();
          const month = d.getMonth();
          const pubCount = allPubs.filter((p) => {
            const pd = new Date(p.published_at || p.created_at);
            return pd.getFullYear() === year && pd.getMonth() === month && p.status === "published";
          }).length;
          const draftC = allPubs.filter((p) => {
            const pd = new Date(p.created_at);
            return pd.getFullYear() === year && pd.getMonth() === month && p.status === "draft";
          }).length;
          months.push({ month: monthStr, published: pubCount, drafts: draftC });
        }
        setMonthlyData(months);

        // Brand distribution
        const brandCounts: Record<string, number> = {};
        for (const pub of allPubs) {
          if (pub.brand_id) {
            brandCounts[pub.brand_id] = (brandCounts[pub.brand_id] || 0) + 1;
          }
        }
        setBrandData(
          Object.entries(brandCounts)
            .map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] }))
            .sort((a, b) => b.value - a.value)
        );
      } catch (err) {
        console.error("Analytics fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <BarChart3 className="text-primary-400" size={28} />
          Analytics
        </h1>
        <p className="text-sm text-slate-400 mt-1">Samlet analytikk for eiendom og innhold</p>
      </div>

      <Tabs defaultValue="realty">
        <TabsList>
          <TabsTrigger value="realty">Eiendom</TabsTrigger>
          <TabsTrigger value="content">Innhold & SoMe</TabsTrigger>
          <TabsTrigger value="cross">Innhold per Brand</TabsTrigger>
        </TabsList>

        <TabsContent value="realty">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {realtyMetrics.map((m) => (
              <Card key={m.label}><CardContent className="p-4 flex items-center gap-3">
                <m.icon size={24} className="text-primary-400 opacity-60" />
                <div><p className="text-2xl font-bold text-white">{m.value}</p><p className="text-xs text-slate-400">{m.label}</p></div>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Innhold - Siste 6 Maneder</CardTitle></CardHeader>
            <CardContent>
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }} />
                    <Legend />
                    <Area type="monotone" dataKey="published" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} name="Publisert" />
                    <Area type="monotone" dataKey="drafts" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} name="Utkast" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500 text-center py-12">Ingen data ennå</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {contentMetrics.map((m) => (
              <Card key={m.label}><CardContent className="p-4 flex items-center gap-3">
                <m.icon size={24} className="text-purple-400 opacity-60" />
                <div><p className="text-2xl font-bold text-white">{m.value}</p><p className="text-xs text-slate-400">{m.label}</p></div>
              </CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Innhold per Plattform</CardTitle></CardHeader>
            <CardContent>
              {platformData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={platformData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="platform" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }} />
                    <Bar dataKey="count" fill="#8b5cf6" name="Antall innlegg" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500 text-center py-12">Ingen plattformdata ennå. Tag innlegg med plattformer i Content Studio.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cross">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Innhold per Brand</CardTitle></CardHeader>
              <CardContent>
                {brandData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={brandData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {brandData.map((entry) => (<Cell key={entry.name} fill={entry.color} />))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-12">Ingen data ennå</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Brand-fordeling</CardTitle></CardHeader>
              <CardContent>
                {brandData.length > 0 ? (
                  <div className="space-y-4">
                    {brandData.map((ch) => {
                      const maxVal = Math.max(...brandData.map((b) => b.value));
                      const pct = maxVal > 0 ? Math.round((ch.value / maxVal) * 100) : 0;
                      return (
                        <div key={ch.name}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-300">{ch.name}</span>
                            <span className="text-white font-medium">{ch.value} innlegg</span>
                          </div>
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: ch.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-12">Ingen data ennå</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
