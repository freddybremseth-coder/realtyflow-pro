"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Users, Eye, Heart, DollarSign, Loader2, FileText, Calendar, ThumbsUp, MessageSquare, Share2 } from "lucide-react";
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
  const [engagementTotals, setEngagementTotals] = useState({ likes: 0, comments: 0, shares: 0, views: 0, reach: 0, impressions: 0 });
  const [engagementPosts, setEngagementPosts] = useState<{
    id: string; title: string; brand: string; platform: string; published_at: string;
    likes: number; comments: number; shares: number; views: number; reach: number;
  }[]>([]);
  const [platformEngagement, setPlatformEngagement] = useState<{ platform: string; likes: number; comments: number; shares: number; views: number }[]>([]);

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

        // Fetch real SoMe engagement data
        const { data: pubsWithEngagement } = await supabase
          .from("content_publications")
          .select("id, title, brand_id, tags, published_at, total_likes, total_comments, total_shares, total_views")
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(50);

        const { data: snapshots } = await supabase
          .from("engagement_snapshots")
          .select("publication_id, platform, likes, comments, shares, reach, impressions")
          .order("snapshot_at", { ascending: false })
          .limit(500);

        // Aggregate snapshots by publication
        const snapByPub = new Map<string, { likes: number; comments: number; shares: number; reach: number; impressions: number }>();
        if (snapshots) {
          for (const snap of snapshots) {
            const existing = snapByPub.get(snap.publication_id);
            if (existing) {
              existing.likes += snap.likes || 0;
              existing.comments += snap.comments || 0;
              existing.shares += snap.shares || 0;
              existing.reach += snap.reach || 0;
              existing.impressions += snap.impressions || 0;
            } else {
              snapByPub.set(snap.publication_id, {
                likes: snap.likes || 0, comments: snap.comments || 0,
                shares: snap.shares || 0, reach: snap.reach || 0, impressions: snap.impressions || 0,
              });
            }
          }
        }

        if (pubsWithEngagement) {
          let tLikes = 0, tComments = 0, tShares = 0, tViews = 0, tReach = 0, tImpressions = 0;
          const platEng: Record<string, { likes: number; comments: number; shares: number; views: number }> = {};

          const posts = pubsWithEngagement.map((p) => {
            const snapData = snapByPub.get(p.id);
            const likes = (p.total_likes || 0) + (snapData?.likes || 0);
            const comments = (p.total_comments || 0) + (snapData?.comments || 0);
            const shares = (p.total_shares || 0) + (snapData?.shares || 0);
            const views = p.total_views || 0;
            const reach = snapData?.reach || 0;
            tLikes += likes; tComments += comments; tShares += shares; tViews += views; tReach += reach; tImpressions += (snapData?.impressions || 0);

            // Per-platform aggregation
            const platform = (p.tags && p.tags[0]?.toLowerCase()) || "annet";
            if (!platEng[platform]) platEng[platform] = { likes: 0, comments: 0, shares: 0, views: 0 };
            platEng[platform].likes += likes;
            platEng[platform].comments += comments;
            platEng[platform].shares += shares;
            platEng[platform].views += views;

            return {
              id: p.id,
              title: p.title || "Uten tittel",
              brand: p.brand_id,
              platform: (p.tags && p.tags[0]) || "-",
              published_at: p.published_at || "",
              likes, comments, shares, views, reach,
            };
          });
          setEngagementPosts(posts);
          setEngagementTotals({ likes: tLikes, comments: tComments, shares: tShares, views: tViews, reach: tReach, impressions: tImpressions });
          setPlatformEngagement(
            Object.entries(platEng)
              .map(([platform, data]) => ({ platform: platform.charAt(0).toUpperCase() + platform.slice(1), ...data }))
              .sort((a, b) => (b.likes + b.comments + b.shares) - (a.likes + a.comments + a.shares))
          );
        }
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
          <TabsTrigger value="engagement">SoMe Engasjement</TabsTrigger>
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

        <TabsContent value="engagement">
          <div className="space-y-6">
            {/* Engagement totals */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Visninger", value: engagementTotals.views, icon: Eye, color: "text-primary-400" },
                { label: "Likes", value: engagementTotals.likes, icon: ThumbsUp, color: "text-pink-400" },
                { label: "Kommentarer", value: engagementTotals.comments, icon: MessageSquare, color: "text-sky-400" },
                { label: "Delinger", value: engagementTotals.shares, icon: Share2, color: "text-emerald-400" },
                { label: "Rekkevidde", value: engagementTotals.reach, icon: TrendingUp, color: "text-amber-400" },
                { label: "Visningsrekkevidde", value: engagementTotals.impressions, icon: Eye, color: "text-purple-400" },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <Card key={m.label}>
                    <CardContent className="p-4 text-center">
                      <Icon size={20} className={`mx-auto ${m.color} mb-2`} />
                      <p className="text-2xl font-bold text-white">{m.value.toLocaleString("nb-NO")}</p>
                      <p className="text-xs text-slate-400">{m.label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Per-platform engagement breakdown */}
            <Card>
              <CardHeader><CardTitle>Engasjement per plattform</CardTitle></CardHeader>
              <CardContent>
                {platformEngagement.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={platformEngagement}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="platform" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }} />
                      <Legend />
                      <Bar dataKey="likes" fill="#ec4899" name="Likes" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="comments" fill="#06b6d4" name="Kommentarer" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="shares" fill="#10b981" name="Delinger" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-12">Ingen engasjementsdata enna. Publiser innlegg for a se data her.</p>
                )}
              </CardContent>
            </Card>

            {/* Engagement per post table */}
            <Card>
              <CardHeader><CardTitle>Engasjement per publisert innlegg</CardTitle></CardHeader>
              <CardContent>
                {engagementPosts.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">Ingen publiserte innlegg med engasjementsdata enna.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Tittel</th>
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Plattform</th>
                          <th className="text-left py-2 px-2 text-slate-400 font-medium">Publisert</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Visninger</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Likes</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Kommentarer</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Delinger</th>
                          <th className="text-right py-2 px-2 text-slate-400 font-medium">Rekkevidde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {engagementPosts.map((post) => (
                          <tr key={post.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                            <td className="py-2.5 px-2">
                              <p className="text-slate-200 truncate max-w-[200px]">{post.title}</p>
                              <p className="text-xs text-slate-500">{post.brand}</p>
                            </td>
                            <td className="py-2.5 px-2">
                              <Badge variant="outline" className="text-xs capitalize">{post.platform}</Badge>
                            </td>
                            <td className="py-2.5 px-2 text-slate-400 text-xs whitespace-nowrap">
                              {post.published_at ? new Date(post.published_at).toLocaleDateString("nb-NO") : "-"}
                            </td>
                            <td className="py-2.5 px-2 text-right text-slate-200">{post.views.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-pink-400">{post.likes.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-sky-400">{post.comments.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-emerald-400">{post.shares.toLocaleString("nb-NO")}</td>
                            <td className="py-2.5 px-2 text-right text-amber-400">{post.reach.toLocaleString("nb-NO")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
