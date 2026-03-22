'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Globe, Plus, ExternalLink, Code2, Users, DollarSign, TrendingUp,
  BarChart3, Loader2, Rocket, PauseCircle, Wrench, Archive,
  Eye, Zap, CheckCircle, XCircle, Clock, Sparkles, Layout, Package,
  Search, ThumbsUp, ThumbsDown, Microscope, Brain, Copy, ChevronRight,
  Target, Lightbulb, Shield, Star, AlertCircle, RefreshCw, FileText,
  ArrowRight, X,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SaaSApp {
  id: string;
  slug: string;
  name: string;
  domain: string;
  description?: string;
  category?: string;
  tech_stack?: string[];
  status: 'development' | 'beta' | 'live' | 'paused' | 'archived';
  logo_url?: string;
  color?: string;
  screenshot_url?: string;
  pricing_model?: string;
  price_monthly?: number;
  price_yearly?: number;
  currency?: string;
  total_users: number;
  active_users_30d: number;
  total_revenue: number;
  mrr: number;
  arr: number;
  churn_rate: number;
  repo_url?: string;
  live_url?: string;
  dev_platform?: string;
  version?: string;
  launched_at?: string;
  created_at: string;
  active_subscriptions?: number;
}

interface Totals {
  totalApps: number;
  liveApps: number;
  totalUsers: number;
  totalMRR: number;
  totalRevenue: number;
}

