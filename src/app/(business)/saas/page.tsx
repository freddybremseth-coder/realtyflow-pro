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
} from 'lucide-react';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  development: { label: 'Utvikling', color: 'bg-amber-500/20 text-amber-400', icon: Wrench },
  beta: { label: 'Beta', color: 'bg-blue-500/20 text-blue-400', icon: Rocket },
  live: { label: 'Live', color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
  paused: { label: 'Pauset', color: 'bg-slate-500/20 text-slate-400', icon: PauseCircle },
  archived: { label: 'Arkivert', color: 'bg-red-500/20 text-red-400', icon: Archive },
};

const CATEGORY_LABELS: Record<string, string> = {
  'ai-chat': 'AI Chat',
  'real-estate': 'Eiendom',
  music: 'Musikk',
  social: 'Sosiale Medier',
  productivity: 'Produktivitet',
  finance: 'Finans',
  health: 'Helse',
  education: 'Utdanning',
};

// Pre-configured apps based on user's portfolio
const SEED_APPS: Partial<SaaSApp>[] = [
  {
    slug: 'astro',
    name: 'Astro AI',
    domain: 'astro.chatgenius.pro',
    description: 'AI-drevet astrologiassistent med personlige horoskoper og livscoaching',
    category: 'ai-chat',
    color: '#8b5cf6',
    status: 'live',
    pricing_model: 'freemium',
    price_monthly: 9.99,
    tech_stack: ['next.js', 'openai', 'supabase'],
    dev_platform: 'claude-code',
  },
  {
    slug: 'olivia',
    name: 'Olivia AI',
    domain: 'olivia.chatgenius.pro',
    description: 'Personlig AI-assistent for daglige oppgaver, planlegging og produktivitet',
    category: 'ai-chat',
    color: '#ec4899',
    status: 'live',
    pricing_model: 'freemium',
    price_monthly: 14.99,
    tech_stack: ['next.js', 'anthropic', 'supabase'],
    dev_platform: 'claude-code',
  },
  {
    slug: 'realtyflow',
    name: 'RealtyFlow Chat',
    domain: 'realtyflow.chatgenius.pro',
    description: 'AI eiendomsassistent for kjøpere og selgere i Spania',
    category: 'real-estate',
    color: '#06b6d4',
    status: 'live',
    pricing_model: 'subscription',
    price_monthly: 29.99,
    tech_stack: ['next.js', 'anthropic', 'supabase', 'leaflet'],
    dev_platform: 'claude-code',
  },
  {
    slug: 'socialmusichub',
    name: 'Social Music Hub',
    domain: 'socialmusichub.chatgenius.pro',
    description: 'AI-drevet musikkmarkedsføring og sosiale medier-styring',
    category: 'social',
    color: '#f59e0b',
    status: 'beta',
    pricing_model: 'freemium',
    price_monthly: 19.99,
    tech_stack: ['next.js', 'anthropic', 'youtube-api', 'airtable'],
    dev_platform: 'claude-code',
  },
];

