"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BRANDS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eye,
  Gauge,
  Loader2,
  Mail,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

type GrowthMetrics = {
  impressions?: number;
  views?: number;
  clicks?: number;
  conversions?: number;
  engagement_rate?: number;
  shares?: number;
  leads_generated?: number;
};

type GrowthAction = {
  id: string;
  brand: string;
  brand_id?: string;
  action_type: string;
  platform: string;
  content: string;
  hypothesis?: string;
  expected_outcome?: string;
  priority: number;
  status: "planned" | "ready" | "published" | "completed" | "failed";
  metrics?: GrowthMetrics;
  score?: number;
  created_at: string;
  content_publication_id?: string | null;
  handed_off_at?: string | null;
  publication_status?: "draft" | "processing" | "published" | "scheduled" | "failed" | null;
  publication_tracking_url?: string | null;
  publication_published_at?: string | null;
  attributed_leads?: number;
  performance_score?: number | null;
  performance_confidence?: "low" | "medium" | "high" | null;
  has_automatic_results?: boolean;
};

type CommandCenter = {
  success: boolean;
  generatedAt?: string;
  actions: GrowthAction[];
  nextBest: GrowthAction[];
  performance: {
    impressions: number;
    reach: number;
    clicks: number;
    followersGained: number;
    messages: number;
    leads: number;
    meetings: number;
    sales: number;
    leadRate: number;
    salesRate: number;
  };
  pipeline: {
    activeActions: number;
    inContentHub: number;
    publishedLinked: number;
    publishedAwaitingResults: number;
    trackedActions: number;
    attributedLeads: number;
    contactsThisWeek: number;
    contactsLast30Days: number;
    cyclesRun: number;
  };
  warnings: string[];
};

type Toast = { id: number; message: string; type: "success" | "error" };

const EMPTY: CommandCenter = {
  success: true,
  actions: [],
  nextBest: [],
  performance: {
    impressions: 0,
    reach: 0,
    clicks: 0,
    followersGained: 0,
    messages: 0,
    leads: 0,
    meetings: 0,
    sales: 0,
    leadRate: 0,
    salesRate: 0,
  },
  pipeline: {
    activeActions: 0,
    inContentHub: 0,
    publishedLinked: 0,
    publishedAwaitingResults: 0,
    trackedActions: 0,
    attributedLeads: 0,
    contactsThisWeek: 0,
    contactsLast30Days: 0,
    cyclesRun: 0,
  },
  warnings: [],
};

function brandFor(id: string) {
  return BRANDS.find((brand) => brand.id === id);
}

function labelType(type: string) {
  const labels: Record<string, string> = {
    social_post: "SoMe-innlegg",
    lead_magnet: "Lead magnet",
    email_campaign: "E-postkampanje",
    ab_test: "A/B-test",
    viral_content: "Viral idé",
    engagement: "Engasjement",
    collaboration: "Samarbeid",
    seo_content: "SEO-innhold",
  };
  return labels[type] || type.replaceAll("_", " ");
}

function actionStageLabel(action: GrowthAction) {
  if (action.content_publication_id) {
    if (action.publication_status === "published") return primaryResult(action) ? "Publisert · målt" : "Publisert";
    if (action.publication_status === "scheduled") return "Planlagt i Content Hub";
    if (action.publication_status === "processing") return "Publiseres";
    if (action.publication_status === "failed") return "Publisering feilet";
    return "I Content Hub";
  }
  return {
    planned: "Planlagt",
    ready: "Klar",
    published: "Publisert (eldre flyt)",
    completed: "Målt",
    failed: "Feilet",
  }[action.status];
}

function primaryResult(action: GrowthAction) {
  if (action.attributed_leads) return `${action.attributed_leads} attribuerte leads`;
  if (action.metrics?.leads_generated) return `${action.metrics.leads_generated} leads`;
  if (action.metrics?.conversions) return `${action.metrics.conversions} konverteringer`;
  if (action.metrics?.clicks) return `${action.metrics.clicks} klikk`;
  if (action.metrics?.impressions || action.metrics?.views) return `${action.metrics.impressions || action.metrics.views} visninger`;
  return null;
}

