"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  Clipboard,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquareText,
  PhoneCall,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buildRevenueOpportunities,
  buildRevenueSummary,
  getDefaultRevenueCampaign,
  getRevenueStageLabel,
  type RevenueCampaignSettings,
  type RevenueEngineImport,
  type RevenueEngineLead,
  type RevenueEngineOpportunity,
  type RevenueEngineOrder,
  type RevenueEngineStage,
} from "@/lib/revenue-engine";

type DemoSitesResponse = {
  orders?: RevenueEngineOrder[];
  error?: string;
};

type ImportsResponse = {
  imports?: RevenueEngineImport[];
  warning?: string;
  error?: string;
};

type LeadsResponse = {
  leads?: RevenueEngineLead[];
  error?: string;
};

const STAGE_STYLES: Record<RevenueEngineStage, string> = {
  analysis_ready: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  demo_ready: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  outreach_ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  follow_up: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  session_booked: "border-purple-500/30 bg-purple-500/10 text-purple-200",
  won: "border-emerald-500/30 bg-emerald-500/20 text-emerald-100",
  not_fit: "border-slate-600/30 bg-slate-700/30 text-slate-400",
};

function scoreTone(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-amber-300";
  return "text-slate-300";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value));
}

function getErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return fallback;
}

function useRevenueData() {
  const [orders, setOrders] = useState<RevenueEngineOrder[]>([]);
  const [imports, setImports] = useState<RevenueEngineImport[]>([]);
  const [leads, setLeads] = useState<RevenueEngineLead[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const [ordersRes, importsRes, leadsRes] = await Promise.allSettled([
        fetch("/api/saas/demosites", { cache: "no-store" }),
        fetch("/api/saas/demosites/imports?limit=50", { cache: "no-store" }),
        fetch("/api/saas/demosites/leads", { cache: "no-store" }),
      ]);

      if (ordersRes.status === "fulfilled") {
        const data = (await ordersRes.value.json().catch(() => ({}))) as DemoSitesResponse;
        if (!ordersRes.value.ok) throw new Error(getErrorMessage(data, "Kunne ikke hente DemoSites ordre."));
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      } else {
        throw ordersRes.reason;
      }

      if (importsRes.status === "fulfilled") {
        const data = (await importsRes.value.json().catch(() => ({}))) as ImportsResponse;
        if (importsRes.value.ok) {
          setImports(Array.isArray(data.imports) ? data.imports : []);
          if (data.warning) setWarnings((current) => [...current, data.warning || ""]);
        } else {
          setWarnings((current) => [...current, getErrorMessage(data, "Kunne ikke hente importhistorikk.")]);
          setImports([]);
        }
      } else {
        setWarnings((current) => [...current, "Kunne ikke hente importhistorikk."]);
      }

      if (leadsRes.status === "fulfilled") {
        const data = (await leadsRes.value.json().catch(() => ({}))) as LeadsResponse;
        if (leadsRes.value.ok) {
          setLeads(Array.isArray(data.leads) ? data.leads : []);
        } else {
          setWarnings((current) => [...current, getErrorMessage(data, "DemoSites lead-pipeline er ikke tilgjengelig ennå.")]);
          setLeads([]);
        }
      } else {
        setWarnings((current) => [...current, "DemoSites lead-pipeline er ikke tilgjengelig ennå."]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente Revenue Engine-data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { orders, imports, leads, warnings: warnings.filter(Boolean), loading, error, loadData };
}

export default function RevenueEnginePage() {
  const { orders, imports, leads, warnings, loading, error, loadData } = useRevenueData();
  const [campaign, setCampaign] = useState<RevenueCampaignSettings>(() => getDefaultRevenueCampaign());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const opportunities = useMemo(
    () => buildRevenueOpportunities(imports, orders, leads, campaign),
    [campaign, imports, leads, orders],
  );
  const summary = useMemo(() => buildRevenueSummary(opportunities), [opportunities]);
  const selectedOpportunity = opportunities.find((item) => item.id === selectedId) || opportunities[0] || null;

  useEffect(() => {
    if (!selectedId && opportunities[0]) setSelectedId(opportunities[0].id);
  }, [opportunities, selectedId]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied("Kunne ikke kopiere");
      window.setTimeout(() => setCopied(null), 1800);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-200">
              <Sparkles className="mr-2 h-3.5 w-3.5" /> Human-in-the-loop automasjon
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-normal md:text-5xl">Revenue Engine</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300">
              Fra nettsideanalyse til privat demo, session-brief og godkjent outreach. Ingen e-post eller SMS sendes automatisk.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Link href="/demosites"><Rocket className="mr-2 h-4 w-4" /> DemoSites CRM</Link>
            </Button>
            <Button onClick={loadData} variant="outline" className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Oppdater
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Muligheter" value={summary.total} icon={<Target className="h-4 w-4" />} />
          <MetricCard label="Høy prioritet" value={summary.highPriority} icon={<TrendingUp className="h-4 w-4" />} />
          <MetricCard label="Demo klar" value={summary.demoReady} icon={<CheckCircle className="h-4 w-4" />} />
          <MetricCard label="Følg opp" value={summary.followUp} icon={<TimerReset className="h-4 w-4" />} />
          <MetricCard label="Sessions" value={summary.sessions} icon={<MessageSquareText className="h-4 w-4" />} />
          <MetricCard label="Vunnet" value={summary.won} icon={<BarChart3 className="h-4 w-4" />} />
        </div>

        {error && (
          <Card className="border-red-500/30 bg-red-950/30 text-red-100">
            <CardContent className="p-4 text-sm">{error}</CardContent>
          </Card>
        )}

        {warnings.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-950/20 text-amber-100">
            <CardContent className="space-y-1 p-4 text-sm">
              {warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}
            </CardContent>
          </Card>
        )}

        <CampaignPanel campaign={campaign} onChange={setCampaign} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-slate-800 bg-slate-900/80 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-cyan-300" /> Neste beste muligheter</CardTitle>
              <CardDescription>Prioritert fra DemoSites importhistorikk, demoer og lead-pipeline.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Henter analyser og leads ...</div>
              ) : opportunities.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-6 text-sm text-slate-400">
                  Ingen muligheter ennå. Start med å importere og analysere nettsider i DemoSites.
                </div>
              ) : (
                <div className="space-y-3">
                  {opportunities.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-lg border p-4 text-left transition hover:border-cyan-400/50 ${selectedOpportunity?.id === item.id ? "border-cyan-400/50 bg-cyan-400/10" : "border-slate-800 bg-slate-950/50"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-white">{item.companyName}</h3>
                            <Badge className={STAGE_STYLES[item.stage]} variant="outline">{getRevenueStageLabel(item.stage)}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-400">{item.industry} · {item.templateSlug}</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black ${scoreTone(item.priorityScore)}`}>{item.priorityScore}</div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Prioritet</div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{item.nextAction}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        {item.previewUrl && <span>Preview klar</span>}
                        {item.orderId && <span>Demo koblet</span>}
                        {item.createdAt && <span>{formatDate(item.createdAt)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedOpportunity ? (
            <OpportunityPanel
              opportunity={selectedOpportunity}
              copied={copied}
              onCopy={copyText}
            />
          ) : (
            <Card className="border-slate-800 bg-slate-900/80 text-white">
              <CardContent className="p-6 text-sm text-slate-400">Velg en mulighet for å se session-brief og outreach.</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-white">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-black">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">{icon}</span>
      </CardContent>
    </Card>
  );
}

function CampaignPanel({ campaign, onChange }: { campaign: RevenueCampaignSettings; onChange: (next: RevenueCampaignSettings) => void }) {
  function update(key: keyof RevenueCampaignSettings, value: string) {
    onChange({ ...campaign, [key]: value });
  }

  return (
    <Card className="border-slate-800 bg-slate-900/80 text-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-300" /> Kampanjeoppsett</CardTitle>
        <CardDescription>Styr ordene Revenue Engine bruker i session-brief og outreach. Alt er manuelt godkjent.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Bransje" value={campaign.industry} onChange={(value) => update("industry", value)} />
        <Field label="Område" value={campaign.area} onChange={(value) => update("area", value)} />
        <Field label="CTA" value={campaign.cta} onChange={(value) => update("cta", value)} />
        <Field label="Tilbud" value={campaign.offer} onChange={(value) => update("offer", value)} className="xl:col-span-2" />
        <Field label="Booking-lenke" value={campaign.bookingUrl} onChange={(value) => update("bookingUrl", value)} />
        <Field label="Pakke/pris" value={campaign.packageName} onChange={(value) => update("packageName", value)} className="md:col-span-2 xl:col-span-3" />
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <label className={className}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 border-slate-700 bg-slate-950 text-white" />
    </label>
  );
}

function OpportunityPanel({ opportunity, copied, onCopy }: { opportunity: RevenueEngineOpportunity; copied: string | null; onCopy: (label: string, value: string) => void }) {
  return (
    <div className="space-y-6">
      <Card className="border-slate-800 bg-slate-900/80 text-white">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">{opportunity.companyName}</CardTitle>
              <CardDescription>{opportunity.websiteUrl || "Mangler nettside"} · {opportunity.industry}</CardDescription>
            </div>
            <div className={`text-3xl font-black ${scoreTone(opportunity.priorityScore)}`}>{opportunity.priorityScore}</div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge className={STAGE_STYLES[opportunity.stage]} variant="outline">{getRevenueStageLabel(opportunity.stage)}</Badge>
            <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">Confidence {opportunity.confidenceScore}</Badge>
            <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300">{opportunity.source === "import" ? "Fra import" : "Fra lead"}</Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {opportunity.previewUrl && (
              <Button asChild className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                <a href={opportunity.previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Åpne preview</a>
              </Button>
            )}
            {opportunity.orderId && (
              <Button asChild variant="outline" className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800">
                <Link href={`/demosites/setup/${opportunity.orderId}`}><ArrowRight className="mr-2 h-4 w-4" /> Oppsett</Link>
              </Button>
            )}
          </div>

          <InfoList title="Hvorfor denne er interessant" items={opportunity.reasons} />
          <InfoList title="Sjekk før kontakt" items={opportunity.risks} muted />
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/80 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-purple-300" /> Session brief</CardTitle>
          <CardDescription>Bruk dette i en 10-15 min gjennomgang.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm leading-6 text-slate-200">{opportunity.sessionBrief.hook}</p>
          <InfoList title="Problemer å vise" items={opportunity.sessionBrief.problems} />
          <InfoList title="Forbedringer å vise" items={opportunity.sessionBrief.improvements} />
          <InfoList title="Agenda" items={opportunity.sessionBrief.agenda} />
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            Close: {opportunity.sessionBrief.closeQuestion}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900/80 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-cyan-300" /> Outreach-utkast</CardTitle>
          <CardDescription>Kopier manuelt. Ingen automatisk sending skjer her.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {copied && <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">{copied}</div>}
          <CopyBlock title={`Emne: ${opportunity.outreach.emailSubject}`} value={opportunity.outreach.emailOne} label="E-post 1" icon={<Mail className="h-4 w-4" />} onCopy={onCopy} />
          <CopyBlock title="Follow-up: 3 ting" value={opportunity.outreach.emailTwo} label="E-post 2" icon={<Mail className="h-4 w-4" />} onCopy={onCopy} />
          <CopyBlock title="Follow-up: demoen er laget for henvendelser" value={opportunity.outreach.emailThree} label="E-post 3" icon={<Mail className="h-4 w-4" />} onCopy={onCopy} />
          <CopyBlock title="Siste follow-up" value={opportunity.outreach.emailFour} label="E-post 4" icon={<Mail className="h-4 w-4" />} onCopy={onCopy} />
          <CopyBlock title="LinkedIn/DM" value={opportunity.outreach.dm} label="DM" icon={<MessageSquareText className="h-4 w-4" />} onCopy={onCopy} />
          <CopyBlock title="Telefonåpning" value={opportunity.outreach.callOpener} label="Telefon" icon={<PhoneCall className="h-4 w-4" />} onCopy={onCopy} />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoList({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item} className={muted ? "rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400" : "rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200"}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyBlock({ title, value, label, icon, onCopy }: { title: string; value: string; label: string; icon: ReactNode; onCopy: (label: string, value: string) => void }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">{icon}{title}</h3>
        <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" onClick={() => onCopy(`${label} kopiert`, value)}>
          <Clipboard className="mr-2 h-3.5 w-3.5" /> Kopier
        </Button>
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-sm leading-6 text-slate-300">{value}</pre>
    </div>
  );
}