export default function SaaSPage() {
  const [apps, setApps] = useState<SaaSApp[]>([]);
  const [totals, setTotals] = useState<Totals>({ totalApps: 0, liveApps: 0, totalUsers: 0, totalMRR: 0, totalRevenue: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<SaaSApp | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch('/api/saas');
      const data = await res.json();
      if (data.apps?.length > 0) {
        setApps(data.apps);
        setTotals(data.totals || { totalApps: 0, liveApps: 0, totalUsers: 0, totalMRR: 0, totalRevenue: 0 });
      } else {
        // Show seed apps as placeholder
        setApps(SEED_APPS as SaaSApp[]);
        setTotals({
          totalApps: SEED_APPS.length,
          liveApps: SEED_APPS.filter(a => a.status === 'live').length,
          totalUsers: 0,
          totalMRR: 0,
          totalRevenue: 0,
        });
      }
    } catch {
      setApps(SEED_APPS as SaaSApp[]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleSaveApp = async () => {
    if (!formSlug || !formName) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/saas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedApp?.id,
          slug: formSlug,
          name: formName,
          domain: `${formSlug}.chatgenius.pro`,
          description: formDesc,
          category: formCategory,
          status: formStatus,
          color: formColor,
          pricing_model: formPricing,
          price_monthly: formPrice ? parseFloat(formPrice) : undefined,
          tech_stack: formTech ? formTech.split(',').map(t => t.trim()) : [],
          dev_platform: formDevPlatform,
          repo_url: formRepoUrl || undefined,
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        resetForm();
        fetchApps();
      }
    } catch { /* ignore */ } finally {
      setIsSaving(false);
    }
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

  const liveApps = apps.filter(a => a.status === 'live');
  const devApps = apps.filter(a => a.status !== 'live' && a.status !== 'archived');
  const archivedApps = apps.filter(a => a.status === 'archived');

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
              <p className="text-slate-400">SaaS Portfolio &bull; App Management &bull; Revenue Tracking</p>
            </div>
          </div>
          <Button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500"
          >
            <Plus className="mr-2 h-4 w-4" /> Ny App
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-5">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <Package className="h-5 w-5 mx-auto mb-1 text-purple-400" />
            <div className="text-2xl font-bold text-white">{totals.totalApps}</div>
            <div className="text-xs text-slate-400">Totalt Apper</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <Rocket className="h-5 w-5 mx-auto mb-1 text-green-400" />
            <div className="text-2xl font-bold text-green-400">{totals.liveApps}</div>
            <div className="text-xs text-slate-400">Live</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-blue-400" />
            <div className="text-2xl font-bold text-blue-400">{totals.totalUsers.toLocaleString('nb-NO')}</div>
            <div className="text-xs text-slate-400">Brukere</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-emerald-400" />
            <div className="text-2xl font-bold text-emerald-400">${totals.totalMRR.toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>
            <div className="text-xs text-slate-400">MRR</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-amber-400" />
            <div className="text-2xl font-bold text-amber-400">${totals.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0 })}</div>
            <div className="text-xs text-slate-400">Total Revenue</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="portfolio" className="space-y-6">
        <TabsList>
          <TabsTrigger value="portfolio"><Layout className="mr-2 h-4 w-4" /> Portfolio ({apps.length})</TabsTrigger>
          <TabsTrigger value="factory"><Sparkles className="mr-2 h-4 w-4" /> App Factory</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="mr-2 h-4 w-4" /> Analytics</TabsTrigger>
          <TabsTrigger value="marketing"><Zap className="mr-2 h-4 w-4" /> Marketing</TabsTrigger>
        </TabsList>

        {/* Portfolio Tab */}
        <TabsContent value="portfolio" className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : (
            <>
              {/* Live Apps */}
              {liveApps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <CheckCircle className="h-3 w-3 text-green-400" /> Live Apper ({liveApps.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveApps.map((app) => (
                      <AppCard key={app.slug} app={app} onEdit={openEditModal} />
                    ))}
                  </div>
                </div>
              )}

              {/* In Development */}
              {devApps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Wrench className="h-3 w-3 text-amber-400" /> Under Utvikling ({devApps.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {devApps.map((app) => (
                      <AppCard key={app.slug} app={app} onEdit={openEditModal} />
                    ))}
                  </div>
                </div>
              )}

              {/* Archived */}
              {archivedApps.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Arkiverte ({archivedApps.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {archivedApps.map((app) => (
                      <AppCard key={app.slug} app={app} onEdit={openEditModal} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* App Factory Tab */}
        <TabsContent value="factory" className="space-y-4">
          <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                App Factory &mdash; Fra ide til live app
              </CardTitle>
              <CardDescription>Bruk AI til a planlegge, deretter Claude Code til a bygge</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Workflow */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {[
                    { step: '1', title: 'Ide & Konsept', desc: 'Victoria CEO analyserer marked, maalgruppe og konkurranse. Lager forretningsplan.', icon: '💡', color: 'border-amber-500/30' },
                    { step: '2', title: 'Bygg med Claude Code', desc: 'Apne appen i Claude Code. Bruk planen som kontekst. Du styrer dialogen og endrer underveis.', icon: '🔨', color: 'border-blue-500/30' },
                    { step: '3', title: 'Koble Stripe & Deploy', desc: 'Legg til Stripe product, sett prising. Deploy til Vercel. Registrer i RealtyFlow Pro.', icon: '🚀', color: 'border-green-500/30' },
                    { step: '4', title: 'Markedsforing & Vekst', desc: 'Content Hub + Victoria lager kampanjer. Automatisk publisering pa 6 plattformer.', icon: '📈', color: 'border-pink-500/30' },
                  ].map((item) => (
                    <div key={item.step} className={`p-4 rounded-lg bg-slate-800/50 border ${item.color}`}>
                      <div className="text-2xl mb-2">{item.icon}</div>
                      <h4 className="text-sm font-semibold text-white mb-1">Steg {item.step}: {item.title}</h4>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Ny app planlegger */}
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Planlegg ny app med Victoria CEO</CardTitle>
                    <CardDescription>Beskriv app-ideen, sa lager AI-en en komplett plan</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <textarea
                        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none resize-none"
                        rows={3}
                        placeholder="Beskriv app-ideen din... F.eks: En AI-drevet fitness-coach som lager treningsprogrammer og maalplan basert pa brukerens mal og preferanser. Maalgruppe: 25-45 ar, helsebeviste, villige til a betale $15/mnd."
                      />
                      <div className="flex gap-3">
                        <Button className="bg-gradient-to-r from-purple-600 to-violet-600" disabled>
                          <Sparkles className="mr-2 h-4 w-4" /> Generer Plan (krever ANTHROPIC_API_KEY)
                        </Button>
                        <Button variant="outline" className="border-slate-600" onClick={() => { resetForm(); setShowAddModal(true); }}>
                          <Plus className="mr-2 h-4 w-4" /> Manuelt oppsett
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stripe Setup Guide */}
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-400" />
                      Stripe-integrasjon
                    </CardTitle>
                    <CardDescription>Automatisk revenue tracking via webhooks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <h4 className="text-sm font-medium text-emerald-400 mb-2">Slik setter du opp:</h4>
                        <ol className="space-y-2 text-xs text-slate-300">
                          <li className="flex gap-2"><span className="text-emerald-400 font-bold">1.</span> Opprett konto pa <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">stripe.com</a></li>
                          <li className="flex gap-2"><span className="text-emerald-400 font-bold">2.</span> Ga til Developers &rarr; Webhooks &rarr; Add endpoint</li>
                          <li className="flex gap-2"><span className="text-emerald-400 font-bold">3.</span> URL: <code className="bg-slate-700 px-1 rounded text-emerald-300">https://realtyflow-pro-two.vercel.app/api/saas/stripe</code></li>
                          <li className="flex gap-2"><span className="text-emerald-400 font-bold">4.</span> Events: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid</li>
                          <li className="flex gap-2"><span className="text-emerald-400 font-bold">5.</span> Kopier Webhook Secret &rarr; legg i Vercel env som <code className="bg-slate-700 px-1 rounded">STRIPE_WEBHOOK_SECRET</code></li>
                          <li className="flex gap-2"><span className="text-emerald-400 font-bold">6.</span> Legg ogsa til <code className="bg-slate-700 px-1 rounded">STRIPE_SECRET_KEY</code> i Vercel env</li>
                        </ol>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-700/30">
                        <h4 className="text-sm font-medium text-white mb-1">I hver ChatGenius-app:</h4>
                        <p className="text-xs text-slate-400">
                          Nar du oppretter Stripe Checkout i appen, legg til <code className="bg-slate-700 px-1 rounded text-purple-300">metadata: {'{'} app_slug: &quot;astro&quot; {'}'}</code> slik at webhook vet hvilken app betalingen tilhorer. Da oppdateres MRR, brukere og revenue automatisk i dashboardet.
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <h4 className="text-sm font-medium text-blue-400 mb-1">Hva skjer automatisk:</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                          <div>&#10003; Ny betaling &rarr; MRR oppdateres</div>
                          <div>&#10003; Kansellering &rarr; Churn beregnes</div>
                          <div>&#10003; Ny bruker &rarr; Brukertall oker</div>
                          <div>&#10003; Faktura betalt &rarr; Revenue sporers</div>
                          <div>&#10003; Dashboard oppdateres live</div>
                          <div>&#10003; Daglig analytics lagres</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommended Tech Stack */}
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Anbefalt tech stack for nye apper</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { name: 'Next.js 14', role: 'Frontend + API', color: 'text-white' },
                        { name: 'Supabase', role: 'Database + Auth', color: 'text-emerald-400' },
                        { name: 'Stripe', role: 'Betaling', color: 'text-purple-400' },
                        { name: 'Vercel', role: 'Hosting + Deploy', color: 'text-blue-400' },
                        { name: 'Claude API', role: 'AI-funksjoner', color: 'text-amber-400' },
                        { name: 'Tailwind CSS', role: 'Styling', color: 'text-cyan-400' },
                        { name: 'Claude Code', role: 'Utvikling', color: 'text-pink-400' },
                        { name: 'RealtyFlow Pro', role: 'Business ops', color: 'text-violet-400' },
                      ].map((tech) => (
                        <div key={tech.name} className="p-3 rounded-lg bg-slate-700/30 text-center">
                          <div className={`text-sm font-medium ${tech.color}`}>{tech.name}</div>
                          <div className="text-[10px] text-slate-500">{tech.role}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
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
                </div>
                {apps.filter(a => a.status === 'live').length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">Ingen live-apper med data enda</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white text-sm">Viktige Metrikker</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">ARR (Annual Recurring Revenue)</span>
                    <span className="text-lg font-bold text-emerald-400">${(totals.totalMRR * 12).toLocaleString('en-US')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Gjennomsnittlig pris/bruker</span>
                    <span className="text-lg font-bold text-blue-400">
                      ${totals.totalUsers > 0 ? (totals.totalMRR / totals.totalUsers).toFixed(2) : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Konverteringsrate (trial→paid)</span>
                    <span className="text-lg font-bold text-purple-400">--</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Gjennomsnittlig churn</span>
                    <span className="text-lg font-bold text-amber-400">--</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white text-sm">Vekstplan</CardTitle>
              <CardDescription>ChatGenius.pro SaaS-strategi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { phase: 'Fase 1', goal: 'Launch 4 apper live med betalende brukere', status: 'active', kpi: '100 betalende brukere' },
                  { phase: 'Fase 2', goal: 'Markedsforing via Content Hub og LinkedIn', status: 'planned', kpi: '500 brukere, $2K MRR' },
                  { phase: 'Fase 3', goal: 'Scale med ads, SEO og referral-program', status: 'planned', kpi: '2000 brukere, $10K MRR' },
                  { phase: 'Fase 4', goal: 'Enterprise-plan og partner-integrasjoner', status: 'planned', kpi: '5000 brukere, $25K MRR' },
                ].map((item) => (
                  <div key={item.phase} className="flex items-center gap-4 p-3 rounded-lg bg-slate-700/30">
                    <Badge className={item.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}>
                      {item.phase}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm text-white">{item.goal}</p>
                      <p className="text-xs text-slate-500">KPI: {item.kpi}</p>
                    </div>
                    {item.status === 'active' ? (
                      <Loader2 className="h-4 w-4 text-green-400 animate-spin" />
                    ) : (
                      <Clock className="h-4 w-4 text-slate-600" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketing Tab */}
        <TabsContent value="marketing" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                Markedsforing via Content Hub
              </CardTitle>
              <CardDescription>Publiser innhold for dine SaaS-apper pa tvers av alle plattformer</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-slate-300">
                  Bruk <strong>Content Hub</strong> til a markedsfore ChatGenius-appene dine. Victoria CEO-agenten kan lage kampanjer spesifikt for SaaS:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {[
                    { platform: 'LinkedIn', tip: 'Thought leadership-artikler om AI-chatbots, case studies, ROI-tall', color: 'text-blue-400' },
                    { platform: 'YouTube', tip: 'Produktdemoer, tutorials, "Bygg din egen AI-assistent"-serier', color: 'text-red-400' },
                    { platform: 'TikTok', tip: 'Korte democlips, "AI kan gjore dette"-trender, behind the scenes', color: 'text-pink-400' },
                    { platform: 'Instagram', tip: 'UI-screenshots, testimonials, feature-highlights i Reels', color: 'text-purple-400' },
                    { platform: 'Facebook', tip: 'Målrettet annonsering mot SMB-eiere, gruppeengasjement', color: 'text-blue-500' },
                    { platform: 'Pinterest', tip: 'Infografikker om AI, "How to automate"-pins', color: 'text-red-500' },
                  ].map((item) => (
                    <div key={item.platform} className="p-3 rounded-lg bg-slate-700/30 border border-slate-600/30">
                      <h4 className={`text-sm font-medium ${item.color}`}>{item.platform}</h4>
                      <p className="text-xs text-slate-400 mt-1">{item.tip}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-3">
                  <Button
                    onClick={() => window.location.href = '/content-hub'}
                    className="bg-gradient-to-r from-purple-600 to-violet-600"
                  >
                    <Zap className="mr-2 h-4 w-4" /> Apne Content Hub
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = '/content-studio'}
                    className="border-slate-600"
                  >
                    <Sparkles className="mr-2 h-4 w-4" /> Content Studio
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-white text-sm">Innholds-ideer per App</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {apps.filter(a => a.status === 'live' || a.status === 'beta').map((app) => (
                  <div key={app.slug} className="p-3 rounded-lg bg-slate-700/20 border border-slate-700/30">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: app.color || '#8b5cf6' }} />
                      <h4 className="text-sm font-medium text-white">{app.name}</h4>
                      <Badge className="text-[10px]" variant="outline">{app.domain}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getContentIdeas(app.slug).map((idea, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-slate-600 text-slate-400 cursor-pointer hover:border-purple-500/50 hover:text-purple-300">
                          {idea}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Modal */}
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
                  <input
                    type="text"
                    value={formSlug}
                    onChange={e => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                    placeholder="min-app"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">{formSlug || 'xxx'}.chatgenius.pro</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">Navn</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                    placeholder="Min App AI"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 mb-1.5 block">Beskrivelse</label>
                <textarea
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none resize-none"
                  placeholder="Hva gjor denne appen?"
                />
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
                    <option value="ai-studio">AI Studio</option>
                    <option value="manual">Manuell</option>
                    <option value="mixed">Blanding</option>
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
              <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }}
                className="border-slate-600">
                Avbryt
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// App Card Component
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
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusCfg.label}
          </Badge>
        </div>

        {app.description && (
          <p className="text-xs text-slate-400 mb-3 line-clamp-2">{app.description}</p>
        )}

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
              <Badge key={tech} variant="outline" className="text-[9px] border-slate-600 text-slate-500">
                {tech}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {app.dev_platform && (
              <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400">
                <Code2 className="h-2.5 w-2.5 mr-0.5" />
                {app.dev_platform}
              </Badge>
            )}
            {app.live_url && (
              <a href={app.live_url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-slate-500 hover:text-purple-400">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getContentIdeas(slug: string): string[] {
  const ideas: Record<string, string[]> = {
    astro: ['Daglige horoskop-reels', 'Manedshoroskop-video', '"AI forutsa dette"-TikTok', 'Zodiac-kompatibilitet'],
    olivia: ['Produktivitetstips-serie', 'AI vs menneskelig assistent', 'Demo: planlegg uken med AI', 'Bruker-testimonials'],
    realtyflow: ['Virtuelle eiendomsvisninger', 'Spania-kjopsprosess forklart', 'AI finner drommehuset ditt', 'Prisutvikling-grafer'],
    socialmusichub: ['Slik gar en sang viral', 'AI musikkmarkedsforing demo', 'Before/after: AI-optimalisert', 'Artist success stories'],
  };
  return ideas[slug] || ['Feature-demo', 'Bruker-case', 'Tutorial-video', 'Sammenligningsartikkel'];
}