interface Opportunity {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  problem_statement: string;
  target_audience: string;
  market_size: string;
  competitor_count: number;
  competitors: string[];
  competitor_weakness: string;
  opportunity_score: number;
  suggested_pricing: string;
  estimated_mrr_potential: string;
  monetization_strategy: string;
  tech_stack_suggestion: string[];
  build_complexity: string;
  estimated_build_days: number;
  mvp_features: string[];
  differentiators: string[];
  trend_keywords: string[];
  trend_sources: string[];
  trend_momentum: string;
  search_volume_trend: string;
  status: string;
  refinement_notes?: string;
  business_plan?: string;
  user_feedback?: string;
  build_prompt?: string;
  vercel_url?: string;
  created_at: string;
  updated_at?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  development: { label: 'Utvikling', color: 'bg-amber-500/20 text-amber-400', icon: Wrench },
  beta: { label: 'Beta', color: 'bg-blue-500/20 text-blue-400', icon: Rocket },
  live: { label: 'Live', color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
  paused: { label: 'Pauset', color: 'bg-slate-500/20 text-slate-400', icon: PauseCircle },
  archived: { label: 'Arkivert', color: 'bg-red-500/20 text-red-400', icon: Archive },
};

const OPP_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  discovered: { label: 'Oppdaget', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: Lightbulb },
  investigating: { label: 'Undersokes', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: Microscope },
  refining: { label: 'Forfines', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icon: Brain },
  approved: { label: 'Godkjent', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: ThumbsUp },
  queued_for_build: { label: 'I byggeko', color: 'bg-teal-500/20 text-teal-300 border-teal-500/30', icon: Clock },
  building: { label: 'Bygges', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: Wrench },
  deployed: { label: 'Deployet', color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: Rocket },
  testing: { label: 'Testes', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', icon: Eye },
  live: { label: 'Live', color: 'bg-green-500/20 text-green-300 border-green-500/30', icon: CheckCircle },
  rejected: { label: 'Forkastet', color: 'bg-red-500/20 text-red-300 border-red-500/30', icon: XCircle },
  archived: { label: 'Arkivert', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30', icon: Archive },
};

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: 'text-green-400',
  medium: 'text-amber-400',
  complex: 'text-red-400',
};

const MOMENTUM_LABELS: Record<string, { label: string; color: string }> = {
  rising: { label: 'Stigende', color: 'text-green-400' },
  stable: { label: 'Stabil', color: 'text-blue-400' },
  peaking: { label: 'Topper', color: 'text-amber-400' },
  declining: { label: 'Synkende', color: 'text-red-400' },
};

const CATEGORY_LABELS: Record<string, string> = {
  'ai-chat': 'AI Chat', 'ai': 'AI', 'real-estate': 'Eiendom', music: 'Musikk',
  social: 'Sosiale Medier', productivity: 'Produktivitet', finance: 'Finans',
  health: 'Helse', education: 'Utdanning', ecommerce: 'E-handel',
  'developer-tools': 'Utviklerverktoy', legal: 'Juridisk', marketing: 'Markedsforing',
};

const SEED_APPS: Partial<SaaSApp>[] = [
  {
    slug: 'astro', name: 'Astro AI', domain: 'astro.chatgenius.pro',
    description: 'AI-drevet astrologiassistent med personlige horoskoper og livscoaching',
    category: 'ai-chat', color: '#8b5cf6', status: 'live', pricing_model: 'freemium',
    price_monthly: 9.99, tech_stack: ['next.js', 'openai', 'supabase'], dev_platform: 'claude-code',
  },
  {
    slug: 'olivia', name: 'Olivia AI', domain: 'olivia.chatgenius.pro',
    description: 'Personlig AI-assistent for daglige oppgaver, planlegging og produktivitet',
    category: 'ai-chat', color: '#ec4899', status: 'live', pricing_model: 'freemium',
    price_monthly: 14.99, tech_stack: ['next.js', 'anthropic', 'supabase'], dev_platform: 'claude-code',
  },
  {
    slug: 'realtyflow', name: 'RealtyFlow Chat', domain: 'realtyflow.chatgenius.pro',
    description: 'AI eiendomsassistent for kjopere og selgere i Spania',
    category: 'real-estate', color: '#06b6d4', status: 'live', pricing_model: 'subscription',
    price_monthly: 29.99, tech_stack: ['next.js', 'anthropic', 'supabase', 'leaflet'], dev_platform: 'claude-code',
  },
  {
    slug: 'socialmusichub', name: 'Social Music Hub', domain: 'socialmusichub.chatgenius.pro',
    description: 'AI-drevet musikkmarkedsforing og sosiale medier-styring',
    category: 'social', color: '#f59e0b', status: 'beta', pricing_model: 'freemium',
    price_monthly: 19.99, tech_stack: ['next.js', 'anthropic', 'youtube-api', 'airtable'], dev_platform: 'claude-code',
  },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SaaSPage() {
  // Portfolio state
  const [apps, setApps] = useState<SaaSApp[]>([]);
  const [totals, setTotals] = useState<Totals>({ totalApps: 0, liveApps: 0, totalUsers: 0, totalMRR: 0, totalRevenue: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<SaaSApp | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Opportunity state
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [refining, setRefining] = useState<string | null>(null);
  const [buildPrompt, setBuildPrompt] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userFeedback, setUserFeedback] = useState('');
  const [latestScan, setLatestScan] = useState<{ created_at: string; opportunities_found: number } | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<{ repo_url?: string; vercel_url?: string; error?: string } | null>(null);
  const [buildReady, setBuildReady] = useState<boolean | null>(null);

  // Form state
  const [formSlug, setFormSlug] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('ai-chat');
  const [formStatus, setFormStatus] = useState('development');
  const [formColor, setFormColor] = useState('#8b5cf6');
  const [formPrice, setFormPrice] = useState('');
  const [formPricing, setFormPricing] = useState('freemium');
  const [formTech, setFormTech] = useState('');
  const [formDevPlatform, setFormDevPlatform] = useState('claude-code');
  const [formRepoUrl, setFormRepoUrl] = useState('');

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch('/api/saas');
      const data = await res.json();
      if (data.apps?.length > 0) {
        setApps(data.apps);
        setTotals(data.totals || { totalApps: 0, liveApps: 0, totalUsers: 0, totalMRR: 0, totalRevenue: 0 });
      } else {
        setApps(SEED_APPS as SaaSApp[]);
        setTotals({ totalApps: SEED_APPS.length, liveApps: SEED_APPS.filter(a => a.status === 'live').length, totalUsers: 0, totalMRR: 0, totalRevenue: 0 });
      }
    } catch {
      setApps(SEED_APPS as SaaSApp[]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOpportunities = useCallback(async () => {
    setLoadingOpps(true);
    try {
      const res = await fetch('/api/saas/opportunities?status=active');
      const data = await res.json();
      setOpportunities(data.opportunities || []);
      if (data.latest_scan) setLatestScan(data.latest_scan);
    } catch {
      // silently handle
    } finally {
      setLoadingOpps(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // Check build readiness on mount
  useEffect(() => {
    fetch('/api/saas/build').then(r => r.json()).then(d => setBuildReady(d.ready)).catch(() => {});
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSaveApp = async () => {
    if (!formSlug || !formName) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/saas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedApp?.id, slug: formSlug, name: formName,
          domain: `${formSlug}.chatgenius.pro`, description: formDesc,
          category: formCategory, status: formStatus, color: formColor,
          pricing_model: formPricing,
          price_monthly: formPrice ? parseFloat(formPrice) : undefined,
          tech_stack: formTech ? formTech.split(',').map(t => t.trim()) : [],
          dev_platform: formDevPlatform, repo_url: formRepoUrl || undefined,
        }),
      });
      if (res.ok) { setShowAddModal(false); resetForm(); fetchApps(); }
    } catch { /* ignore */ } finally { setIsSaving(false); }
  };

  const resetForm = () => {
    setFormSlug(''); setFormName(''); setFormDesc(''); setFormCategory('ai-chat');
    setFormStatus('development'); setFormColor('#8b5cf6'); setFormPrice('');
    setFormPricing('freemium'); setFormTech(''); setFormDevPlatform('claude-code');
    setFormRepoUrl(''); setSelectedApp(null);
  };

  const openEditModal = (app: SaaSApp) => {
    setSelectedApp(app);
    setFormSlug(app.slug); setFormName(app.name); setFormDesc(app.description || '');
    setFormCategory(app.category || 'ai-chat'); setFormStatus(app.status);
    setFormColor(app.color || '#8b5cf6'); setFormPrice(app.price_monthly?.toString() || '');
    setFormPricing(app.pricing_model || 'freemium');
    setFormTech(app.tech_stack?.join(', ') || ''); setFormDevPlatform(app.dev_platform || 'claude-code');
    setFormRepoUrl(app.repo_url || '');
    setShowAddModal(true);
  };

  // ─── Opportunity Handlers ──────────────────────────────────────────────────

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/saas/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discover' }),
      });
      if (res.ok) {
        const data = await res.json();
        setOpportunities((prev) => [...(data.opportunities || []), ...prev]);
        setLatestScan({ created_at: new Date().toISOString(), opportunities_found: data.count || 0 });
      }
    } catch { /* ignore */ } finally { setScanning(false); }
  };

  const updateOppStatus = async (id: string, status: string, feedback?: string) => {
    try {
      await fetch('/api/saas/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', id, status, user_feedback: feedback }),
      });
      setOpportunities((prev) =>
        prev.map((o) => o.id === id ? { ...o, status, user_feedback: feedback || o.user_feedback } : o)
          .filter((o) => !['rejected', 'archived'].includes(o.status))
      );
      if (selectedOpp?.id === id) {
        setSelectedOpp((prev) => prev ? { ...prev, status } : null);
      }
    } catch { /* ignore */ }
  };

  const refineOpp = async (opp: Opportunity) => {
    setRefining(opp.id);
    try {
      const res = await fetch('/api/saas/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine', id: opp.id, title: opp.title,
          description: opp.description, category: opp.category,
          target_audience: opp.target_audience, competitors: opp.competitors,
          mvp_features: opp.mvp_features, user_feedback: userFeedback || opp.user_feedback,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.opportunity || { ...opp, status: 'refining', ...data.refined };
        setOpportunities((prev) => prev.map((o) => o.id === opp.id ? { ...o, ...updated } : o));
        setSelectedOpp((prev) => prev?.id === opp.id ? { ...prev, ...updated } : prev);
      }
    } catch { /* ignore */ } finally { setRefining(null); }
  };

  const generateBuildPrompt = async (opp: Opportunity) => {
    setLoadingPrompt(true);
    try {
      const res = await fetch('/api/saas/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_build_prompt', id: opp.id, title: opp.title,
          slug: opp.slug, description: opp.description,
          mvp_features: opp.mvp_features, tech_stack_suggestion: opp.tech_stack_suggestion,
          business_plan: opp.business_plan, suggested_pricing: opp.suggested_pricing,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBuildPrompt(data.build_prompt);
        updateOppStatus(opp.id, 'approved');
      }
    } catch { /* ignore */ } finally { setLoadingPrompt(false); }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers or insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const autoBuild = async (opp: Opportunity) => {
    setBuilding(opp.id);
    setBuildResult(null);
    try {
      const res = await fetch('/api/saas/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: opp.id,
          title: opp.title,
          slug: opp.slug,
          description: opp.description,
          mvp_features: opp.mvp_features,
          suggested_pricing: opp.suggested_pricing,
          target_audience: opp.target_audience,
          category: opp.category,
          tech_stack_suggestion: opp.tech_stack_suggestion,
          business_plan: opp.business_plan,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBuildResult({});
        setBuildPrompt(data.build_prompt);
        setOpportunities((prev) =>
          prev.map((o) => o.id === opp.id ? { ...o, status: 'queued_for_build' } : o)
        );
        setSelectedOpp((prev) => prev?.id === opp.id ? { ...prev, status: 'queued_for_build' } : prev);
      } else {
        setBuildResult({ error: data.error || 'Kunne ikke lagre byggoppgave' });
      }
    } catch {
      setBuildResult({ error: 'Nettverksfeil' });
    } finally {
      setBuilding(null);
    }
  };

  const liveApps = apps.filter(a => a.status === 'live');
  const devApps = apps.filter(a => a.status !== 'live' && a.status !== 'archived');

  // ─── Pipeline counts ──────────────────────────────────────────────────────
  const discoveredCount = opportunities.filter(o => o.status === 'discovered').length;
  const investigatingCount = opportunities.filter(o => o.status === 'investigating' || o.status === 'refining').length;
  const approvedCount = opportunities.filter(o => ['approved', 'queued_for_build', 'building'].includes(o.status)).length;
  const deployedCount = opportunities.filter(o => ['deployed', 'testing', 'live'].includes(o.status)).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">ChatGenius.pro</h1>
              <p className="text-slate-400">SaaS Portfolio &bull; AI Discovery &bull; Auto-Build Pipeline</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowAddModal(true); }}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500">
            <Plus className="mr-2 h-4 w-4" /> Ny App
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-5">
        {[
          { icon: Package, label: 'Totalt Apper', value: totals.totalApps, color: 'text-purple-400' },
          { icon: Rocket, label: 'Live', value: totals.liveApps, color: 'text-green-400' },
          { icon: Users, label: 'Brukere', value: totals.totalUsers, color: 'text-blue-400' },
          { icon: DollarSign, label: 'MRR', value: `$${totals.totalMRR.toFixed(0)}`, color: 'text-emerald-400' },
          { icon: Search, label: 'Muligheter', value: opportunities.length, color: 'text-amber-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-400">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="discovery" className="space-y-6" onValueChange={(v) => {
        if (v === 'discovery' && opportunities.length === 0) fetchOpportunities();
      }}>
        <TabsList>
          <TabsTrigger value="discovery">
            <Search className="mr-2 h-4 w-4" /> SaaS Radar {discoveredCount > 0 && <Badge className="ml-2 bg-amber-500/20 text-amber-300 text-[10px]">{discoveredCount} nye</Badge>}
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <Target className="mr-2 h-4 w-4" /> Pipeline {approvedCount > 0 && <Badge className="ml-2 bg-emerald-500/20 text-emerald-300 text-[10px]">{approvedCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="portfolio"><Layout className="mr-2 h-4 w-4" /> Mine Apper ({apps.length})</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="mr-2 h-4 w-4" /> Analytics</TabsTrigger>
        </TabsList>

        {/* ─── SaaS Radar Tab ──────────────────────────────────────────────── */}
        <TabsContent value="discovery" className="space-y-6">
          {/* Scan controls */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-400" />
                    SaaS Opportunity Radar
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    AI skanner markedet for underserverte nisjer med lav konkurranse og hoy betalingsvilje.
                    {latestScan && (
                      <span className="text-slate-500 ml-2">
                        Siste skann: {new Date(latestScan.created_at).toLocaleDateString('nb-NO')} ({latestScan.opportunities_found} funn)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Automatisk skanning hver mandag kl 07:00</p>
                </div>
                <Button onClick={runScan} disabled={scanning}
                  className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500">
                  {scanning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Skanner...</>
                    : <><Search className="mr-2 h-4 w-4" /> Skann na</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline overview */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Oppdaget', count: discoveredCount, color: 'border-blue-500/30 text-blue-400', icon: Lightbulb },
              { label: 'Undersokes', count: investigatingCount, color: 'border-amber-500/30 text-amber-400', icon: Microscope },
              { label: 'Godkjent/Bygges', count: approvedCount, color: 'border-emerald-500/30 text-emerald-400', icon: Wrench },
              { label: 'Deployet', count: deployedCount, color: 'border-green-500/30 text-green-400', icon: Rocket },
            ].map(({ label, count, color, icon: Icon }) => (
              <div key={label} className={`p-3 rounded-lg bg-slate-800/50 border ${color} text-center`}>
                <Icon className={`h-4 w-4 mx-auto mb-1 ${color.split(' ')[1]}`} />
                <div className={`text-xl font-bold ${color.split(' ')[1]}`}>{count}</div>
                <div className="text-[10px] text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          {/* Opportunity cards */}
          {loadingOpps || scanning ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <span className="ml-3 text-slate-400">{scanning ? 'AI skanner markedet...' : 'Laster muligheter...'}</span>
            </div>
          ) : opportunities.filter(o => o.status === 'discovered').length === 0 && !scanning ? (
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-12 text-center">
                <Search className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Ingen nye muligheter</h3>
                <p className="text-sm text-slate-400 mb-4">Trykk &quot;Skann na&quot; for a la AI finne underserverte SaaS-nisjer</p>
                <Button onClick={runScan} className="bg-purple-600 hover:bg-purple-500">
                  <Search className="mr-2 h-4 w-4" /> Start skanning
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Lightbulb className="h-3 w-3 text-amber-400" /> Nye muligheter ({opportunities.filter(o => o.status === 'discovered').length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {opportunities.filter(o => o.status === 'discovered').map((opp) => (
                  <OpportunityCard key={opp.id} opp={opp}
                    onApprove={() => updateOppStatus(opp.id, 'approved')}
                    onInvestigate={() => { updateOppStatus(opp.id, 'investigating'); setSelectedOpp(opp); }}
                    onReject={() => updateOppStatus(opp.id, 'rejected')}
                    onSelect={() => setSelectedOpp(opp)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Investigating section */}
          {opportunities.filter(o => ['investigating', 'refining'].includes(o.status)).length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Microscope className="h-3 w-3 text-amber-400" /> Under vurdering
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {opportunities.filter(o => ['investigating', 'refining'].includes(o.status)).map((opp) => (
                  <OpportunityCard key={opp.id} opp={opp}
                    onApprove={() => updateOppStatus(opp.id, 'approved')}
                    onInvestigate={() => setSelectedOpp(opp)}
                    onReject={() => updateOppStatus(opp.id, 'rejected')}
                    onSelect={() => setSelectedOpp(opp)}
                    showRefine
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Pipeline Tab ────────────────────────────────────────────────── */}
        <TabsContent value="pipeline" className="space-y-6">
          {['approved', 'queued_for_build', 'building', 'deployed', 'testing'].map((status) => {
            const filtered = opportunities.filter(o => o.status === status);
            if (filtered.length === 0) return null;
            const cfg = OPP_STATUS_CONFIG[status];
            const StatusIcon = cfg?.icon || Lightbulb;
            return (
              <div key={status} className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <StatusIcon className="h-3 w-3" /> {cfg?.label} ({filtered.length})
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filtered.map((opp) => (
                    <Card key={opp.id} className="bg-slate-800/50 border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer"
                      onClick={() => setSelectedOpp(opp)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-white">{opp.title}</h4>
                          <Badge className={`text-[10px] ${cfg?.color}`}>{cfg?.label}</Badge>
                        </div>
                        <p className="text-xs text-slate-400 mb-3">{opp.description}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>{opp.estimated_build_days}d bygg</span>
                          <span>{opp.estimated_mrr_potential}</span>
                          {opp.vercel_url && (
                            <a href={opp.vercel_url} target="_blank" rel="noopener noreferrer"
                              className="text-purple-400 hover:text-purple-300 flex items-center gap-1"
                              onClick={e => e.stopPropagation()}>
                              <ExternalLink className="h-3 w-3" /> Apne
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                          {status === 'approved' && (
                            <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500"
                              onClick={(e) => { e.stopPropagation(); setSelectedOpp(opp); }}>
                              <Rocket className="h-3 w-3 mr-1" /> Klargjor for bygging
                            </Button>
                          )}
                          {status === 'queued_for_build' && (
                            <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-500"
                              onClick={(e) => { e.stopPropagation(); setSelectedOpp(opp); }}>
                              <Clock className="h-3 w-3 mr-1" /> I ko - se detaljer
                            </Button>
                          )}
                          {status === 'building' && (
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500"
                              onClick={(e) => { e.stopPropagation(); updateOppStatus(opp.id, 'deployed'); }}>
                              <Rocket className="h-3 w-3 mr-1" /> Marker som deployet
                            </Button>
                          )}
                          {status === 'deployed' && (
                            <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500"
                              onClick={(e) => { e.stopPropagation(); updateOppStatus(opp.id, 'testing'); }}>
                              <Eye className="h-3 w-3 mr-1" /> Start testing
                            </Button>
                          )}
                          {status === 'testing' && (
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500"
                              onClick={(e) => { e.stopPropagation(); updateOppStatus(opp.id, 'live'); }}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Godkjenn &amp; Go Live
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs border-slate-600"
                            onClick={(e) => { e.stopPropagation(); setSelectedOpp(opp); }}>
                            Detaljer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}

          {opportunities.filter(o => ['approved', 'queued_for_build', 'building', 'deployed', 'testing'].includes(o.status)).length === 0 && (
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-12 text-center">
                <Target className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Ingen i pipeline</h3>
                <p className="text-sm text-slate-400">Godkjenn muligheter fra SaaS Radar for a starte bygging</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Portfolio Tab ───────────────────────────────────────────────── */}
        <TabsContent value="portfolio" className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : (
            <>
              {liveApps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400" /> Live Apper ({liveApps.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveApps.map((app) => <AppCard key={app.slug} app={app} onEdit={openEditModal} />)}
                  </div>
                </div>
              )}
              {devApps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Wrench className="h-3 w-3 text-amber-400" /> Under Utvikling ({devApps.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {devApps.map((app) => <AppCard key={app.slug} app={app} onEdit={openEditModal} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ─── Analytics Tab ───────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white text-sm">Revenue per App</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {apps.filter(a => a.status === 'live').map((app) => (
                    <div key={app.slug} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: app.color || '#8b5cf6' }} />
                        <span className="text-sm text-slate-300">{app.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-white">${(app.mrr || 0).toFixed(0)}/mnd</span>
                        <span className="text-xs text-slate-500 ml-2">{app.total_users || 0} brukere</span>
                      </div>
                    </div>
                  ))}
                  {apps.filter(a => a.status === 'live').length === 0 && (
                    <p className="text-sm text-slate-500 text-center py-4">Ingen live-apper med data enda</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white text-sm">Discovery Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Totalt oppdaget', value: opportunities.length, color: 'text-blue-400' },
                    { label: 'Under vurdering', value: investigatingCount, color: 'text-amber-400' },
                    { label: 'Godkjent/Bygges', value: approvedCount, color: 'text-emerald-400' },
                    { label: 'Deployet/Live', value: deployedCount, color: 'text-green-400' },
                    { label: 'ARR', value: `$${(totals.totalMRR * 12).toLocaleString('en-US')}`, color: 'text-purple-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">{label}</span>
                      <span className={`text-lg font-bold ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stripe Setup */}
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-400" /> Stripe-integrasjon
              </CardTitle>
              <CardDescription>Automatisk revenue tracking via webhooks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <ol className="space-y-2 text-xs text-slate-300">
                  <li className="flex gap-2"><span className="text-emerald-400 font-bold">1.</span> Webhook URL: <code className="bg-slate-700 px-1 rounded text-emerald-300">https://realtyflow-pro-two.vercel.app/api/saas/stripe</code></li>
                  <li className="flex gap-2"><span className="text-emerald-400 font-bold">2.</span> Events: checkout.session.completed, customer.subscription.*, invoice.paid</li>
                  <li className="flex gap-2"><span className="text-emerald-400 font-bold">3.</span> Env vars: STRIPE_WEBHOOK_SECRET + STRIPE_SECRET_KEY</li>
                  <li className="flex gap-2"><span className="text-emerald-400 font-bold">4.</span> I appen: <code className="bg-slate-700 px-1 rounded text-purple-300">{'metadata: { app_slug: "astro" }'}</code></li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Opportunity Detail Modal ──────────────────────────────────────── */}
      {selectedOpp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => { setSelectedOpp(null); setBuildPrompt(null); setUserFeedback(''); }}>
          <div className="bg-slate-800 border border-slate-700 rounded-t-xl sm:rounded-xl w-full sm:max-w-2xl sm:mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-bold text-white">{selectedOpp.title}</h2>
                    {(() => {
                      const cfg = OPP_STATUS_CONFIG[selectedOpp.status];
                      return cfg ? <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge> : null;
                    })()}
                  </div>
                  <p className="text-sm text-slate-400">{selectedOpp.description}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setSelectedOpp(null); setBuildPrompt(null); setUserFeedback(''); }}>
                  <X size={18} />
                </Button>
              </div>

              {/* Score & key metrics */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-slate-700/30 text-center">
                  <div className={`text-2xl font-bold ${selectedOpp.opportunity_score >= 75 ? 'text-green-400' : selectedOpp.opportunity_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {selectedOpp.opportunity_score}
                  </div>
                  <div className="text-[10px] text-slate-500">Score</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-700/30 text-center">
                  <div className="text-lg font-bold text-blue-400">{selectedOpp.competitor_count}</div>
                  <div className="text-[10px] text-slate-500">Konkurrenter</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-700/30 text-center">
                  <div className={`text-lg font-bold ${COMPLEXITY_COLORS[selectedOpp.build_complexity] || 'text-white'}`}>
                    {selectedOpp.estimated_build_days}d
                  </div>
                  <div className="text-[10px] text-slate-500">Byggetid</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-700/30 text-center">
                  <div className={`text-sm font-bold ${MOMENTUM_LABELS[selectedOpp.trend_momentum]?.color || 'text-white'}`}>
                    {MOMENTUM_LABELS[selectedOpp.trend_momentum]?.label || selectedOpp.trend_momentum}
                  </div>
                  <div className="text-[10px] text-slate-500">Trend</div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-4 mb-6">
                <div className="p-3 rounded-lg bg-slate-700/20">
                  <h4 className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Problem</h4>
                  <p className="text-sm text-slate-300">{selectedOpp.problem_statement}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-700/20">
                    <h4 className="text-xs font-semibold text-slate-400 mb-1">Malgruppe</h4>
                    <p className="text-sm text-slate-300">{selectedOpp.target_audience}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-700/20">
                    <h4 className="text-xs font-semibold text-slate-400 mb-1">MRR-potensial</h4>
                    <p className="text-sm text-emerald-400 font-medium">{selectedOpp.estimated_mrr_potential}</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-700/20">
                  <h4 className="text-xs font-semibold text-slate-400 mb-1">Konkurrenter ({selectedOpp.competitor_count})</h4>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {selectedOpp.competitors?.map(c => <Badge key={c} variant="outline" className="text-[10px] border-slate-600">{c}</Badge>)}
                  </div>
                  <p className="text-xs text-red-300">{selectedOpp.competitor_weakness}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-700/20">
                  <h4 className="text-xs font-semibold text-slate-400 mb-1">MVP-features</h4>
                  <div className="space-y-1">
                    {selectedOpp.mvp_features?.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                        <ChevronRight className="h-3 w-3 text-purple-400 shrink-0" /> {f}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-700/20">
                    <h4 className="text-xs font-semibold text-slate-400 mb-1">Prisforslag</h4>
                    <p className="text-sm text-slate-300">{selectedOpp.suggested_pricing}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-700/20">
                    <h4 className="text-xs font-semibold text-slate-400 mb-1">Differensiatorer</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedOpp.differentiators?.map((d, i) => <Badge key={i} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-300">{d}</Badge>)}
                    </div>
                  </div>
                </div>

                {/* Business plan if refined */}
                {selectedOpp.business_plan && (
                  <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <h4 className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1"><FileText className="h-3 w-3" /> Forretningsplan</h4>
                    <div className="text-xs text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">{selectedOpp.business_plan}</div>
                  </div>
                )}

                {/* Build prompt */}
                {buildPrompt && (
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-cyan-400 flex items-center gap-1"><Code2 className="h-3 w-3" /> Claude Code Build Prompt</h4>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] border-cyan-500/30 text-cyan-300"
                        onClick={() => copyToClipboard(buildPrompt)}>
                        <Copy className="h-3 w-3 mr-1" /> {copied ? 'Kopiert!' : 'Kopier'}
                      </Button>
                    </div>
                    <div className="text-xs text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono bg-slate-900/50 p-3 rounded">{buildPrompt}</div>
                    <p className="text-[10px] text-cyan-400/70 mt-2">Kopier denne prompten og lim inn i Claude Code for a bygge appen automatisk.</p>
                  </div>
                )}
              </div>

              {/* Feedback input */}
              <div className="mb-4">
                <textarea
                  value={userFeedback}
                  onChange={e => setUserFeedback(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none resize-none"
                  rows={2}
                  placeholder="Legg til tilbakemelding, onsker eller endringer..."
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {['discovered', 'investigating'].includes(selectedOpp.status) && (
                  <>
                    <Button onClick={() => { refineOpp(selectedOpp); }} disabled={refining === selectedOpp.id}
                      className="bg-purple-600 hover:bg-purple-500">
                      {refining === selectedOpp.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Forfiner...</>
                        : <><Brain className="mr-2 h-4 w-4" /> Undersok &amp; forfin</>}
                    </Button>
                    <Button onClick={() => updateOppStatus(selectedOpp.id, 'approved', userFeedback)}
                      className="bg-emerald-600 hover:bg-emerald-500">
                      <ThumbsUp className="mr-2 h-4 w-4" /> Godkjenn
                    </Button>
                    <Button onClick={() => updateOppStatus(selectedOpp.id, 'rejected')}
                      variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                      <ThumbsDown className="mr-2 h-4 w-4" /> Forkast
                    </Button>
                  </>
                )}
                {['refining', 'approved'].includes(selectedOpp.status) && (
                  <>
                    <Button onClick={() => autoBuild(selectedOpp)} disabled={building === selectedOpp.id}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500">
                      {building === selectedOpp.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lagrer...</>
                        : <><Rocket className="mr-2 h-4 w-4" /> Lagre &amp; klargjor for bygging</>}
                    </Button>
                    <Button onClick={() => generateBuildPrompt(selectedOpp)} disabled={loadingPrompt}
                      variant="outline" className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
                      {loadingPrompt ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Genererer...</>
                        : <><Code2 className="mr-2 h-4 w-4" /> Manuell prompt</>}
                    </Button>
                    <Button onClick={() => { refineOpp(selectedOpp); }} disabled={refining === selectedOpp.id}
                      variant="outline" className="border-purple-500/30 text-purple-300">
                      <RefreshCw className="mr-2 h-4 w-4" /> Forfin mer
                    </Button>
                  </>
                )}
                {selectedOpp.status === 'queued_for_build' && (
                  <div className="w-full space-y-3">
                    <div className="flex items-center gap-2 text-teal-400">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Byggoppgave lagret! Apne Claude Code og kjor: /build-saas</span>
                    </div>
                    {buildPrompt && (
                      <div className="relative">
                        <Button size="sm" variant="outline" className="absolute top-2 right-2 h-7 text-xs border-slate-600"
                          onClick={() => copyToClipboard(buildPrompt)}>
                          {copied ? <><CheckCircle className="h-3 w-3 mr-1" /> Kopiert!</> : <><Copy className="h-3 w-3 mr-1" /> Kopier prompt</>}
                        </Button>
                        <pre className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 overflow-auto max-h-60 whitespace-pre-wrap">
                          {buildPrompt.slice(0, 500)}...
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                {selectedOpp.status === 'building' && (
                  <div className="flex items-center gap-3 w-full">
                    <div className="flex items-center gap-2 text-cyan-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Bygges av Claude Code...</span>
                    </div>
                  </div>
                )}
                {selectedOpp.status === 'deployed' && (
                  <>
                    {selectedOpp.vercel_url && (
                      <a href={selectedOpp.vercel_url} target="_blank" rel="noopener noreferrer">
                        <Button className="bg-green-600 hover:bg-green-500">
                          <ExternalLink className="mr-2 h-4 w-4" /> Apne app
                        </Button>
                      </a>
                    )}
                    <Button onClick={() => updateOppStatus(selectedOpp.id, 'testing')}
                      className="bg-indigo-600 hover:bg-indigo-500">
                      <Eye className="mr-2 h-4 w-4" /> Start testing
                    </Button>
                  </>
                )}
                {selectedOpp.status === 'testing' && (
                  <>
                    {selectedOpp.vercel_url && (
                      <a href={selectedOpp.vercel_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="border-slate-600">
                          <ExternalLink className="mr-2 h-4 w-4" /> Apne app
                        </Button>
                      </a>
                    )}
                    <Button onClick={() => updateOppStatus(selectedOpp.id, 'live')}
                      className="bg-green-600 hover:bg-green-500">
                      <CheckCircle className="mr-2 h-4 w-4" /> Godkjenn &amp; Go Live
                    </Button>
                  </>
                )}
              </div>

              {/* Build result */}
              {buildResult && (
                <div className={`mt-4 p-3 rounded-lg border ${buildResult.error ? 'bg-red-500/5 border-red-500/20' : 'bg-green-500/5 border-green-500/20'}`}>
                  {buildResult.error ? (
                    <p className="text-sm text-red-400">{buildResult.error}</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-green-400 font-medium">Appen er bygget og deployet!</p>
                      {buildResult.vercel_url && (
                        <a href={buildResult.vercel_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-green-300 hover:text-green-200">
                          <ExternalLink className="h-3 w-3" /> {buildResult.vercel_url}
                        </a>
                      )}
                      {buildResult.repo_url && (
                        <a href={buildResult.repo_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-300">
                          <Code2 className="h-3 w-3" /> {buildResult.repo_url}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Build queue info */}
              {buildReady !== null && (
                <div className="mt-3 p-3 rounded-lg bg-slate-500/5 border border-slate-500/20">
                  <p className="text-xs text-slate-400">
                    <AlertCircle className="h-3 w-3 inline mr-1" />
                    Byggoppgaver lagres i ko og plukkes opp av Claude Code. Klikk &quot;Lagre &amp; klargjor for bygging&quot; for a legge til.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Add/Edit App Modal ────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAddModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">
              {selectedApp ? 'Rediger App' : 'Ny ChatGenius App'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Slug (subdomain)</label>
                  <input type="text" value={formSlug}
                    onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                    placeholder="min-app" />
                  <p className="text-[10px] text-slate-500 mt-1">{formSlug || 'xxx'}.chatgenius.pro</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Navn</label>
                  <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                    placeholder="Min App AI" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Beskrivelse</label>
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none resize-none"
                  placeholder="Hva gjor denne appen?" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Kategori</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Status</label>
                  <select value={formStatus} onChange={e => setFormStatus(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none">
                    <option value="development">Utvikling</option>
                    <option value="beta">Beta</option>
                    <option value="live">Live</option>
                    <option value="paused">Pauset</option>
                    <option value="archived">Arkivert</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Farge</label>
                  <input type="color" value={formColor} onChange={e => setFormColor(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 cursor-pointer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Prismodell</label>
                  <select value={formPricing} onChange={e => setFormPricing(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none">
                    <option value="free">Gratis</option>
                    <option value="freemium">Freemium</option>
                    <option value="subscription">Abonnement</option>
                    <option value="one-time">Engangskjop</option>
                    <option value="usage-based">Forbruksbasert</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Pris/mnd (USD)</label>
                  <input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                    placeholder="9.99" step="0.01" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Tech Stack</label>
                  <input type="text" value={formTech} onChange={e => setFormTech(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                    placeholder="next.js, supabase, openai" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Dev Platform</label>
                  <select value={formDevPlatform} onChange={e => setFormDevPlatform(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none">
                    <option value="claude-code">Claude Code</option>
                    <option value="gemini">Gemini</option>
                    <option value="manual">Manuell</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Repo URL (valgfritt)</label>
                <input type="text" value={formRepoUrl} onChange={e => setFormRepoUrl(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                  placeholder="https://github.com/..." />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={handleSaveApp} disabled={!formSlug || !formName || isSaving}
                className="flex-1 bg-gradient-to-r from-purple-600 to-violet-600">
                {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lagrer...</> : selectedApp ? 'Oppdater' : 'Opprett App'}
              </Button>
              <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }} className="border-slate-600">Avbryt</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Opportunity Card ────────────────────────────────────────────────────────

function OpportunityCard({ opp, onApprove, onInvestigate, onReject, onSelect, showRefine }: {
  opp: Opportunity;
  onApprove: () => void;
  onInvestigate: () => void;
  onReject: () => void;
  onSelect: () => void;
  showRefine?: boolean;
}) {
  const scoreColor = opp.opportunity_score >= 75 ? 'text-green-400 border-green-500/30'
    : opp.opportunity_score >= 50 ? 'text-amber-400 border-amber-500/30' : 'text-red-400 border-red-500/30';

  return (
    <Card className="bg-slate-800/50 border-slate-700/50 hover:border-slate-600 transition-all group">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 cursor-pointer" onClick={onSelect}>
            <h4 className="font-semibold text-white group-hover:text-purple-300 transition-colors">{opp.title}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px] border-slate-600">
                {CATEGORY_LABELS[opp.category] || opp.category}
              </Badge>
              {opp.trend_momentum && (
                <span className={`text-[10px] ${MOMENTUM_LABELS[opp.trend_momentum]?.color || 'text-slate-400'}`}>
                  {MOMENTUM_LABELS[opp.trend_momentum]?.label}
                </span>
              )}
            </div>
          </div>
          <div className={`flex items-center justify-center w-12 h-12 rounded-lg border ${scoreColor} bg-slate-900/50`}>
            <div>
              <div className={`text-lg font-bold ${scoreColor.split(' ')[0]}`}>{opp.opportunity_score}</div>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-400 mb-3 line-clamp-2 cursor-pointer" onClick={onSelect}>{opp.description}</p>

        {/* Key metrics row */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
          <div className="p-1.5 rounded bg-slate-700/30">
            <div className="text-xs font-bold text-blue-400">{opp.competitor_count}</div>
            <div className="text-[9px] text-slate-500">Konk.</div>
          </div>
          <div className="p-1.5 rounded bg-slate-700/30">
            <div className={`text-xs font-bold ${COMPLEXITY_COLORS[opp.build_complexity] || 'text-white'}`}>{opp.estimated_build_days}d</div>
            <div className="text-[9px] text-slate-500">Bygg</div>
          </div>
          <div className="p-1.5 rounded bg-slate-700/30">
            <div className="text-xs font-bold text-emerald-400">{opp.estimated_mrr_potential?.split(' ')[0] || '?'}</div>
            <div className="text-[9px] text-slate-500">MRR</div>
          </div>
          <div className="p-1.5 rounded bg-slate-700/30">
            <div className="text-xs font-bold text-purple-400">{opp.mvp_features?.length || 0}</div>
            <div className="text-[9px] text-slate-500">Features</div>
          </div>
        </div>

        {/* Tech stack */}
        <div className="flex flex-wrap gap-1 mb-3">
          {opp.tech_stack_suggestion?.slice(0, 4).map((t) => (
            <Badge key={t} variant="outline" className="text-[9px] border-slate-600 text-slate-500">{t}</Badge>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button size="sm" onClick={onApprove} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 flex-1">
            <ThumbsUp className="h-3 w-3 mr-1" /> Godkjenn
          </Button>
          <Button size="sm" onClick={onInvestigate} variant="outline" className="h-7 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10 flex-1">
            <Microscope className="h-3 w-3 mr-1" /> {showRefine ? 'Detaljer' : 'Undersok'}
          </Button>
          <Button size="sm" onClick={onReject} variant="outline" className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10">
            <ThumbsDown className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── App Card ────────────────────────────────────────────────────────────────

function AppCard({ app, onEdit }: { app: SaaSApp; onEdit: (app: SaaSApp) => void }) {
  const statusCfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.development;
  const StatusIcon = statusCfg.icon;

  return (
    <Card className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
      onClick={() => onEdit(app)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: app.color || '#8b5cf6' }}>
              {app.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-white group-hover:text-purple-300 transition-colors">{app.name}</h3>
              <p className="text-xs text-slate-500">{app.domain}</p>
            </div>
          </div>
          <Badge className={`text-[10px] ${statusCfg.color}`}>
            <StatusIcon className="h-3 w-3 mr-1" />{statusCfg.label}
          </Badge>
        </div>
        {app.description && <p className="text-xs text-slate-400 mb-3 line-clamp-2">{app.description}</p>}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 rounded bg-slate-700/30">
            <div className="text-sm font-bold text-white">{app.total_users || 0}</div>
            <div className="text-[10px] text-slate-500">Brukere</div>
          </div>
          <div className="text-center p-2 rounded bg-slate-700/30">
            <div className="text-sm font-bold text-emerald-400">${(app.mrr || 0).toFixed(0)}</div>
            <div className="text-[10px] text-slate-500">MRR</div>
          </div>
          <div className="text-center p-2 rounded bg-slate-700/30">
            <div className="text-sm font-bold text-blue-400">{app.price_monthly ? `$${app.price_monthly}` : 'Gratis'}</div>
            <div className="text-[10px] text-slate-500">Pris/mnd</div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {app.tech_stack?.slice(0, 3).map((tech) => (
              <Badge key={tech} variant="outline" className="text-[9px] border-slate-600 text-slate-500">{tech}</Badge>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {app.dev_platform && (
              <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400">
                <Code2 className="h-2.5 w-2.5 mr-0.5" />{app.dev_platform}
              </Badge>
            )}
            {app.live_url && (
              <a href={app.live_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="text-slate-500 hover:text-purple-400"><ExternalLink className="h-3.5 w-3.5" /></a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
