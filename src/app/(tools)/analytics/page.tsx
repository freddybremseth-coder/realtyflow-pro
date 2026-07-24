"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BarChart3, TrendingUp, Users, Eye, Heart, DollarSign, Loader2, FileText, Calendar,
  ThumbsUp, MessageSquare, Share2, Youtube, Play, Sparkles, Target, Lightbulb,
  CheckCircle, AlertCircle, ArrowUpRight, ListMusic, Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

async function fetchLeadCount() {
  try {
    const response = await fetch("/api/leads", { cache: "no-store" });
    if (!response.ok) return 0;
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload.leads) ? payload.leads.length : 0;
  } catch {
    return 0;
  }
}

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

  // YouTube / Neural Beat analytics state
  const [ytLoading, setYtLoading] = useState(false);
  const [ytChannel, setYtChannel] = useState<{ title: string; subscriberCount: number; viewCount: number; videoCount: number } | null>(null);
  const [ytMetrics, setYtMetrics] = useState<{ totalViews: number; avgViews: number; engagementRate: number } | null>(null);
  const [ytTopVideos, setYtTopVideos] = useState<{ id: string; title: string; thumbnailUrl?: string; publishedAt: string; viewCount: number; likeCount: number; commentCount: number }[]>([]);
  const [ytFastest, setYtFastest] = useState<{ id: string; title: string; thumbnailUrl?: string; viewCount: number; viewsPerDay?: number }[]>([]);
  const [ytAnalysis, setYtAnalysis] = useState<any>(null);
  const [ytMixes, setYtMixes] = useState<any[]>([]);

  const fetchYouTubeAnalytics = () => {
    setYtLoading(true);
    fetch('/api/neural-beat/analytics')
      .then(r => r.json())
      .then(data => {
        if (data.channel) setYtChannel(data.channel);
        if (data.metrics) setYtMetrics(data.metrics);
        if (data.topVideos) setYtTopVideos(data.topVideos);
        if (data.fastestGrowing) setYtFastest(data.fastestGrowing);
        if (data.analysis) setYtAnalysis(data.analysis);
        if (data.mixes) setYtMixes(data.mixes);
      })
      .catch(err => console.error('YT analytics error:', err))
      .finally(() => setYtLoading(false));
  };

  useEffect(() => {
    async function fetchAnalytics() {
      const supabase = getSupabase();
      if (!supabase) { setLoading(false); return; }

      try {
        const [leadCount, propsRes, pubsRes, draftsRes, scheduledRes, allPubsRes] = await Promise.all([
          fetchLeadCount(),
          supabase.from("properties").select("id", { count: "exact", head: true }),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "published"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "draft"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
          supabase.from("content_publications").select("id, brand_id, tags, status, created_at, published_at").limit(500),
        ]);

        const leads = leadCount || 0;
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

      <Tabs defaultValue="realty" onValueChange={(val) => { if (val === 'youtube' && !ytChannel && !ytLoading) fetchYouTubeAnalytics(); }}>
        <TabsList>
          <TabsTrigger value="realty">Eiendom</TabsTrigger>
          <TabsTrigger value="content">Innhold & SoMe</TabsTrigger>
          <TabsTrigger value="engagement">SoMe Engasjement</TabsTrigger>
          <TabsTrigger value="cross">Innhold per Brand</TabsTrigger>
          <TabsTrigger value="youtube"><Youtube className="mr-1.5 h-3.5 w-3.5" />YouTube</TabsTrigger>
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
        <TabsContent value="youtube">
          {ytLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-red-500" />
              <p className="text-sm text-slate-400">{ytAnalysis === null && ytChannel ? 'AI analyserer kanalen...' : 'Henter YouTube-data...'}</p>
            </div>
          ) : ytChannel ? (
            <div className="space-y-4">
              {/* Channel + Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white flex items-center gap-2 text-base">
                      <Youtube className="h-5 w-5 text-red-400" />
                      {ytChannel.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-xl font-bold text-white">{ytChannel.subscriberCount.toLocaleString('nb-NO')}</div>
                        <div className="text-[10px] text-slate-400">Abonnenter</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-white">{ytChannel.viewCount.toLocaleString('nb-NO')}</div>
                        <div className="text-[10px] text-slate-400">Totale visninger</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-white">{ytChannel.videoCount.toLocaleString('nb-NO')}</div>
                        <div className="text-[10px] text-slate-400">Videoer</div>
                      </div>
                    </div>
                    {ytMetrics && (
                      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700">
                        <div className="text-center">
                          <div className="text-lg font-bold text-cyan-400">{ytMetrics.avgViews.toLocaleString('nb-NO')}</div>
                          <div className="text-[10px] text-slate-400">Snitt visninger</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-emerald-400">{ytMetrics.engagementRate}%</div>
                          <div className="text-[10px] text-slate-400">Engasjement</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-amber-400">{ytMetrics.totalViews.toLocaleString('nb-NO')}</div>
                          <div className="text-[10px] text-slate-400">Totalt (videoer)</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* AI Score */}
                {ytAnalysis?.overallScore > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white flex items-center gap-2 text-base">
                        <Sparkles className="h-5 w-5 text-amber-400" />AI Vurdering
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="relative w-20 h-20">
                          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#334155" strokeWidth="3" />
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none"
                              stroke={ytAnalysis.overallScore >= 70 ? '#10b981' : ytAnalysis.overallScore >= 40 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="3" strokeDasharray={`${ytAnalysis.overallScore}, 100`} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-bold text-white">{ytAnalysis.overallScore}</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-200 flex-1">{ytAnalysis.summary}</p>
                      </div>
                      {ytAnalysis.benchmarks && (
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between text-slate-400"><span>Nåværende vekst:</span><span className="text-white">{ytAnalysis.benchmarks.currentGrowthRate}</span></div>
                          <div className="flex justify-between text-slate-400"><span>Mål for 1M views:</span><span className="text-cyan-400">{ytAnalysis.benchmarks.targetGrowthRate}</span></div>
                          <div className="flex justify-between text-slate-400"><span>Neste milepæl:</span><span className="text-emerald-400">{ytAnalysis.benchmarks.estimatedTimeToMilestone}</span></div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Viral Strategy + Action Items */}
              {ytAnalysis?.viralStrategy && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-sm"><Target className="h-4 w-4 text-red-400" />Viral Strategi</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Tittelformler</h4>
                        {ytAnalysis.viralStrategy.titleFormulas?.map((f: string, i: number) => (
                          <p key={i} className="text-xs text-slate-400 pl-2 border-l-2 border-red-500/30 mb-1">{f}</p>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Opplastingsplan</h4>
                        <p className="text-xs text-cyan-400">{ytAnalysis.viralStrategy.uploadSchedule}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-300 mb-1">Trending Topics</h4>
                        <div className="flex flex-wrap gap-1">
                          {ytAnalysis.viralStrategy.trendingTopics?.map((t: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-amber-400" />Handlingsplan</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {ytAnalysis.strengths?.map((s: string, i: number) => (
                        <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5"><CheckCircle className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />{s}</p>
                      ))}
                      {ytAnalysis.weaknesses?.map((w: string, i: number) => (
                        <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5"><AlertCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />{w}</p>
                      ))}
                      {ytAnalysis.actionItems?.map((item: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-slate-700/30">
                          <Badge variant={item.priority === 'high' ? 'destructive' : item.priority === 'medium' ? 'warning' : 'secondary'} className="text-[9px] mt-0.5 shrink-0">
                            {item.priority === 'high' ? 'Høy' : item.priority === 'medium' ? 'Medium' : 'Lav'}
                          </Badge>
                          <div><p className="text-xs text-white">{item.action}</p><p className="text-[10px] text-slate-500">{item.expectedImpact}</p></div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Fastest Growing */}
              {ytFastest.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-emerald-400" />Raskest Voksende Videoer</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {ytFastest.map((v, i) => (
                        <div key={v.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-700/30">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="text-sm font-bold text-slate-500 w-5">{i + 1}</span>
                            {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-9 w-14 rounded object-cover shrink-0" /> : <div className="h-9 w-14 rounded bg-slate-700 flex items-center justify-center shrink-0"><Play className="h-3 w-3 text-slate-500" /></div>}
                            <h4 className="text-xs font-medium text-white truncate">{v.title}</h4>
                          </div>
                          <div className="flex items-center gap-3 text-xs shrink-0 ml-4">
                            <span className="flex items-center gap-1 text-emerald-400 font-semibold"><ArrowUpRight className="h-3 w-3" />{v.viewsPerDay?.toLocaleString('nb-NO') || '?'}/dag</span>
                            <span className="flex items-center gap-1 text-slate-400"><Eye className="h-3 w-3" />{v.viewCount.toLocaleString('nb-NO')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Mix Playlists */}
              {ytMixes.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-white flex items-center gap-2 text-sm"><ListMusic className="h-4 w-4 text-purple-400" />AI-foreslåtte Mix Spillelister</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {ytMixes.map((mix: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-slate-700/30 border border-slate-700/50">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-xl">{mix.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-white">{mix.title}</h4>
                              <p className="text-[10px] text-slate-400">{mix.targetAudience} · {mix.suggestedLength}</p>
                            </div>
                            <Badge variant={mix.viralPotential === 'high' ? 'destructive' : mix.viralPotential === 'medium' ? 'warning' : 'secondary'} className="text-[9px] shrink-0">
                              <Flame className="h-2.5 w-2.5 mr-0.5" />{mix.viralPotential === 'high' ? 'Høy' : mix.viralPotential === 'medium' ? 'Medium' : 'Lav'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-300 mb-2">{mix.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {mix.searchKeywords?.slice(0, 4).map((kw: string, j: number) => (
                              <Badge key={j} variant="outline" className="text-[9px]">{kw}</Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Refresh button if no AI analysis yet */}
              {!ytAnalysis && !ytLoading && (
                <div className="flex justify-center">
                  <Button onClick={fetchYouTubeAnalytics} className="gap-2"><Sparkles className="h-4 w-4" />Kjør AI-analyse av kanalen</Button>
                </div>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Youtube className="h-16 w-16 mx-auto mb-4 text-red-500/20" />
                <h3 className="text-lg font-semibold text-white mb-2">YouTube ikke konfigurert</h3>
                <p className="text-slate-400 text-sm">Konfigurer YouTube API-tilkobling for AI-drevet kanalanalyse.</p>
                <Button onClick={fetchYouTubeAnalytics} variant="outline" className="mt-4"><Sparkles className="mr-2 h-4 w-4" />Start AI-analyse</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
