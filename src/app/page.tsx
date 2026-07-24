"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Users, TrendingUp, FileText,
  Eye, Zap, BarChart3, Bot, Globe, DollarSign, Target,
  Loader2, AlertTriangle, CheckCircle, XCircle, ArrowRight,
  Trash2, X, BriefcaseBusiness, Sprout, Music2, PlayCircle, MessageSquare,
  CalendarDays, Megaphone,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface DashboardContact {
  id?: string;
  pipeline_status?: string | null;
  pipeline_value?: number | null;
  interactions?: unknown[];
  notes?: string | null;
  brand?: string | null;
  source?: string | null;
}

async function fetchDashboardContacts() {
  try {
    const response = await fetch("/api/contacts?view=pipeline", { cache: "no-store" });
    if (!response.ok) {
      return { data: [], error: { message: `Contacts API returned ${response.status}` } };
    }

    const payload = await response.json().catch(() => ({}));
    return { data: (Array.isArray(payload.contacts) ? payload.contacts : []) as DashboardContact[], error: null };
  } catch (error) {
    return {
      data: [],
      error: { message: error instanceof Error ? error.message : "Contacts API request failed" },
    };
  }
}

interface SocialAccountSummary {
  brand?: string | null;
  platform?: string | null;
  is_active?: boolean | null;
}

interface AutomationErrorSummary {
  id: string;
  action?: string | null;
  agent_name?: string | null;
  details?: Record<string, string> | null;
  created_at?: string | null;
}

