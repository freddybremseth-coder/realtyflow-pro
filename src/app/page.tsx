"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Users, TrendingUp, FileText,
  Eye, Zap, BarChart3, Bot, Globe, DollarSign, Target,
  Loader2, AlertTriangle, CheckCircle, XCircle, ArrowRight,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface DashboardStats {
  activeLeads: number;
  hotSignals: number;
  properties: number;
  plots: number;
  pipelineValue: string;
  publishedPosts: number;
  scheduledPosts: number;
  totalDrafts: number;
  failedPosts: number;
  aiAgents: number;
  recentActivity: { type: string; text: string; time: string }[];
  alerts: { type: "error" | "warning" | "info"; title: string; detail: string; time: string; href?: string }[];
}

interface DailyBrief {
  summary: string;
  top_priorities: {
    rank: number;
    id: string;
    title: string;
    description?: string;
    priority: string;
    source_type: string;
    next_action: string;
    ai_score: number;
    due_date?: string;
  }[];
  synthetic?: boolean;
  table_not_ready?: boolean;
}

function buyingSignalScore(contact: { interactions?: unknown[]; notes?: string | null; pipeline_status?: string | null; pipeline_value?: number | null }) {
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const haystack = `${contact.notes || ""} ${interactions.map((item: any) => item?.content || "").join(" ")}`.toLowerCase();
  let score = 20;
  if ((contact.pipeline_value || 0) > 0) score += 15;
  if (/kjøpssignal|oppdaterte ønsker|min side|favoritt|kalkulator|rapport|dokument/.test(haystack)) score += 35;
  if (/klar nå|innen 3 mnd|visning|reservasjon|budsjett til/.test(haystack)) score += 20;
  if (["VIEWING", "NEGOTIATION"].includes(contact.pipeline_status || "")) score += 20;
  return Math.min(100, score);
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        // Fetch real data in parallel
        const [contactsRes, propertiesRes, plotsRes, pubsRes, scheduledRes, draftsRes, failedRes, recentPubsRes, failedPubsRes, automationErrorsRes] = await Promise.all([
          supabase.from("contacts").select("id,pipeline_status,pipeline_value,interactions,notes").in("pipeline_status", ["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION"]),
          supabase.from("properties").select("id", { count: "exact", head: true }),
          supabase.from("land_plots").select("id", { count: "exact", head: true }),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "published"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "draft"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "failed"),
          supabase.from("content_publications")
            .select("title, status, brand_id, created_at, published_at, scheduled_at")
            .order("created_at", { ascending: false })
            .limit(6),
          // Failed publications with error details
          supabase.from("content_publications")
            .select("id, title, brand_id, last_publish_error, publish_attempts, updated_at")
            .eq("status", "failed")
            .order("updated_at", { ascending: false })
            .limit(5),
          // Recent automation errors
          supabase.from("automation_logs")
            .select("id, action, agent_name, details, created_at")
            .eq("status", "error")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        // Build recent activity from real data
        const recentActivity = (recentPubsRes.data || []).map((pub: Record<string, string>) => {
          const timeAgo = getTimeAgo(new Date(pub.published_at || pub.created_at));
          if (pub.status === "published") {
            return { type: "content", text: `Publisert: ${pub.title}`, time: timeAgo };
          } else if (pub.status === "scheduled") {
            return { type: "scheduled", text: `Planlagt: ${pub.title}`, time: timeAgo };
          } else {
            return { type: "draft", text: `Utkast: ${pub.title}`, time: timeAgo };
          }
        });

        // Build alerts from failed publishes and automation errors
        const alerts: DashboardStats["alerts"] = [];

        const failedPubs = failedPubsRes.data || [];
        for (const pub of failedPubs) {
          alerts.push({
            type: "error",
            title: `Publisering feilet: ${pub.title || 'Ukjent'}`,
            detail: pub.last_publish_error || `${pub.publish_attempts || 0} forsøk mislyktes`,
            time: getTimeAgo(new Date(pub.updated_at)),
            href: "/content-hub",
          });
        }

        const autoErrors = automationErrorsRes.data || [];
        for (const err of autoErrors) {
          const details = err.details as Record<string, string> | null;
          alerts.push({
            type: "warning",
            title: `${err.agent_name || 'System'}: ${err.action || 'Feil'}`,
            detail: details?.error || details?.message || 'Automatisering feilet',
            time: getTimeAgo(new Date(err.created_at)),
            href: "/automation",
          });
        }

        setStats({
          activeLeads: contactsRes.data?.length || 0,
          hotSignals: (contactsRes.data || []).filter((contact) => buyingSignalScore(contact) >= 70).length,
          properties: propertiesRes.count || 0,
          plots: plotsRes.count || 0,
          pipelineValue: "–",
          publishedPosts: pubsRes.count || 0,
          scheduledPosts: scheduledRes.count || 0,
          totalDrafts: draftsRes.count || 0,
          failedPosts: failedRes.count || 0,
          aiAgents: 8,
          recentActivity,
          alerts,
        });

        const briefRes = await fetch("/api/hub/daily-brief");
        if (briefRes.ok) {
          const briefData = await briefRes.json();
          setBrief(briefData);
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Operativ oversikt for leads, boliger, tomter, rapporter og kundeoppfølging
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
        <>
          {/* Daily AI Brief */}
          <div>
            <h2 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Bot size={14} />
              Dagens prioriterte handlinger
            </h2>
            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm text-slate-200">{brief?.summary || "Victoria samler dagens prioriteringer."}</p>
                    {brief?.table_not_ready && (
                      <p className="mt-2 text-xs text-amber-300">
                        Work items-tabellen må migreres for permanente oppgaver. Viser foreløpig smarte prioriteringer fra eksisterende data.
                      </p>
                    )}
                  </div>
                  <a href="/marketing-tasks" className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20">
                    Åpne oppgaver
                    <ArrowRight size={12} />
                  </a>
                </div>
                <div className="mt-4 grid gap-2">
                  {(brief?.top_priorities || []).slice(0, 7).map((item) => (
                    <a
                      key={item.id}
                      href={item.source_type === "content" ? "/content-hub" : item.source_type === "automation" ? "/automation" : item.source_type === "crm" ? "/pipeline" : "/marketing-tasks"}
                      className="flex items-start gap-3 rounded-lg border border-slate-700/40 bg-slate-900/60 p-3 transition-colors hover:border-cyan-500/30"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-semibold text-cyan-300">
                        {item.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white">{item.title}</p>
                          <Badge variant={item.priority === "CRITICAL" || item.priority === "HIGH" ? "destructive" : item.priority === "MEDIUM" ? "warning" : "secondary"} className="text-[9px]">
                            {item.priority}
                          </Badge>
                          <Badge variant="outline" className="text-[9px]">{item.source_type}</Badge>
                          <span className="text-[10px] text-slate-500">{item.ai_score}/100</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{item.next_action || item.description}</p>
                      </div>
                    </a>
                  ))}
                  {(!brief?.top_priorities || brief.top_priorities.length === 0) && (
                    <p className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3 text-sm text-slate-500">
                      Ingen prioriterte handlinger akkurat nå.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Realty KPIs */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Eiendom
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Aktive Leads", value: String(stats?.activeLeads || 0), icon: Users, color: "text-primary-400" },
                { label: "Eiendommer", value: String(stats?.properties || 0), icon: Building2, color: "text-emerald-400" },
                { label: "Tomter", value: String(stats?.plots || 0), icon: Globe, color: "text-cyan-400" },
                { label: "Varme kjøpssignal", value: String(stats?.hotSignals || 0), icon: TrendingUp, color: "text-amber-400" },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400">{stat.label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      </div>
                      <stat.icon className={`${stat.color} opacity-60`} size={28} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Content & Marketing KPIs */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Kundeinnhold
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Publiserte Innlegg", value: String(stats?.publishedPosts || 0), icon: FileText, color: "text-purple-400" },
                { label: "Planlagte Poster", value: String(stats?.scheduledPosts || 0), icon: Eye, color: "text-pink-400" },
                { label: "Utkast", value: String(stats?.totalDrafts || 0), icon: Zap, color: "text-amber-400" },
                { label: "AI Agenter Aktive", value: String(stats?.aiAgents || 0), icon: Bot, color: "text-emerald-400" },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400">{stat.label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      </div>
                      <stat.icon className={`${stat.color} opacity-60`} size={28} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Alerts & Notifications */}
          {(stats?.alerts?.length || 0) > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle size={14} />
                Varsler ({stats!.alerts.length})
              </h2>
              <div className="space-y-2">
                {stats!.alerts.map((alert, i) => (
                  <a
                    key={i}
                    href={alert.href || "#"}
                    className={`block p-3 rounded-lg border transition-colors ${
                      alert.type === "error"
                        ? "bg-red-500/10 border-red-500/30 hover:border-red-500/50"
                        : "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {alert.type === "error" ? (
                        <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200">{alert.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{alert.detail}</p>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{alert.time}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Failed Posts Counter in KPIs */}
          {(stats?.failedPosts || 0) > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
              <XCircle size={20} className="text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-300">{stats!.failedPosts} publisering{stats!.failedPosts > 1 ? 'er' : ''} har feilet</p>
                <p className="text-xs text-slate-400">Sjekk Content Hub for detaljer og prøv på nytt</p>
              </div>
              <a href="/content-hub" className="ml-auto text-xs text-red-400 hover:text-red-300 underline">Se detaljer</a>
            </div>
          )}

          {/* Recent Activity & Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Siste Aktivitet</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(stats?.recentActivity?.length || 0) > 0 ? (
                    stats!.recentActivity.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 ${
                            item.type === "content"
                              ? "bg-emerald-400"
                              : item.type === "scheduled"
                              ? "bg-amber-400"
                              : "bg-slate-400"
                          }`}
                        />
                        <div className="flex-1">
                          <p className="text-slate-200">{item.text}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.time}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Ingen aktivitet ennå</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hurtighandlinger</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Ny Lead", href: "/pipeline", icon: Users, color: "bg-primary-500/20 text-primary-300" },
                    { label: "Se Eiendommer", href: "/inventory", icon: Building2, color: "bg-emerald-500/20 text-emerald-300" },
                    { label: "Tomter", href: "/tomtebase", icon: Globe, color: "bg-cyan-500/20 text-cyan-300" },
                    { label: "Dokumenter", href: "/document-hub", icon: FileText, color: "bg-amber-500/20 text-amber-300" },
                    { label: "Markedsrapport", href: "/reports", icon: Target, color: "bg-pink-500/20 text-pink-300" },
                    { label: "AI Agenter", href: "/agents", icon: Bot, color: "bg-purple-500/20 text-purple-300" },
                  ].map((action) => (
                    <a
                      key={action.label}
                      href={action.href}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-slate-600 transition-colors"
                    >
                      <div className={`w-9 h-9 rounded-lg ${action.color} flex items-center justify-center`}>
                        <action.icon size={16} />
                      </div>
                      <span className="text-sm text-slate-200">{action.label}</span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Nå";
  if (diffMin < 60) return `${diffMin}m siden`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}t siden`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d siden`;
  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}