export default function GrowthHubPage() {
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [data, setData] = useState<CommandCenter>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [runningCycle, setRunningCycle] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [metricsId, setMetricsId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({ impressions: "", clicks: "", conversions: "", leads: "" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAll, setShowAll] = useState(false);

  const toast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts((items) => [...items, { id, message, type }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = selectedBrand === "all" ? "" : `?brand=${encodeURIComponent(selectedBrand)}`;
      const response = await fetch(`/api/growth/command-center${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Kunne ikke laste Growth Hub");
      setData({ ...EMPTY, ...payload });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Kunne ikke laste Growth Hub", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedBrand, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCycle = async () => {
    setRunningCycle(true);
    try {
      const response = await fetch("/api/growth/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_cycle", brand: selectedBrand === "all" ? undefined : selectedBrand }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Vekstsyklus feilet");
      toast(`${(payload.actions || payload.results || []).length || "Nye"} veksthandlinger er klare.`);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Vekstsyklus feilet", "error");
    } finally {
      setRunningCycle(false);
    }
  };

  const sendToHub = async (action: GrowthAction) => {
    if (action.content_publication_id) {
      toast("Denne handlingen finnes allerede i Content Hub.", "error");
      return;
    }
    setPublishingId(action.id);
    try {
      const platform = String(action.platform || "").toLowerCase();
      const platforms = ["facebook", "instagram", "linkedin", "pinterest", "tiktok"].includes(platform)
        ? [platform]
        : ["facebook", "instagram", "linkedin"];
      const draftResponse = await fetch("/api/marketing-kit/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drafts: [{
            brand_id: action.brand_id || action.brand,
            content_type: action.action_type || "social_post",
            title: `${action.platform || "Kanal"} · ${labelType(action.action_type)}`,
            description: action.content,
            tags: [action.platform, action.action_type, "growth-engine", `growth-action:${action.id}`].filter(Boolean),
            scheduled_platforms: platforms,
            growth_action_id: action.id,
            performance_goal: "lead_rate",
            metadata: {
              platform,
              growth_action_id: action.id,
              hypothesis: action.hypothesis || null,
              expected_outcome: action.expected_outcome || null,
              action_type: action.action_type,
            },
          }],
        }),
      });
      const draft = await draftResponse.json().catch(() => ({}));
      const created = Array.isArray(draft.results) ? draft.results.find((item: any) => item?.success && item?.id) : null;
      if (!draftResponse.ok || draft.drafts_created === 0 || !created?.id) throw new Error(draft.error || "Kunne ikke opprette sporbar Content Hub-utkast");

      const update = await fetch("/api/growth/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: action.id,
          content_publication_id: created.id,
          handed_off_at: new Date().toISOString(),
        }),
      });
      const updated = await update.json().catch(() => ({}));
      if (!update.ok) throw new Error(updated.error || "Utkast opprettet, men Growth Action-koblingen kunne ikke lagres");
      toast("Sporbart utkast opprettet i Content Hub. Publisering skjer fortsatt separat.");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Kunne ikke sende til Hub", "error");
    } finally {
      setPublishingId(null);
    }
  };

  const saveMetrics = async () => {
    if (!metricsId) return;
    try {
      const response = await fetch("/api/growth/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: metricsId,
          status: "completed",
          metrics: {
            impressions: Number(metrics.impressions || 0),
            clicks: Number(metrics.clicks || 0),
            conversions: Number(metrics.conversions || 0),
            leads_generated: Number(metrics.leads || 0),
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Kunne ikke lagre resultater");
      toast("Resultater lagret. De inngår nå i læringssløyfen.");
      setMetricsId(null);
      setMetrics({ impressions: "", clicks: "", conversions: "", leads: "" });
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Kunne ikke lagre resultater", "error");
    }
  };

  const pendingMeasurement = useMemo(
    () => data.actions.filter((action) => action.content_publication_id && action.publication_status === "published" && !primaryResult(action)),
    [data.actions],
  );

  const visibleActions = showAll ? data.actions : data.actions.slice(0, 8);
  const topAction = data.nextBest[0];

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-24 sm:space-y-6 sm:pb-8">
      <div className="fixed right-3 top-3 z-[100] space-y-2 sm:right-5 sm:top-5">
        {toasts.map((item) => (
          <div key={item.id} className={`max-w-[calc(100vw-1.5rem)] rounded-xl border px-4 py-3 text-sm font-medium shadow-xl sm:max-w-sm ${item.type === "success" ? "border-emerald-400/30 bg-emerald-950 text-emerald-50" : "border-red-400/30 bg-red-950 text-red-50"}`}>
            <div className="flex items-start gap-2">{item.type === "success" ? <Check size={16} className="mt-0.5 shrink-0" /> : <X size={16} className="mt-0.5 shrink-0" />}<span>{item.message}</span></div>
          </div>
        ))}
      </div>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300"><Rocket size={15} /> Growth Hub</div>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Hva gir vekst nå?</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Prioriter handlingene som mest sannsynlig skaper klikk, leads, møter og salg — og mål hva som faktisk virker.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "mr-2 animate-spin" : "mr-2"} />Oppdater</Button>
          <Button onClick={runCycle} disabled={runningCycle}><Brain size={15} className="mr-2" />{runningCycle ? "Analyserer…" : "Kjør vekst-AI"}</Button>
        </div>
      </header>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={() => setSelectedBrand("all")} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${selectedBrand === "all" ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-400"}`}>Alle</button>
        {BRANDS.map((brand) => (
          <button key={brand.id} onClick={() => setSelectedBrand(brand.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${selectedBrand === brand.id ? "border-slate-500 bg-slate-800 text-white" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.color }} />{brand.name}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric title="Klikk" value={data.performance.clicks} icon={<MousePointerClick size={18} />} hint="siste 30 dager" />
        <Metric title="Leads" value={data.performance.leads || data.pipeline.contactsThisWeek} icon={<Users size={18} />} hint={data.pipeline.attributedLeads ? `${data.pipeline.attributedLeads} post-attribuert` : data.performance.leads ? `${data.performance.leadRate}% av trafikk` : `${data.pipeline.contactsThisWeek} nye kontakter siste uke`} />
        <Metric title="Møter" value={data.performance.meetings} icon={<MessageCircle size={18} />} hint="attribuert i Social Intelligence" />
        <Metric title="Salg" value={data.performance.sales} icon={<CircleDollarSign size={18} />} hint={data.performance.salesRate ? `${data.performance.salesRate}% av leads` : "mål og lær"} />
      </section>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="border-cyan-500/30 text-cyan-200">{data.pipeline.inContentHub} i Content Hub</Badge>
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">{data.pipeline.publishedLinked} publisert og koblet</Badge>
        <Badge variant="outline" className="border-violet-500/30 text-violet-200">{data.pipeline.attributedLeads} attribuerte leads</Badge>
      </div>

      {data.warnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex gap-3"><Gauge className="mt-0.5 shrink-0 text-amber-300" size={19} /><div><p className="font-semibold text-amber-100">Måling trenger oppfølging</p>{data.warnings.map((warning) => <p key={warning} className="mt-1 text-sm text-amber-100/70">{warning}</p>)}</div></div>
          </CardContent>
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Neste beste handling</p><h2 className="mt-1 text-xl font-bold text-white">Gjør dette først</h2></div>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">{data.pipeline.activeActions} aktive</Badge>
        </div>

        {loading ? (
          <Card><CardContent className="flex items-center justify-center p-10"><Loader2 className="animate-spin text-slate-400" /></CardContent></Card>
        ) : topAction ? (
          <ActionCard action={topAction} featured publishing={publishingId === topAction.id} onSend={() => void sendToHub(topAction)} onMeasure={() => setMetricsId(topAction.id)} />
        ) : (
          <Card className="border-slate-700"><CardContent className="p-6 text-center"><Target className="mx-auto text-slate-600" size={34} /><p className="mt-3 font-semibold text-white">Ingen klare veksthandlinger</p><p className="mt-1 text-sm text-slate-400">Kjør vekst-AI for å generere prioriterte handlinger.</p><Button onClick={runCycle} className="mt-4" disabled={runningCycle}><Sparkles size={15} className="mr-2" />Generer handlinger</Button></CardContent></Card>
        )}
      </section>

      {data.nextBest.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Deretter</h2>
          <div className="grid gap-3 lg:grid-cols-2">{data.nextBest.slice(1).map((action) => <ActionCard key={action.id} action={action} publishing={publishingId === action.id} onSend={() => void sendToHub(action)} onMeasure={() => setMetricsId(action.id)} />)}</div>
        </section>
      )}

      {pendingMeasurement.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Lukk læringssløyfen</p><h2 className="mt-1 text-lg font-semibold text-white">Hva skjedde etter publisering?</h2></div><Badge variant="outline" className="border-amber-500/30 text-amber-200">{pendingMeasurement.length}</Badge></div>
          <div className="space-y-2">{pendingMeasurement.slice(0, 4).map((action) => (
            <button key={action.id} onClick={() => setMetricsId(action.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left transition hover:border-amber-500/40">
              <BarChart3 size={18} className="shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{labelType(action.action_type)} · {brandFor(action.brand_id || action.brand)?.name || action.brand}</p><p className="mt-0.5 text-xs text-slate-500">Automatisk måling mangler ennå — legg inn kjente resultater</p></div><ChevronRight size={18} className="shrink-0 text-slate-500" />
            </button>
          ))}</div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Arbeidskø</p><h2 className="mt-1 text-lg font-semibold text-white">Alle handlinger</h2></div><Button size="sm" variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? "Vis færre" : "Vis alle"}</Button></div>
        <div className="space-y-2">{visibleActions.map((action) => {
          const brand = brandFor(action.brand_id || action.brand);
          const result = primaryResult(action);
          const canSend = !action.content_publication_id && ["planned", "ready"].includes(action.status);
          const canMeasure = action.content_publication_id && action.publication_status === "published" && !result;
          return <div key={action.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: brand?.color || "#22d3ee" }} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-white">{brand?.name || action.brand}</span><Badge variant="outline" className="text-[10px]">{labelType(action.action_type)}</Badge><span className="text-xs text-slate-500">{action.platform}</span></div><p className="mt-2 line-clamp-2 text-sm text-slate-300">{action.content}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>Prioritet {action.priority}/10</span><span>{actionStageLabel(action)}</span>{result && <span className="font-medium text-emerald-300">{result}</span>}{action.performance_score != null && <span>Effektscore {action.performance_score}/100</span>}</div></div>{canSend ? <Button size="sm" variant="outline" className="shrink-0" onClick={() => void sendToHub(action)} disabled={publishingId === action.id}>{publishingId === action.id ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}</Button> : canMeasure ? <Button size="sm" variant="outline" className="shrink-0" onClick={() => setMetricsId(action.id)}><BarChart3 size={14} /></Button> : null}</div></div>;
        })}</div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><Eye className="text-cyan-300" size={20} /><p className="mt-3 text-2xl font-bold text-white">{data.performance.impressions}</p><p className="text-xs text-slate-500">visninger målt</p></CardContent></Card>
        <Card><CardContent className="p-4"><TrendingUp className="text-emerald-300" size={20} /><p className="mt-3 text-2xl font-bold text-white">{data.performance.followersGained}</p><p className="text-xs text-slate-500">nye følgere</p></CardContent></Card>
        <Card><CardContent className="p-4"><Mail className="text-purple-300" size={20} /><p className="mt-3 text-2xl font-bold text-white">{data.performance.messages}</p><p className="text-xs text-slate-500">meldinger / henvendelser</p></CardContent></Card>
      </section>

      {metricsId && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onClick={() => setMetricsId(null)}>
          <Card className="w-full rounded-b-none border-slate-700 bg-slate-950 sm:max-w-lg sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
            <CardHeader><CardTitle>Registrer resultat</CardTitle><p className="text-sm text-slate-400">Bruk dette bare når automatisk kanal-/leadmåling mangler. Tallene inngår i læringssløyfen.</p></CardHeader>
            <CardContent className="space-y-4 pb-7"><div className="grid grid-cols-2 gap-3"><Field label="Visninger" value={metrics.impressions} onChange={(value) => setMetrics((m) => ({ ...m, impressions: value }))} /><Field label="Klikk" value={metrics.clicks} onChange={(value) => setMetrics((m) => ({ ...m, clicks: value }))} /><Field label="Leads" value={metrics.leads} onChange={(value) => setMetrics((m) => ({ ...m, leads: value }))} /><Field label="Konverteringer" value={metrics.conversions} onChange={(value) => setMetrics((m) => ({ ...m, conversions: value }))} /></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setMetricsId(null)}>Avbryt</Button><Button onClick={() => void saveMetrics()}><Check size={15} className="mr-2" />Lagre</Button></div></CardContent>
          </Card>
        </div>
      )}

      <div className="fixed bottom-3 left-3 right-3 z-40 sm:hidden"><Button className="h-12 w-full shadow-2xl" onClick={topAction ? () => void sendToHub(topAction) : runCycle} disabled={topAction ? publishingId === topAction.id : runningCycle}>{topAction ? <><Send size={16} className="mr-2" />Gjør neste handling</> : <><Brain size={16} className="mr-2" />Kjør vekst-AI</>}</Button></div>
    </div>
  );
}

function Metric({ title, value, hint, icon }: { title: string; value: number; hint: string; icon: React.ReactNode }) {
  return <Card className="border-slate-800 bg-slate-950/50"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><span className="text-cyan-300">{icon}</span></div><p className="mt-2 text-2xl font-bold text-white sm:text-3xl">{value}</p><p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{hint}</p></CardContent></Card>;
}

function ActionCard({ action, featured = false, publishing, onSend, onMeasure }: { action: GrowthAction; featured?: boolean; publishing: boolean; onSend: () => void; onMeasure: () => void }) {
  const brand = brandFor(action.brand_id || action.brand);
  const canSend = !action.content_publication_id && (action.status === "planned" || action.status === "ready");
  const canMeasure = !!action.content_publication_id && action.publication_status === "published" && !primaryResult(action);
  const result = primaryResult(action);
  return <Card className={featured ? "border-emerald-500/35 bg-gradient-to-br from-emerald-500/10 via-slate-950 to-cyan-500/5" : "border-slate-800 bg-slate-950/60"}><CardContent className={featured ? "p-5 sm:p-6" : "p-4 sm:p-5"}><div className="flex flex-wrap items-center gap-2"><Badge style={{ color: brand?.color, borderColor: `${brand?.color}55` }} variant="outline">{brand?.name || action.brand}</Badge><Badge variant="outline">{labelType(action.action_type)}</Badge><span className="text-xs text-slate-500">{action.platform}</span>{action.score != null && <span className="ml-auto text-xs font-semibold text-emerald-300">Score {action.score}</span>}</div><p className={`${featured ? "mt-4 text-base sm:text-lg" : "mt-3 text-sm"} font-medium leading-relaxed text-white`}>{action.content}</p>{action.expected_outcome && <div className="mt-4 rounded-lg bg-slate-900/70 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Forventet effekt</p><p className="mt-1 text-sm text-slate-300">{action.expected_outcome}</p></div>}<div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span>Prioritet {action.priority}/10</span><span>{actionStageLabel(action)}</span>{result && <span className="font-semibold text-emerald-300">{result}</span>}{action.performance_score != null && <span>Effektscore {action.performance_score}/100 · {action.performance_confidence}</span>}</div><div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">{canSend ? <Button onClick={onSend} disabled={publishing} className="w-full">{publishing ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Send size={15} className="mr-2" />}Send til Content Hub</Button> : canMeasure ? <Button onClick={onMeasure} className="w-full"><BarChart3 size={15} className="mr-2" />Registrer resultat</Button> : action.content_publication_id && action.publication_status !== "published" ? <Button variant="outline" disabled className="w-full"><Check size={15} className="mr-2" />I Content Hub</Button> : <Button variant="outline" disabled className="w-full"><Check size={15} className="mr-2" />Resultat koblet</Button>}<Badge variant="outline" className="justify-center py-2 text-xs">Ingen auto-publisering</Badge></div></CardContent></Card>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="space-y-1.5"><span className="text-xs font-medium text-slate-400">{label}</span><Input inputMode="numeric" type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0" /></label>;
}