interface DashboardWorkItem {
  id: string;
  title?: string | null;
  description?: string | null;
  brand_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

async function fetchSocialAccountSummary() {
  try {
    const response = await fetch("/api/social-accounts/summary", { cache: "no-store" });
    if (!response.ok) {
      return { data: [], error: { message: `Social accounts summary returned ${response.status}` } };
    }

    const payload = await response.json().catch(() => ({}));
    return { data: (Array.isArray(payload.accounts) ? payload.accounts : []) as SocialAccountSummary[], error: null };
  } catch (error) {
    return {
      data: [],
      error: { message: error instanceof Error ? error.message : "Social accounts summary request failed" },
    };
  }
}

async function fetchAutomationErrorSummary() {
  try {
    const response = await fetch("/api/dashboard/automation-errors", { cache: "no-store" });
    if (!response.ok) {
      return { data: [], error: { message: `Automation errors returned ${response.status}` } };
    }

    const payload = await response.json().catch(() => ({}));
    return { data: (Array.isArray(payload.errors) ? payload.errors : []) as AutomationErrorSummary[], error: null };
  } catch (error) {
    return {
      data: [],
      error: { message: error instanceof Error ? error.message : "Automation errors request failed" },
    };
  }
}

async function fetchWebsiteLeadWorkItems() {
  try {
    const response = await fetch("/api/work-items?status=TO_DO&limit=50", { cache: "no-store" });
    if (!response.ok) {
      return { data: [], error: { message: `Work items API returned ${response.status}` } };
    }

    const payload = await response.json().catch(() => ({}));
    const rows = (Array.isArray(payload.work_items) ? payload.work_items : []) as DashboardWorkItem[];
    return { data: rows.filter((item) => item.source_type === "website_lead").slice(0, 5), error: null };
  } catch (error) {
    return {
      data: [],
      error: { message: error instanceof Error ? error.message : "Work items API request failed" },
    };
  }
}

interface DashboardStats {
  activeLeads: number;
  hotSignals: number;
  properties: number;
  plots: number;
  pipelineValue: string;
  pipelineValueRaw: number;
  publishedPosts: number;
  scheduledPosts: number;
  totalDrafts: number;
  failedPosts: number;
  aiAgents: number;
  connectedChannels: number;
  brandWorkspaces: BrandWorkspaceStats[];
  recentActivity: { type: string; text: string; time: string }[];
  alerts: { id: string; type: "error" | "warning" | "info"; title: string; detail: string; time: string; href?: string }[];
}

interface BrandWorkspaceStats {
  id: string;
  label: string;
  unit: string;
  description: string;
  href: string;
  leads: number;
  pipelineValue: number;
  drafts: number;
  scheduled: number;
  published: number;
  channels: string[];
  status: "operativ" | "mangler-kanaler" | "bygges";
  accent: string;
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

const BRAND_WORKSPACES = [
  {
    id: "zeneco",
    aliases: ["zeneco", "zenecohomes", "zen eco homes"],
    label: "ZenEcoHomes",
    unit: "Eiendom",
    description: "Nybygg, boligrådgivning, kjøperreise og Min side.",
    href: "/inventory",
    accent: "emerald",
  },
  {
    id: "soleada",
    aliases: ["soleada", "soleada.no"],
    label: "Soleada.no",
    unit: "Premium eiendom",
    description: "Skandinaviske kjøpere, Costa Blanca/Cálida, rådgivning og henvisningsavtaler.",
    href: "/pipeline",
    accent: "cyan",
  },
  {
    id: "pinosoecolife",
    aliases: ["pinosoecolife", "pinoso eco life"],
    label: "PinosoEcoLife",
    unit: "Tomter og livsstil",
    description: "Tomter, innland, eco living, finca og byggeprosess.",
    href: "/tomtebase",
    accent: "lime",
  },
  {
    id: "chatgenius",
    aliases: ["chatgenius", "chatgenius.pro"],
    label: "ChatGenius",
    unit: "SaaS",
    description: "AI-apper, automasjon, demoer, salgsbrev og B2B-pipeline.",
    href: "/saas",
    accent: "blue",
  },
  {
    id: "donaanna",
    aliases: ["donaanna", "donnaanna", "doña anna", "dona anna"],
    label: "Dona Anna",
    unit: "Oliven og gård",
    description: "Olivia, produkter, gårdsfortelling, B2B og nyhetsbrev.",
    href: "/content-hub",
    accent: "amber",
  },
  {
    id: "freddyb",
    aliases: ["freddyb", "freddybremseth", "freddy bremseth"],
    label: "FreddyBremseth",
    unit: "Personlig brand",
    description: "Tillit, artikler, rådgivning, bøker og overordnet profil.",
    href: "/brands",
    accent: "purple",
  },
  {
    id: "freddypublishing",
    aliases: ["freddypublishing", "freddy publishing", "kindle", "kdp", "amazon", "books", "boker", "bøker"],
    label: "Freddy Publishing",
    unit: "Bøker og KDP",
    description: "Kindle SEO, bokfunnels, metadata, annonser, reviews og nye bokideer.",
    href: "/content-hub",
    accent: "rose",
  },
  {
    id: "neuralbeat",
    aliases: ["remasterfreddy", "remaster", "neuralbeat", "re-master freddy"],
    label: "Re-Master Freddy",
    unit: "Musikk og YouTube",
    description: "YouTube, låter, publisering, statistikk og kampanjer.",
    href: "/neural-beat",
    accent: "red",
  },
];

function normalizeWorkspaceKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function formatEuroCompact(value: number) {
  if (!value) return "€0";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: value >= 1000000 ? "compact" : "standard",
  }).format(value);
}

function brandMatches(value: string | null | undefined, aliases: string[]) {
  const normalized = normalizeWorkspaceKey(value);
  return aliases.some((alias) => {
    const key = normalizeWorkspaceKey(alias);
    return normalized === key || normalized.includes(key);
  });
}

function getWorkspaceIcon(id: string) {
  if (id === "zeneco") return Building2;
  if (id === "soleada") return Building2;
  if (id === "pinosoecolife") return Sprout;
  if (id === "chatgenius") return MessageSquare;
  if (id === "donaanna") return Sprout;
  if (id === "freddypublishing") return FileText;
  if (id === "remasterfreddy") return Music2;
  if (id === "neuralbeat") return Music2;
  return BriefcaseBusiness;
}

