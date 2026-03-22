"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BRANDS } from "@/lib/constants";
import {
  Rocket, Target, Zap, Brain, TrendingUp, BarChart3, Sparkles,
  Plus, Play, Check, X, Crown, Split, Lightbulb, ChevronRight,
  Loader2, Star, Eye, Send, RefreshCw, Pause, ToggleLeft, ToggleRight,
  FileText, Mail, Globe, Instagram, Linkedin, Youtube, Twitter, Music,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GrowthAction {
  id: string;
  brand_id: string;
  action_type: string;
  platform: string;
  content: string;
  status: "planned" | "ready" | "published" | "completed";
  priority: number;
  metrics?: Record<string, number>;
  created_at: string;
}

interface LeadMagnet {
  id: string;
  brand_id: string;
  title: string;
  type: string;
  description: string;
  landing_page_copy?: string;
  cta?: string;
  email_sequence?: string[];
  status: "active" | "paused" | "draft";
  conversion_rate?: number;
  created_at: string;
}

interface ABTest {
  id: string;
  brand_id: string;
  content_type: string;
  variant_a: string;
  variant_b: string;
  metrics_a?: Record<string, number>;
  metrics_b?: Record<string, number>;
  winner?: "a" | "b" | null;
  status: "running" | "completed" | "draft";
  created_at: string;
}

interface Insight {
  id: string;
  type: "improvement" | "decline" | "recommendation" | "trend";
  title: string;
  description: string;
  brand_id?: string;
  icon: string;
  metric?: string;
  change?: number;
}

interface BrandStrategy {
  brand_id: string;
  followers: number;
  target_followers: number;
  focus_areas: string[];
  weekly_actions: string[];
  performance_score: number;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const platformIcon = (platform: string) => {
  switch (platform?.toLowerCase()) {
    case "instagram": return <Instagram size={14} />;
    case "linkedin": return <Linkedin size={14} />;
    case "youtube": return <Youtube size={14} />;
    case "twitter": case "x": return <Twitter size={14} />;
    case "tiktok": return <Music size={14} />;
    case "facebook": return <Globe size={14} />;
    case "email": return <Mail size={14} />;
    case "blog": return <FileText size={14} />;
    default: return <Globe size={14} />;
  }
};

const statusColors: Record<string, { bg: string; text: string; variant: "default" | "secondary" | "outline" | "success" | "warning" }> = {
  planned: { bg: "bg-blue-500/20", text: "text-blue-300", variant: "outline" },
  ready: { bg: "bg-amber-500/20", text: "text-amber-300", variant: "warning" },
  published: { bg: "bg-emerald-500/20", text: "text-emerald-300", variant: "success" },
  completed: { bg: "bg-cyan-500/20", text: "text-cyan-300", variant: "default" },
  active: { bg: "bg-emerald-500/20", text: "text-emerald-300", variant: "success" },
  paused: { bg: "bg-slate-500/20", text: "text-slate-300", variant: "secondary" },
  draft: { bg: "bg-slate-500/20", text: "text-slate-400", variant: "secondary" },
  running: { bg: "bg-amber-500/20", text: "text-amber-300", variant: "warning" },
};

const getBrand = (id: string) => BRANDS.find((b) => b.id === id);

const priorityStars = (n: number) => Array.from({ length: 5 }, (_, i) => (
  <Star key={i} size={12} className={i < n ? "text-amber-400 fill-amber-400" : "text-slate-600"} />
));

// ─── Component ───────────────────────────────────────────────────────────────

export default function GrowthHubPage() {
  // State
  const [activeTab, setActiveTab] = useState("vekst-ai");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastCounter = 0;

  // Data states
  const [actions, setActions] = useState<GrowthAction[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [abTests, setABTests] = useState<ABTest[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [strategies, setStrategies] = useState<BrandStrategy[]>([]);

  // Loading states
  const [loadingCycle, setLoadingCycle] = useState(false);
  const [loadingActions, setLoadingActions] = useState(false);
  const [loadingLeadMagnets, setLoadingLeadMagnets] = useState(false);
  const [loadingABTest, setLoadingABTest] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [generatingLeadMagnet, setGeneratingLeadMagnet] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({ activeActions: 0, leadsThisWeek: 0, growthRate: 0, cyclesRun: 0 });

  // Modal states
  const [showMetricsModal, setShowMetricsModal] = useState<string | null>(null);
  const [metricsInput, setMetricsInput] = useState({ views: "", clicks: "", conversions: "" });
  const [showABTestModal, setShowABTestModal] = useState(false);
  const [abTestForm, setABTestForm] = useState({ brand_id: BRANDS[0].id, content_type: "social_post" });

  // Toast helper
  const addToast = useCallback((message: string, type: "success" | "error") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ─── API Calls ─────────────────────────────────────────────────────────────

  const fetchActions = useCallback(async () => {
    setLoadingActions(true);
    try {
      const res = await fetch("/api/growth/actions" + (selectedBrand !== "all" ? `?brand_id=${selectedBrand}` : ""));
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions || data || []);
        const activeCount = (data.actions || data || []).filter((a: GrowthAction) => ["planned", "ready"].includes(a.status)).length;
        setStats((s) => ({ ...s, activeActions: activeCount }));
      }
    } catch {
      // silently handle
    } finally {
      setLoadingActions(false);
    }
  }, [selectedBrand]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/growth/stats");
      if (res.ok) {
        const data = await res.json();
        setStats((s) => ({ ...s, ...data }));
      }
    } catch {
      // silently handle
    }
  }, []);

  const fetchLeadMagnets = useCallback(async () => {
    setLoadingLeadMagnets(true);
    try {
      const res = await fetch("/api/growth/lead-magnets" + (selectedBrand !== "all" ? `?brand_id=${selectedBrand}` : ""));
      if (res.ok) {
        const data = await res.json();
        setLeadMagnets(data.lead_magnets || data || []);
      }
    } catch {
      // silently handle
    } finally {
      setLoadingLeadMagnets(false);
    }
  }, [selectedBrand]);

  const fetchABTests = useCallback(async () => {
    setLoadingABTest(true);
    try {
      const res = await fetch("/api/growth/ab-tests" + (selectedBrand !== "all" ? `?brand_id=${selectedBrand}` : ""));
      if (res.ok) {
        const data = await res.json();
        setABTests(data.tests || data || []);
      }
    } catch {
      // silently handle
    } finally {
      setLoadingABTest(false);
    }
  }, [selectedBrand]);

  const fetchStrategies = useCallback(async () => {
    setLoadingStrategies(true);
    try {
      const res = await fetch("/api/growth/engine");
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || data || []);
      }
    } catch {
      // silently handle
    } finally {
      setLoadingStrategies(false);
    }
  }, []);

  // Load data on mount and brand change
  useEffect(() => {
    fetchActions();
    fetchStats();
  }, [fetchActions, fetchStats]);

  useEffect(() => {
    if (activeTab === "lead-magnets") fetchLeadMagnets();
    if (activeTab === "ab-testing") fetchABTests();
    if (activeTab === "strategi") fetchStrategies();
  }, [activeTab, fetchLeadMagnets, fetchABTests, fetchStrategies]);

  // ─── Action Handlers ──────────────────────────────────────────────────────

  const runGrowthCycle = async () => {
    setLoadingCycle(true);
    try {
      const res = await fetch("/api/growth/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_cycle", brand_id: selectedBrand !== "all" ? selectedBrand : undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        const newActions = data.actions || data.results || [];
        setActions((prev) => [...newActions, ...prev]);
        setStats((s) => ({ ...s, cyclesRun: s.cyclesRun + 1, activeActions: s.activeActions + newActions.length }));
        addToast(`Vekstsyklus fullfort! ${newActions.length} nye handlinger generert.`, "success");
      } else {
        addToast("Feil ved kjoring av vekstsyklus.", "error");
      }
    } catch {
      addToast("Nettverksfeil. Prov igjen.", "error");
    } finally {
      setLoadingCycle(false);
    }
  };

  const publishAction = async (actionId: string) => {
    try {
      const res = await fetch(`/api/growth/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });
      if (res.ok) {
        setActions((prev) => prev.map((a) => a.id === actionId ? { ...a, status: "published" as const } : a));
        addToast("Handling publisert!", "success");
      }
    } catch {
      addToast("Kunne ikke publisere.", "error");
    }
  };

  const addMetrics = async (actionId: string) => {
    try {
      const res = await fetch(`/api/growth/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          metrics: {
            views: parseInt(metricsInput.views) || 0,
            clicks: parseInt(metricsInput.clicks) || 0,
            conversions: parseInt(metricsInput.conversions) || 0,
          },
        }),
      });
      if (res.ok) {
        setActions((prev) => prev.map((a) => a.id === actionId ? {
          ...a,
          status: "completed" as const,
          metrics: { views: parseInt(metricsInput.views) || 0, clicks: parseInt(metricsInput.clicks) || 0, conversions: parseInt(metricsInput.conversions) || 0 },
        } : a));
        setShowMetricsModal(null);
        setMetricsInput({ views: "", clicks: "", conversions: "" });
        addToast("Metrikker lagret!", "success");
      }
    } catch {
      addToast("Kunne ikke lagre metrikker.", "error");
    }
  };

  const generateLeadMagnet = async (brandId: string) => {
    setGeneratingLeadMagnet(brandId);
    try {
      const res = await fetch("/api/growth/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_lead_magnet", brand_id: brandId }),
      });
      if (res.ok) {
        const data = await res.json();
        const newMagnet = data.lead_magnet || data;
        setLeadMagnets((prev) => [newMagnet, ...prev]);
        addToast("Lead magnet generert!", "success");
      }
    } catch {
      addToast("Kunne ikke generere lead magnet.", "error");
    } finally {
      setGeneratingLeadMagnet(null);
    }
  };

  const toggleLeadMagnet = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    try {
      await fetch(`/api/growth/lead-magnets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setLeadMagnets((prev) => prev.map((lm) => lm.id === id ? { ...lm, status: newStatus as "active" | "paused" } : lm));
      addToast(`Lead magnet ${newStatus === "active" ? "aktivert" : "pauset"}.`, "success");
    } catch {
      addToast("Kunne ikke oppdatere status.", "error");
    }
  };

  const createABTest = async () => {
    setLoadingABTest(true);
    setShowABTestModal(false);
    try {
      const res = await fetch("/api/growth/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ab_test", brand_id: abTestForm.brand_id, content_type: abTestForm.content_type }),
      });
      if (res.ok) {
        const data = await res.json();
        const newTest = data.test || data;
        setABTests((prev) => [newTest, ...prev]);
        addToast("A/B test opprettet med AI-genererte varianter!", "success");
      }
    } catch {
      addToast("Kunne ikke opprette A/B test.", "error");
    } finally {
      setLoadingABTest(false);
    }
  };

  const selectWinner = async (testId: string, winner: "a" | "b") => {
    try {
      await fetch(`/api/growth/ab-tests/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner, status: "completed" }),
      });
      setABTests((prev) => prev.map((t) => t.id === testId ? { ...t, winner, status: "completed" as const } : t));
      addToast(`Variant ${winner.toUpperCase()} valgt som vinner!`, "success");
    } catch {
      addToast("Kunne ikke lagre vinner.", "error");
    }
  };

  const runAnalysis = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch("/api/growth/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", brand_id: selectedBrand !== "all" ? selectedBrand : undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights || data || []);
        addToast("Analyse fullfort!", "success");
      }
    } catch {
      addToast("Analyse feilet.", "error");
    } finally {
      setLoadingInsights(false);
    }
  };

  const updateStrategy = async (brandId: string) => {
    try {
      const res = await fetch("/api/growth/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_strategy", brand_id: brandId }),
      });
      if (res.ok) {
        addToast("Strategi oppdatert!", "success");
        fetchStrategies();
      }
    } catch {
      addToast("Kunne ikke oppdatere strategi.", "error");
    }
  };

  // Filter actions by brand
  const filteredActions = selectedBrand === "all" ? actions : actions.filter((a) => a.brand_id === selectedBrand);

  const insightIcon = (type: string) => {
    switch (type) {
      case "improvement": return <TrendingUp size={18} className="text-emerald-400" />;
      case "decline": return <TrendingUp size={18} className="text-red-400 rotate-180" />;
      case "recommendation": return <Lightbulb size={18} className="text-amber-400" />;
      case "trend": return <BarChart3 size={18} className="text-cyan-400" />;
      default: return <Sparkles size={18} className="text-purple-400" />;
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 relative">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-fade-in flex items-center gap-2 min-w-[280px] ${
              toast.type === "success"
                ? "bg-emerald-500/90 text-white border border-emerald-400/30"
                : "bg-red-500/90 text-white border border-red-400/30"
            }`}
          >
            {toast.type === "success" ? <Check size={16} /> : <X size={16} />}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30">
              <Rocket className="text-cyan-400" size={24} />
            </div>
            Vekstmotor
          </h1>
          <p className="text-sm text-slate-400 mt-1">Autonom vekstmotor for alle dine brands</p>
        </div>
        <Button
          onClick={runGrowthCycle}
          disabled={loadingCycle}
          className="bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-semibold px-6 py-2.5 shadow-lg shadow-cyan-500/20"
        >
          {loadingCycle ? (
            <><Loader2 size={18} className="mr-2 animate-spin" />AI genererer...</>
          ) : (
            <><Zap size={18} className="mr-2" />Kjor Vekst-syklus</>
          )}
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Aktive handlinger</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.activeActions}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-cyan-500/10"><Target size={20} className="text-cyan-400" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Leads denne uken</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.leadsThisWeek}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-500/10"><TrendingUp size={20} className="text-emerald-400" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">Vekstrate</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {stats.growthRate > 0 ? "+" : ""}{stats.growthRate}%
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-500/10"><BarChart3 size={20} className="text-amber-400" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-700/50 bg-slate-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide">AI-sykluser kjort</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.cyclesRun}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-500/10"><Brain size={20} className="text-purple-400" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Brand Filter Bar */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => setSelectedBrand("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            selectedBrand === "all"
              ? "bg-slate-600 text-white"
              : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
          }`}
        >
          Alle brands
        </button>
        {BRANDS.map((brand) => (
          <button
            key={brand.id}
            onClick={() => setSelectedBrand(brand.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              selectedBrand === brand.id
                ? "text-white shadow-lg"
                : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
            }`}
            style={selectedBrand === brand.id ? { backgroundColor: brand.color } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.color }} />
            {brand.name}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="vekst-ai" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="vekst-ai"><Brain size={14} className="mr-1.5" />Vekst-AI</TabsTrigger>
          <TabsTrigger value="lead-magnets"><Sparkles size={14} className="mr-1.5" />Lead Magnets</TabsTrigger>
          <TabsTrigger value="ab-testing"><Split size={14} className="mr-1.5" />A/B Testing</TabsTrigger>
          <TabsTrigger value="innsikter"><Lightbulb size={14} className="mr-1.5" />Innsikter</TabsTrigger>
          <TabsTrigger value="strategi"><Target size={14} className="mr-1.5" />Strategi</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: Vekst-AI ═══════════════════════════════════════════════ */}
        <TabsContent value="vekst-ai">
          <div className="space-y-4">
            {/* Loading state for cycle */}
            {loadingCycle && (
              <Card className="border-cyan-500/30 bg-cyan-500/5">
                <CardContent className="p-8 flex flex-col items-center justify-center text-center">
                  <div className="relative">
                    <Loader2 size={48} className="text-cyan-400 animate-spin" />
                    <Brain size={20} className="text-cyan-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-lg font-semibold text-white mt-4">AI analyserer og genererer veksthandlinger...</p>
                  <p className="text-sm text-slate-400 mt-1">Dette kan ta opptil 30 sekunder</p>
                </CardContent>
              </Card>
            )}

            {/* Actions List */}
            {loadingActions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="text-slate-400 animate-spin" />
              </div>
            ) : filteredActions.length === 0 ? (
              <Card className="border-slate-700/30">
                <CardContent className="p-12 text-center">
                  <Rocket size={48} className="text-slate-600 mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-300">Ingen handlinger enda</p>
                  <p className="text-sm text-slate-500 mt-1">Kjor en vekstsyklus for a generere AI-drevne handlinger</p>
                  <Button onClick={runGrowthCycle} className="mt-4" disabled={loadingCycle}>
                    <Zap size={16} className="mr-2" />Kjor forste syklus
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    Handlinger ({filteredActions.length})
                  </h3>
                  <Button size="sm" variant="outline" onClick={fetchActions} disabled={loadingActions}>
                    <RefreshCw size={14} className="mr-1" />Oppdater
                  </Button>
                </div>
                {filteredActions.map((action) => {
                  const brand = getBrand(action.brand_id);
                  const sc = statusColors[action.status] || statusColors.planned;
                  return (
                    <Card key={action.id} className="border-slate-700/30 hover:border-slate-600/50 transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {/* Brand dot */}
                          <div className="mt-1.5">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand?.color || "#06b6d4" }} />
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                                style={{ backgroundColor: `${brand?.color}20`, color: brand?.color, borderColor: `${brand?.color}40` }}
                              >
                                {brand?.name || action.brand_id}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">{action.action_type}</Badge>
                              <span className="text-slate-500 flex items-center gap-1 text-xs">
                                {platformIcon(action.platform)}
                                {action.platform}
                              </span>
                              <Badge variant={sc.variant} className="text-[10px] ml-auto">
                                {action.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-200 line-clamp-2">{action.content}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <div className="flex items-center gap-0.5">{priorityStars(action.priority)}</div>
                              {action.metrics && (
                                <span className="text-[10px] text-slate-500">
                                  {action.metrics.views} visn. / {action.metrics.clicks} klikk / {action.metrics.conversions} konv.
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Action buttons */}
                          <div className="flex flex-col gap-1.5 shrink-0">
                            {(action.status === "planned" || action.status === "ready") && (
                              <Button size="sm" variant="default" className="text-xs h-7" onClick={() => publishAction(action.id)}>
                                <Send size={12} className="mr-1" />Publiser
                              </Button>
                            )}
                            {action.status === "published" && (
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setShowMetricsModal(action.id); setMetricsInput({ views: "", clicks: "", conversions: "" }); }}>
                                <BarChart3 size={12} className="mr-1" />Legg til metrikker
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB 2: Lead Magnets ═══════════════════════════════════════════ */}
        <TabsContent value="lead-magnets">
          <div className="space-y-4">
            {/* Generate buttons per brand */}
            <div className="flex gap-2 flex-wrap">
              {BRANDS.map((brand) => (
                <Button
                  key={brand.id}
                  size="sm"
                  variant="outline"
                  disabled={generatingLeadMagnet === brand.id}
                  onClick={() => generateLeadMagnet(brand.id)}
                  className="text-xs"
                >
                  {generatingLeadMagnet === brand.id ? (
                    <Loader2 size={14} className="mr-1 animate-spin" />
                  ) : (
                    <Plus size={14} className="mr-1" />
                  )}
                  <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: brand.color }} />
                  Generer for {brand.name}
                </Button>
              ))}
            </div>

            {/* Lead Magnets Grid */}
            {loadingLeadMagnets ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="text-slate-400 animate-spin" /></div>
            ) : leadMagnets.length === 0 ? (
              <Card className="border-slate-700/30">
                <CardContent className="p-12 text-center">
                  <Sparkles size={48} className="text-slate-600 mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-300">Ingen lead magnets enda</p>
                  <p className="text-sm text-slate-500 mt-1">Generer en lead magnet for en av dine brands</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {leadMagnets.map((lm) => {
                  const brand = getBrand(lm.brand_id);
                  const sc = statusColors[lm.status] || statusColors.draft;
                  return (
                    <Card key={lm.id} className="border-slate-700/30 hover:border-slate-600/50 transition-all">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand?.color }} />
                            <CardTitle className="text-sm">{lm.title}</CardTitle>
                          </div>
                          <button
                            onClick={() => toggleLeadMagnet(lm.id, lm.status)}
                            className="text-slate-400 hover:text-white transition-colors"
                          >
                            {lm.status === "active" ? <ToggleRight size={22} className="text-emerald-400" /> : <ToggleLeft size={22} />}
                          </button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        <p className="text-xs text-slate-400 line-clamp-2">{lm.description}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{lm.type}</Badge>
                          <Badge variant="secondary" className="text-[10px]" style={{ color: brand?.color }}>{brand?.name}</Badge>
                          <Badge variant={sc.variant} className="text-[10px]">{lm.status}</Badge>
                        </div>
                        {lm.conversion_rate !== undefined && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Konverteringsrate:</span>
                            <span className="text-emerald-400 font-semibold">{lm.conversion_rate}%</span>
                          </div>
                        )}
                        {lm.landing_page_copy && (
                          <details className="text-xs">
                            <summary className="text-cyan-400 cursor-pointer hover:text-cyan-300">Vis landingsside-tekst</summary>
                            <p className="text-slate-400 mt-1 bg-slate-800/50 p-2 rounded">{lm.landing_page_copy}</p>
                          </details>
                        )}
                        {lm.cta && (
                          <div className="text-xs">
                            <span className="text-slate-500">CTA: </span>
                            <span className="text-amber-300 font-medium">{lm.cta}</span>
                          </div>
                        )}
                        {lm.email_sequence && lm.email_sequence.length > 0 && (
                          <details className="text-xs">
                            <summary className="text-cyan-400 cursor-pointer hover:text-cyan-300">E-postsekvens ({lm.email_sequence.length} e-poster)</summary>
                            <div className="mt-1 space-y-1">
                              {lm.email_sequence.map((email, i) => (
                                <div key={i} className="bg-slate-800/50 p-2 rounded text-slate-400">
                                  <span className="text-slate-500 font-medium">E-post {i + 1}:</span> {email}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB 3: A/B Testing ════════════════════════════════════════════ */}
        <TabsContent value="ab-testing">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">A/B Tester</h3>
              <Button onClick={() => setShowABTestModal(true)}>
                <Plus size={16} className="mr-2" />Ny A/B Test
              </Button>
            </div>

            {loadingABTest ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="text-slate-400 animate-spin" /></div>
            ) : abTests.length === 0 ? (
              <Card className="border-slate-700/30">
                <CardContent className="p-12 text-center">
                  <Split size={48} className="text-slate-600 mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-300">Ingen A/B tester enda</p>
                  <p className="text-sm text-slate-500 mt-1">Opprett en A/B test for a la AI generere to varianter</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {abTests.map((test) => {
                  const brand = getBrand(test.brand_id);
                  return (
                    <Card key={test.id} className="border-slate-700/30">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand?.color }} />
                          <span className="text-sm font-medium text-white">{brand?.name}</span>
                          <Badge variant="outline" className="text-[10px]">{test.content_type}</Badge>
                          <Badge variant={statusColors[test.status]?.variant || "secondary"} className="text-[10px] ml-auto">
                            {test.status}
                          </Badge>
                          {test.winner && (
                            <Badge variant="success" className="text-[10px]">
                              <Crown size={10} className="mr-1" />Vinner: Variant {test.winner.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Variant A */}
                          <div className={`p-4 rounded-lg border ${test.winner === "a" ? "border-emerald-500/50 bg-emerald-500/5" : "border-slate-700/50 bg-slate-800/30"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-slate-300 uppercase">Variant A</span>
                              {test.winner === "a" && <Crown size={14} className="text-emerald-400" />}
                            </div>
                            <p className="text-sm text-slate-200">{test.variant_a}</p>
                            {test.metrics_a && (
                              <div className="flex gap-4 mt-3 text-xs text-slate-400">
                                {Object.entries(test.metrics_a).map(([key, val]) => (
                                  <span key={key}>{key}: <span className="text-white font-medium">{val}</span></span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Variant B */}
                          <div className={`p-4 rounded-lg border ${test.winner === "b" ? "border-emerald-500/50 bg-emerald-500/5" : "border-slate-700/50 bg-slate-800/30"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-slate-300 uppercase">Variant B</span>
                              {test.winner === "b" && <Crown size={14} className="text-emerald-400" />}
                            </div>
                            <p className="text-sm text-slate-200">{test.variant_b}</p>
                            {test.metrics_b && (
                              <div className="flex gap-4 mt-3 text-xs text-slate-400">
                                {Object.entries(test.metrics_b).map(([key, val]) => (
                                  <span key={key}>{key}: <span className="text-white font-medium">{val}</span></span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {test.status === "running" && !test.winner && (
                          <div className="flex gap-2 mt-4 justify-end">
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => selectWinner(test.id, "a")}>
                              <Check size={12} className="mr-1" />Velg A som vinner
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => selectWinner(test.id, "b")}>
                              <Check size={12} className="mr-1" />Velg B som vinner
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB 4: Innsikter ══════════════════════════════════════════════ */}
        <TabsContent value="innsikter">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">AI-drevne innsikter</h3>
              <Button onClick={runAnalysis} disabled={loadingInsights}>
                {loadingInsights ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" />Analyserer...</>
                ) : (
                  <><Brain size={16} className="mr-2" />Analyser</>
                )}
              </Button>
            </div>

            {loadingInsights ? (
              <Card className="border-purple-500/30 bg-purple-500/5">
                <CardContent className="p-8 flex flex-col items-center text-center">
                  <Loader2 size={40} className="text-purple-400 animate-spin" />
                  <p className="text-white font-medium mt-4">AI analyserer data pa tvers av alle brands...</p>
                  <p className="text-sm text-slate-400 mt-1">Ser etter trender, muligheter og forbedringer</p>
                </CardContent>
              </Card>
            ) : insights.length === 0 ? (
              <Card className="border-slate-700/30">
                <CardContent className="p-12 text-center">
                  <Lightbulb size={48} className="text-slate-600 mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-300">Ingen innsikter enda</p>
                  <p className="text-sm text-slate-500 mt-1">Kjor en analyse for a fa AI-genererte innsikter</p>
                  <Button onClick={runAnalysis} className="mt-4">
                    <Brain size={16} className="mr-2" />Kjor forste analyse
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((insight) => {
                  const brand = insight.brand_id ? getBrand(insight.brand_id) : null;
                  return (
                    <Card key={insight.id} className="border-slate-700/30 hover:border-slate-600/50 transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-slate-800/80 shrink-0 mt-0.5">
                            {insightIcon(insight.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium text-white">{insight.title}</p>
                              {brand && (
                                <Badge variant="secondary" className="text-[10px]" style={{ color: brand.color }}>
                                  {brand.name}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">{insight.description}</p>
                            {insight.metric && (
                              <div className="flex items-center gap-2 mt-2 text-xs">
                                <span className="text-slate-500">{insight.metric}:</span>
                                <span className={insight.change && insight.change > 0 ? "text-emerald-400" : "text-red-400"}>
                                  {insight.change && insight.change > 0 ? "+" : ""}{insight.change}%
                                </span>
                              </div>
                            )}
                          </div>
                          <ChevronRight size={16} className="text-slate-600 shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB 5: Strategi ═══════════════════════════════════════════════ */}
        <TabsContent value="strategi">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Brand-strategier</h3>
              <Button size="sm" variant="outline" onClick={fetchStrategies} disabled={loadingStrategies}>
                <RefreshCw size={14} className="mr-1" />Oppdater alle
              </Button>
            </div>

            {loadingStrategies ? (
              <div className="flex items-center justify-center py-12"><Loader2 size={24} className="text-slate-400 animate-spin" /></div>
            ) : strategies.length === 0 ? (
              /* Show brand cards even without API data */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {BRANDS.map((brand) => (
                  <Card key={brand.id} className="border-slate-700/30">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand.color }} />
                        <CardTitle className="text-sm">{brand.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <p className="text-xs text-slate-500">{brand.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {brand.specialties?.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500">Malpublikum: {brand.target_audience}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        onClick={() => updateStrategy(brand.id)}
                      >
                        <Sparkles size={12} className="mr-1" />Generer strategi
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {strategies.map((strategy) => {
                  const brand = getBrand(strategy.brand_id);
                  if (!brand) return null;
                  const progress = strategy.target_followers > 0
                    ? Math.round((strategy.followers / strategy.target_followers) * 100)
                    : 0;
                  return (
                    <Card key={strategy.brand_id} className="border-slate-700/30 hover:border-slate-600/50 transition-all">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand.color }} />
                            <CardTitle className="text-sm">{brand.name}</CardTitle>
                          </div>
                          <span className="text-xs text-slate-500">Score: {strategy.performance_score}/10</span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        {/* Follower progress */}
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-400">Folgere</span>
                            <span className="text-white font-medium">{strategy.followers.toLocaleString()} / {strategy.target_followers.toLocaleString()}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: brand.color }}
                            />
                          </div>
                        </div>
                        {/* Focus areas */}
                        {strategy.focus_areas && strategy.focus_areas.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1.5">Fokusomrader:</p>
                            <div className="flex flex-wrap gap-1">
                              {strategy.focus_areas.map((area) => (
                                <Badge key={area} variant="outline" className="text-[10px]">{area}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Weekly actions */}
                        {strategy.weekly_actions && strategy.weekly_actions.length > 0 && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1.5">Ukentlige handlinger:</p>
                            <div className="space-y-1">
                              {strategy.weekly_actions.map((action, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                                  <ChevronRight size={12} className="text-cyan-500 mt-0.5 shrink-0" />
                                  <span>{action}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => updateStrategy(strategy.brand_id)}
                        >
                          <RefreshCw size={12} className="mr-1" />Oppdater strategi
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Metrics Modal ──────────────────────────────────────────────────── */}
      {showMetricsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowMetricsModal(null)}>
          <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Legg til metrikker</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowMetricsModal(null)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Visninger</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={metricsInput.views}
                    onChange={(e) => setMetricsInput((p) => ({ ...p, views: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Klikk</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={metricsInput.clicks}
                    onChange={(e) => setMetricsInput((p) => ({ ...p, clicks: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Konverteringer</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={metricsInput.conversions}
                    onChange={(e) => setMetricsInput((p) => ({ ...p, conversions: e.target.value }))}
                  />
                </div>
                <Button onClick={() => addMetrics(showMetricsModal)} className="w-full">
                  <Check size={16} className="mr-2" />Lagre metrikker
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── A/B Test Modal ─────────────────────────────────────────────────── */}
      {showABTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowABTestModal(false)}>
          <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Ny A/B Test</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowABTestModal(false)}>
                  <X size={18} />
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Brand</label>
                  <select
                    value={abTestForm.brand_id}
                    onChange={(e) => setABTestForm((p) => ({ ...p, brand_id: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                  >
                    {BRANDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Innholdstype</label>
                  <select
                    value={abTestForm.content_type}
                    onChange={(e) => setABTestForm((p) => ({ ...p, content_type: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-slate-100"
                  >
                    <option value="social_post">Sosialt innlegg</option>
                    <option value="email_subject">E-postemne</option>
                    <option value="ad_copy">Annonsetekst</option>
                    <option value="landing_page">Landingsside</option>
                    <option value="cta">Call-to-Action</option>
                  </select>
                </div>
                <Button onClick={createABTest} className="w-full">
                  <Sparkles size={16} className="mr-2" />Generer A/B varianter med AI
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