function getAccentClasses(accent: string) {
  const map: Record<string, { border: string; bg: string; icon: string; text: string; chip: string }> = {
    emerald: {
      border: "border-emerald-500/25",
      bg: "bg-emerald-500/5",
      icon: "bg-emerald-500/15 text-emerald-300",
      text: "text-emerald-300",
      chip: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    },
    lime: {
      border: "border-lime-500/25",
      bg: "bg-lime-500/5",
      icon: "bg-lime-500/15 text-lime-300",
      text: "text-lime-300",
      chip: "border-lime-500/25 bg-lime-500/10 text-lime-300",
    },
    blue: {
      border: "border-blue-500/25",
      bg: "bg-blue-500/5",
      icon: "bg-blue-500/15 text-blue-300",
      text: "text-blue-300",
      chip: "border-blue-500/25 bg-blue-500/10 text-blue-300",
    },
    amber: {
      border: "border-amber-500/25",
      bg: "bg-amber-500/5",
      icon: "bg-amber-500/15 text-amber-300",
      text: "text-amber-300",
      chip: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    },
    purple: {
      border: "border-purple-500/25",
      bg: "bg-purple-500/5",
      icon: "bg-purple-500/15 text-purple-300",
      text: "text-purple-300",
      chip: "border-purple-500/25 bg-purple-500/10 text-purple-300",
    },
    red: {
      border: "border-red-500/25",
      bg: "bg-red-500/5",
      icon: "bg-red-500/15 text-red-300",
      text: "text-red-300",
      chip: "border-red-500/25 bg-red-500/10 text-red-300",
    },
    cyan: {
      border: "border-cyan-500/25",
      bg: "bg-cyan-500/5",
      icon: "bg-cyan-500/15 text-cyan-300",
      text: "text-cyan-300",
      chip: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
    },
    rose: {
      border: "border-rose-500/25",
      bg: "bg-rose-500/5",
      icon: "bg-rose-500/15 text-rose-300",
      text: "text-rose-300",
      chip: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    },
  };
  return map[accent] || map.blue;
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
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem("dashboard:dismissed-alerts") || "[]"));
    } catch {
      return new Set();
    }
  });

  function dismissAlert(id: string) {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(id);
      if (typeof window !== "undefined") {
        localStorage.setItem("dashboard:dismissed-alerts", JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }

  function dismissAllAlerts(ids: string[]) {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      if (typeof window !== "undefined") {
        localStorage.setItem("dashboard:dismissed-alerts", JSON.stringify(Array.from(next)));
      }
      return next;
    });
  }

  useEffect(() => {
    async function fetchStats() {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        // Fetch real data in parallel
        const [
          contactsRes,
          propertiesRes,
          plotsRes,
          pubsRes,
          scheduledRes,
          draftsRes,
          recentPubsRes,
          failedPubsRes,
          automationErrorsRes,
          contentByBrandRes,
          socialAccountsRes,
          websiteLeadTasksRes,
        ] = await Promise.all([
          fetchDashboardContacts(),
          supabase.from("properties").select("id", { count: "exact", head: true }),
          supabase.from("land_plots").select("id", { count: "exact", head: true }),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "published"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
          supabase.from("content_publications").select("id", { count: "exact", head: true }).eq("status", "draft"),
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
          fetchAutomationErrorSummary(),
          supabase.from("content_publications")
            .select("brand_id,status")
            .order("updated_at", { ascending: false })
            .limit(500),
          fetchSocialAccountSummary(),
          fetchWebsiteLeadWorkItems(),
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
          const updatedAt = pub.updated_at ? new Date(pub.updated_at) : new Date();
          const ageDays = (Date.now() - updatedAt.getTime()) / 86400000;
          const errorText = pub.last_publish_error || `${pub.publish_attempts || 0} forsøk mislyktes`;
          const nonActionable =
            /ingen plattformer valgt/i.test(errorText) ||
            /maks antall forsøk/i.test(errorText) ||
            ageDays > 14;
          if (nonActionable) continue;
          alerts.push({
            id: `publication:${pub.id}`,
            type: "error",
            title: `Publisering feilet: ${pub.title || 'Ukjent'}`,
            detail: errorText,
            time: getTimeAgo(updatedAt),
            href: "/content-hub",
          });
        }

        const autoErrors = automationErrorsRes.data || [];
        for (const err of autoErrors) {
          const details = err.details as Record<string, string> | null;
          const createdAt = err.created_at ? new Date(err.created_at) : new Date();
          const ageDays = (Date.now() - createdAt.getTime()) / 86400000;
          if (ageDays > 14) continue;
          alerts.push({
            id: `automation:${err.id}`,
            type: "warning",
            title: `${err.agent_name || 'System'}: ${err.action || 'Feil'}`,
            detail: details?.error || details?.message || 'Automatisering feilet',
            time: getTimeAgo(createdAt),
            href: "/automation",
          });
        }

        const websiteLeadTasks = websiteLeadTasksRes.data || [];
        for (const task of websiteLeadTasks) {
          const updatedAt = task.updated_at ? new Date(task.updated_at) : new Date();
          const ageDays = (Date.now() - updatedAt.getTime()) / 86400000;
          if (ageDays > 7) continue;
          alerts.push({
            id: `website-lead:${task.id}`,
            type: "info",
            title: task.title || "Ny lead fra nettsiden",
            detail: task.description || "Ny aktivitet fra ZenEcoHomes eller kundeportal.",
            time: getTimeAgo(updatedAt),
            href: "/pipeline",
          });
        }

        const activeContacts = (contactsRes.data || []) as DashboardContact[];
        const contentItems = contentByBrandRes.data || [];
        const socialAccounts = socialAccountsRes.data || [];
        const brandWorkspaces: BrandWorkspaceStats[] = BRAND_WORKSPACES.map((workspace) => {
          const leads = activeContacts.filter((contact) => {
            const brand = (contact as { brand?: string | null }).brand;
            const source = (contact as { source?: string | null }).source;
            return brandMatches(brand, workspace.aliases) || brandMatches(source, workspace.aliases);
          });
          const content = contentItems.filter((item) => brandMatches((item as { brand_id?: string | null }).brand_id, workspace.aliases));
          const channels = Array.from(
            new Set(
              socialAccounts
                .filter((account) => {
                  return account.is_active !== false && brandMatches(account.brand, workspace.aliases) && account.platform;
                })
                .map((account) => String(account.platform || "").toLowerCase()),
            ),
          ).sort();
          const pipelineValue = leads.reduce((sum, contact) => sum + (Number((contact as { pipeline_value?: number | null }).pipeline_value) || 0), 0);
          return {
            id: workspace.id,
            label: workspace.label,
            unit: workspace.unit,
            description: workspace.description,
            href: workspace.href,
            leads: leads.length,
            pipelineValue,
            drafts: content.filter((item) => (item as { status?: string }).status === "draft").length,
            scheduled: content.filter((item) => (item as { status?: string }).status === "scheduled").length,
            published: content.filter((item) => (item as { status?: string }).status === "published").length,
            channels,
            status: channels.length > 0 ? "operativ" : leads.length || content.length ? "mangler-kanaler" : "bygges",
            accent: workspace.accent,
          };
        });
        const pipelineValueRaw = activeContacts.reduce((sum, contact) => sum + (Number(contact.pipeline_value) || 0), 0);

        setStats({
          activeLeads: activeContacts.length || 0,
          hotSignals: activeContacts.filter((contact) => buyingSignalScore(contact) >= 70).length,
          properties: propertiesRes.count || 0,
          plots: plotsRes.count || 0,
          pipelineValue: formatEuroCompact(pipelineValueRaw),
          pipelineValueRaw,
          publishedPosts: pubsRes.count || 0,
          scheduledPosts: scheduledRes.count || 0,
          totalDrafts: draftsRes.count || 0,
          failedPosts: alerts.filter((alert) => alert.type === "error").length,
          aiAgents: 8,
          connectedChannels: socialAccounts.filter((account) => account.is_active !== false).length,
          brandWorkspaces,
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

  const visibleAlerts = (stats?.alerts || []).filter((alert) => !dismissedAlerts.has(alert.id));

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

          {/* BusinessFlow Mission Control */}
          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-300">
                  <BriefcaseBusiness size={14} />
                  BusinessFlow Mission Control
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Én intern portal for Freddy, med tydelige brand-workspaces og egne kundereiser.
                </p>
              </div>
              <a href="/brands" className="inline-flex items-center gap-2 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 hover:bg-orange-500/20">
                Åpne brands
                <ArrowRight size={12} />
              </a>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <Card className="border-orange-500/20 bg-orange-500/5 lg:col-span-1">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-orange-200/80">Master cockpit</p>
                      <p className="mt-2 text-2xl font-bold text-white">{stats?.pipelineValue || "€0"}</p>
                      <p className="mt-1 text-xs text-slate-400">Aktiv pipeline på tvers av brands</p>
                    </div>
                    <DollarSign className="text-orange-300 opacity-70" size={28} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
                      <p className="text-[10px] uppercase text-slate-500">Leads</p>
                      <p className="text-lg font-semibold text-white">{stats?.activeLeads || 0}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
                      <p className="text-[10px] uppercase text-slate-500">Kanaler</p>
                      <p className="text-lg font-semibold text-white">{stats?.connectedChannels || 0}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
                      <p className="text-[10px] uppercase text-slate-500">Planlagt</p>
                      <p className="text-lg font-semibold text-white">{stats?.scheduledPosts || 0}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
                      <p className="text-[10px] uppercase text-slate-500">Utkast</p>
                      <p className="text-lg font-semibold text-white">{stats?.totalDrafts || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-700/50 bg-slate-900/50 lg:col-span-3">
                <CardContent className="p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { label: "Brand", text: "Velg workspace, målgruppe og brand memory.", icon: Globe },
                      { label: "Innhold", text: "Lag artikkel, SoMe, YouTube, e-post eller dokument.", icon: FileText },
                      { label: "Godkjenning", text: "Victoria foreslår, du godkjenner før publisering.", icon: CheckCircle },
                      { label: "Publisering", text: "Send til nettside, SoMe, YouTube eller kundeportal.", icon: Megaphone },
                      { label: "Analyse", text: "Mål leads, reach, pipeline og neste beste handling.", icon: BarChart3 },
                      { label: "Oppfølging", text: "Lag oppgave, møte, melding eller automatisert sekvens.", icon: CalendarDays },
                    ].map((step, index) => (
                      <div key={step.label} className="rounded-lg border border-slate-700/40 bg-slate-950/35 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/15 text-[11px] font-semibold text-orange-200">
                            {index + 1}
                          </span>
                          <step.icon size={14} className="text-orange-300" />
                          <p className="text-sm font-medium text-white">{step.label}</p>
                        </div>
                        <p className="text-xs leading-5 text-slate-400">{step.text}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(stats?.brandWorkspaces || []).map((workspace) => {
                const Icon = getWorkspaceIcon(workspace.id);
                const accent = getAccentClasses(workspace.accent);
                return (
                  <a
                    key={workspace.id}
                    href={workspace.href}
                    className={`rounded-xl border ${accent.border} ${accent.bg} p-4 transition-colors hover:border-slate-500/60`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent.icon}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-white">{workspace.label}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${accent.chip}`}>
                              {workspace.unit}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-400">{workspace.description}</p>
                        </div>
                      </div>
                      <Badge
                        variant={workspace.status === "operativ" ? "success" : workspace.status === "mangler-kanaler" ? "warning" : "secondary"}
                        className="text-[9px]"
                      >
                        {workspace.status === "operativ" ? "Operativ" : workspace.status === "mangler-kanaler" ? "Koble kanaler" : "Bygges"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Leads</p>
                        <p className="text-sm font-semibold text-white">{workspace.leads}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Pipeline</p>
                        <p className="text-sm font-semibold text-white">{formatEuroCompact(workspace.pipelineValue)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Kø</p>
                        <p className="text-sm font-semibold text-white">{workspace.drafts + workspace.scheduled}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-slate-500">Kanaler</p>
                        <p className="text-sm font-semibold text-white">{workspace.channels.length}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {workspace.channels.length > 0 ? (
                        workspace.channels.map((channel) => (
                          <span key={channel} className="rounded-md border border-slate-700/50 bg-slate-950/40 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                            {channel}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-300">
                          Ingen aktive SoMe-kanaler
                        </span>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
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
          {visibleAlerts.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Varsler ({visibleAlerts.length})
                </h2>
                <button
                  type="button"
                  onClick={() => dismissAllAlerts(visibleAlerts.map((alert) => alert.id))}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:border-slate-500 hover:text-slate-200"
                >
                  <Trash2 size={12} />
                  Skjul alle
                </button>
              </div>
              <div className="space-y-2">
                {visibleAlerts.map((alert) => (
                  <a
                    key={alert.id}
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
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          dismissAlert(alert.id);
                        }}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                        title="Skjul varsel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Failed Posts Counter in KPIs */}
          {visibleAlerts.some((alert) => alert.type === "error") && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
              <XCircle size={20} className="text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-300">
                  {visibleAlerts.filter((alert) => alert.type === "error").length} publisering{visibleAlerts.filter((alert) => alert.type === "error").length > 1 ? 'er' : ''} trenger oppfølging
                </p>
                <p className="text-xs text-slate-400">Gamle og ikke-handlingsbare feil er skjult fra dashboardet.</p>
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
