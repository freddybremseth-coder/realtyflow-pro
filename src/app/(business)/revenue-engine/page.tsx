"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle,
  Clipboard,
  ExternalLink,
  ListChecks,
  Loader2,
  Mail,
  MessageSquareText,
  PhoneCall,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
  Trophy,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buildRevenueOpportunities,
  buildRevenueDailyWorklist,
  buildRevenueRecommendedFocus,
  buildRevenueSummary,
  getDefaultRevenueCampaign,
  getRevenueStageLabel,
  getRevenueSuggestedFollowUpDate,
  type RevenueCampaignSettings,
  type RevenueEngineImport,
  type RevenueEngineLead,
  type RevenueEngineOpportunity,
  type RevenueEngineOrder,
  type RevenueEngineStage,
  type RevenueRecommendedFocus,
  type RevenueWorklistItem,
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

type RevenueWorkflowAction = {
  label: string;
  leadStatus: string;
  outreachStatus: string;
  note: string;
  followUpAt?: string | null;
  requiresFollowUp?: boolean;
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

function worklistUrgencyStyle(urgency: RevenueWorklistItem["urgency"]) {
  switch (urgency) {
    case "overdue":
      return "border-red-400/30 bg-red-400/10 text-red-100";
    case "today":
      return "border-amber-400/30 bg-amber-400/10 text-amber-100";
    case "scheduled":
      return "border-slate-600 bg-slate-800 text-slate-300";
    case "none":
      return "border-slate-700 bg-slate-950 text-slate-500";
  }
}

function nextPlayChannelStyle(channel: RevenueEngineOpportunity["nextPlay"]["channel"]) {
  switch (channel) {
    case "quality_check":
      return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
    case "email":
      return "border-sky-400/30 bg-sky-400/10 text-sky-100";
    case "phone":
      return "border-amber-400/30 bg-amber-400/10 text-amber-100";
    case "dm":
      return "border-purple-400/30 bg-purple-400/10 text-purple-100";
    case "session":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
    case "ops":
      return "border-teal-400/30 bg-teal-400/10 text-teal-100";
    case "hold":
      return "border-slate-700 bg-slate-950 text-slate-500";
  }
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
  const [requestedLeadId, setRequestedLeadId] = useState<string | null>(null);
  const [requestedOpportunityId, setRequestedOpportunityId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [workflowLoadingId, setWorkflowLoadingId] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");

  const opportunities = useMemo(
    () => buildRevenueOpportunities(imports, orders, leads, campaign),
    [campaign, imports, leads, orders],
  );
  const summary = useMemo(() => buildRevenueSummary(opportunities), [opportunities]);
  const worklist = useMemo(() => buildRevenueDailyWorklist(opportunities, 5), [opportunities]);
  const recommendedFocus = useMemo(() => buildRevenueRecommendedFocus(opportunities), [opportunities]);
  const selectedOpportunity = opportunities.find((item) => item.id === selectedId) || opportunities[0] || null;
  const suggestedFollowUpDate = useMemo(
    () => selectedOpportunity ? getRevenueSuggestedFollowUpDate(selectedOpportunity.stage) : "",
    [selectedOpportunity?.stage],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedLeadId(params.get("lead"));
    setRequestedOpportunityId(params.get("opportunity"));
  }, []);

  useEffect(() => {
    const requestedOpportunity = requestedLeadId
      ? opportunities.find((item) => item.leadId === requestedLeadId || item.id === requestedLeadId)
      : requestedOpportunityId
        ? opportunities.find((item) => item.id === requestedOpportunityId)
        : null;

    if (requestedOpportunity && selectedId !== requestedOpportunity.id) {
      setSelectedId(requestedOpportunity.id);
      return;
    }

    if (!selectedId && opportunities[0]) setSelectedId(opportunities[0].id);
  }, [opportunities, requestedLeadId, requestedOpportunityId, selectedId]);

  useEffect(() => {
    setFollowUpDate(selectedOpportunity?.followUpAt || suggestedFollowUpDate);
    setWorkflowError(null);
    setWorkflowMessage(null);
  }, [selectedOpportunity?.followUpAt, selectedOpportunity?.id, suggestedFollowUpDate]);

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

  async function updateOpportunityWorkflow(opportunity: RevenueEngineOpportunity, action: RevenueWorkflowAction) {
    if (action.requiresFollowUp && !action.followUpAt) {
      setWorkflowError("Sett neste oppfølgingsdato før du markerer denne som kontaktet.");
      return;
    }

    setWorkflowLoadingId(opportunity.id);
    setWorkflowError(null);
    setWorkflowMessage(null);

    const now = new Date().toISOString();
    const metadata = {
      revenue_engine: {
        last_action: action.label,
        last_action_at: now,
        next_follow_up_at: action.followUpAt || null,
        note: action.note,
      },
    };
    const payload = opportunity.leadId
      ? {
          id: opportunity.leadId,
          lead_status: action.leadStatus,
          outreach_status: action.outreachStatus,
          demo_preview_url: opportunity.previewUrl || undefined,
          demo_claim_url: opportunity.claimUrl || undefined,
          metadata,
          notes: action.note,
        }
      : {
          company_name: opportunity.companyName,
          website_url: opportunity.websiteUrl,
          industry: opportunity.industry,
          source: "revenue_engine",
          source_query: "Revenue Engine",
          lead_status: action.leadStatus,
          outreach_status: action.outreachStatus,
          demo_preview_url: opportunity.previewUrl || undefined,
          demo_claim_url: opportunity.claimUrl || undefined,
          metadata,
          notes: action.note,
        };

    try {
      const response = await fetch("/api/saas/demosites/leads", {
        method: opportunity.leadId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getErrorMessage(data, "Kunne ikke oppdatere Revenue Engine-status."));

      setWorkflowMessage(`${opportunity.companyName}: ${action.label}`);
      await loadData();
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Kunne ikke oppdatere Revenue Engine-status.");
    } finally {
      setWorkflowLoadingId(null);
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

        {recommendedFocus && (
          <RecommendedFocusPanel
            focus={recommendedFocus}
            selected={selectedOpportunity?.id === recommendedFocus.id}
            onSelect={setSelectedId}
          />
        )}

        <CampaignPanel campaign={campaign} onChange={setCampaign} />
        <DailyWorklistPanel items={worklist} selectedId={selectedOpportunity?.id || null} onSelect={setSelectedId} />

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
                            <Badge className={nextPlayChannelStyle(item.nextPlay.channel)} variant="outline">{item.nextPlay.channelLabel}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-400">{item.industry} · {item.templateSlug}</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black ${scoreTone(item.priorityScore)}`}>{item.priorityScore}</div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Prioritet</div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">{item.nextPlay.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.nextAction}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        {item.previewUrl && <span>Preview klar</span>}
                        {item.orderId && <span>Demo koblet</span>}
                        {item.followUpAt && <span>Oppfølging {formatDate(item.followUpAt)}</span>}
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
              followUpDate={followUpDate}
              suggestedFollowUpDate={suggestedFollowUpDate}
              workflowError={workflowError}
              workflowLoading={workflowLoadingId === selectedOpportunity.id}
              workflowMessage={workflowMessage}
              onFollowUpDateChange={setFollowUpDate}
              onCopy={copyText}
              onWorkflowAction={updateOpportunityWorkflow}
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

function RecommendedFocusPanel({
  focus,
  selected,
  onSelect,
}: {
  focus: RevenueRecommendedFocus;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="border-emerald-400/30 bg-emerald-400/10 text-white">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-100">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Neste handling nå
              </span>
              <Badge className={STAGE_STYLES[focus.stage]} variant="outline">{getRevenueStageLabel(focus.stage)}</Badge>
              <Badge className={worklistUrgencyStyle(focus.urgency)} variant="outline">{focus.urgencyLabel}</Badge>
              <Badge className="border-slate-700 bg-slate-950 text-slate-300" variant="outline">{focus.channelLabel}</Badge>
              <span className="text-xs font-semibold text-emerald-200">Score {focus.priorityScore}/100</span>
            </div>
            <h2 className="text-xl font-black text-white">{focus.companyName}</h2>
            <p className="mt-2 text-base font-semibold leading-6 text-emerald-50">{focus.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">{focus.action}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">Hvorfor: {focus.reason}</p>
            {focus.checklist.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                {focus.checklist.map((item) => (
                  <div key={item} className="rounded-lg border border-emerald-300/10 bg-slate-950/40 p-3 text-xs leading-5 text-slate-200">
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">{focus.timing}</p>
            <Button
              onClick={() => onSelect(focus.id)}
              className="bg-emerald-300 text-slate-950 hover:bg-emerald-200"
              disabled={selected}
            >
              {selected ? "Åpen nå" : "Åpne anbefalt play"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyWorklistPanel({ items, selectedId, onSelect }: { items: RevenueWorklistItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <Card className="border-slate-800 bg-slate-900/80 text-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-300" /> Dagens salgsfokus</CardTitle>
        <CardDescription>De viktigste manuelle neste stegene fra demoer, leads og importhistorikk.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-400">
            Ingen aktive salgssteg akkurat nå.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            {items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`rounded-lg border p-4 text-left transition hover:border-amber-300/50 ${selectedId === item.id ? "border-amber-300/50 bg-amber-300/10" : "border-slate-800 bg-slate-950/60"}`}
              >
                <div className="text-xs font-bold uppercase tracking-wide text-amber-200">#{index + 1}</div>
                <h3 className="mt-2 line-clamp-2 font-bold text-white">{item.companyName}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className={STAGE_STYLES[item.stage]} variant="outline">{getRevenueStageLabel(item.stage)}</Badge>
                  <Badge className={worklistUrgencyStyle(item.urgency)} variant="outline">{item.urgencyLabel}</Badge>
                  <Badge className="border-slate-700 bg-slate-950 text-slate-300" variant="outline">{item.channelLabel}</Badge>
                </div>
                <p className="mt-3 text-sm font-semibold leading-5 text-slate-200">{item.playTitle}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.timing}</p>
                {item.followUpAt && <p className="mt-3 text-xs text-slate-500">Oppfølging {formatDate(item.followUpAt)}</p>}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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

function OpportunityPanel({
  opportunity,
  copied,
  followUpDate,
  workflowError,
  workflowLoading,
  workflowMessage,
  suggestedFollowUpDate,
  onCopy,
  onFollowUpDateChange,
  onWorkflowAction,
}: {
  opportunity: RevenueEngineOpportunity;
  copied: string | null;
  followUpDate: string;
  suggestedFollowUpDate: string;
  workflowError: string | null;
  workflowLoading: boolean;
  workflowMessage: string | null;
  onCopy: (label: string, value: string) => void;
  onFollowUpDateChange: (value: string) => void;
  onWorkflowAction: (opportunity: RevenueEngineOpportunity, action: RevenueWorkflowAction) => void;
}) {
  const actionBase = `${opportunity.companyName} ble oppdatert fra Revenue Engine. Ingen automatisk kundekontakt er sendt.`;
  const followUpNote = followUpDate
    ? `${actionBase} Neste manuelle oppfølging: ${followUpDate}.`
    : `${actionBase} Neste manuelle oppfølging bør settes.`;

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
            <Badge className={nextPlayChannelStyle(opportunity.nextPlay.channel)} variant="outline">{opportunity.nextPlay.channelLabel}</Badge>
            {opportunity.followUpAt && <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-100">Oppfølging {formatDate(opportunity.followUpAt)}</Badge>}
          </div>

          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-cyan-100">
                <ListChecks className="h-4 w-4" /> Anbefalt neste play
              </h3>
              <Badge className={nextPlayChannelStyle(opportunity.nextPlay.channel)} variant="outline">{opportunity.nextPlay.primaryCopyLabel}</Badge>
            </div>
            <p className="mt-3 text-base font-bold text-white">{opportunity.nextPlay.title}</p>
            <p className="mt-2 text-sm leading-6 text-cyan-50/80">{opportunity.nextPlay.rationale}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">{opportunity.nextPlay.timing}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {opportunity.nextPlay.checklist.map((item) => (
                <div key={item} className="rounded-md border border-cyan-300/10 bg-slate-950/40 p-3 text-xs leading-5 text-slate-200">{item}</div>
              ))}
            </div>
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
          <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-emerald-300" /> Pipeline-styring</CardTitle>
          <CardDescription>Oppdater status og neste oppfølging manuelt. Ingen e-post, SMS eller kundekontakt sendes her.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!opportunity.leadId && (
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-cyan-100">
              Denne muligheten kommer fra importhistorikk. Første statusendring oppretter en lead-rad automatisk.
            </div>
          )}
          {workflowMessage && <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">{workflowMessage}</div>}
          {workflowError && <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{workflowError}</div>}
          {opportunity.workflowNote && <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">{opportunity.workflowNote}</div>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <WorkflowButton
              disabled={workflowLoading}
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Klar til kontakt"
              onClick={() => onWorkflowAction(opportunity, {
                label: "Klar til kontakt",
                leadStatus: "outreach_ready",
                outreachStatus: "approved",
                note: `${actionBase} Outreach er manuelt godkjent og klart for kontakt.`,
              })}
            />
            <WorkflowButton
              disabled={workflowLoading}
              icon={<Send className="h-4 w-4" />}
              label="Kontaktet"
              onClick={() => onWorkflowAction(opportunity, {
                label: "Kontaktet manuelt",
                leadStatus: "contacted",
                outreachStatus: "sent",
                note: followUpNote,
                followUpAt: followUpDate || null,
                requiresFollowUp: true,
              })}
            />
            <WorkflowButton
              disabled={workflowLoading}
              icon={<CalendarClock className="h-4 w-4" />}
              label="Session booket"
              onClick={() => onWorkflowAction(opportunity, {
                label: "Session booket",
                leadStatus: "responded",
                outreachStatus: "replied",
                note: `${actionBase} Session er booket eller kunden har svart positivt.`,
                followUpAt: followUpDate || null,
              })}
            />
            <WorkflowButton
              disabled={workflowLoading}
              icon={<Trophy className="h-4 w-4" />}
              label="Vunnet"
              onClick={() => onWorkflowAction(opportunity, {
                label: "Vunnet",
                leadStatus: "converted",
                outreachStatus: "replied",
                note: `${actionBase} Muligheten er markert som vunnet.`,
              })}
            />
            <WorkflowButton
              disabled={workflowLoading}
              icon={<XCircle className="h-4 w-4" />}
              label="Ikke fit"
              onClick={() => onWorkflowAction(opportunity, {
                label: "Ikke fit",
                leadStatus: "not_fit",
                outreachStatus: "declined",
                note: `${actionBase} Muligheten er markert som ikke fit akkurat nå.`,
              })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <label>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Neste oppfølging</span>
              <Input type="date" value={followUpDate} onChange={(event) => onFollowUpDateChange(event.target.value)} className="mt-1 border-slate-700 bg-slate-950 text-white" />
              {suggestedFollowUpDate && <span className="mt-1 block text-xs text-slate-500">Foreslått: {formatDate(suggestedFollowUpDate)}</span>}
            </label>
            <div className="flex flex-wrap items-end gap-2 sm:justify-end">
              {suggestedFollowUpDate && followUpDate !== suggestedFollowUpDate && (
                <Button
                  disabled={workflowLoading}
                  type="button"
                  variant="outline"
                  className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                  onClick={() => onFollowUpDateChange(suggestedFollowUpDate)}
                >
                  <CalendarClock className="mr-2 h-4 w-4" /> Bruk forslag
                </Button>
              )}
              <Button
                disabled={workflowLoading || !followUpDate}
                variant="outline"
                className="border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                onClick={() => onWorkflowAction(opportunity, {
                  label: "Oppfølging lagret",
                  leadStatus: "contacted",
                  outreachStatus: "sent",
                  note: followUpNote,
                  followUpAt: followUpDate || null,
                  requiresFollowUp: true,
                })}
              >
                {workflowLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TimerReset className="mr-2 h-4 w-4" />} Lagre oppfølging
              </Button>
            </div>
          </div>
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
          <CopyBlock title={`Emne: ${opportunity.outreach.emailSubject}`} value={opportunity.outreach.emailOne} label="E-post 1" icon={<Mail className="h-4 w-4" />} recommended={opportunity.nextPlay.primaryCopyLabel === "E-post 1"} onCopy={onCopy} />
          <CopyBlock title="Follow-up: 3 ting" value={opportunity.outreach.emailTwo} label="E-post 2" icon={<Mail className="h-4 w-4" />} recommended={opportunity.nextPlay.primaryCopyLabel === "E-post 2"} onCopy={onCopy} />
          <CopyBlock title="Follow-up: demoen er laget for henvendelser" value={opportunity.outreach.emailThree} label="E-post 3" icon={<Mail className="h-4 w-4" />} recommended={opportunity.nextPlay.primaryCopyLabel === "E-post 3"} onCopy={onCopy} />
          <CopyBlock title="Siste follow-up" value={opportunity.outreach.emailFour} label="E-post 4" icon={<Mail className="h-4 w-4" />} recommended={opportunity.nextPlay.primaryCopyLabel === "E-post 4"} onCopy={onCopy} />
          <CopyBlock title="LinkedIn/DM" value={opportunity.outreach.dm} label="DM" icon={<MessageSquareText className="h-4 w-4" />} recommended={opportunity.nextPlay.primaryCopyLabel === "DM"} onCopy={onCopy} />
          <CopyBlock title="Telefonåpning" value={opportunity.outreach.callOpener} label="Telefon" icon={<PhoneCall className="h-4 w-4" />} recommended={opportunity.nextPlay.primaryCopyLabel === "Telefon"} onCopy={onCopy} />
        </CardContent>
      </Card>
    </div>
  );
}

function WorkflowButton({ disabled, icon, label, onClick }: { disabled: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <Button
      disabled={disabled}
      variant="outline"
      className="justify-start border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
      onClick={onClick}
    >
      {icon}
      <span className="ml-2">{label}</span>
    </Button>
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

function CopyBlock({ title, value, label, icon, recommended = false, onCopy }: { title: string; value: string; label: string; icon: ReactNode; recommended?: boolean; onCopy: (label: string, value: string) => void }) {
  return (
    <div className={`rounded-lg border p-4 ${recommended ? "border-emerald-400/30 bg-emerald-400/10" : "border-slate-800 bg-slate-950/70"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          {icon}{title}
          {recommended && <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100" variant="outline">Anbefalt</Badge>}
        </h3>
        <Button size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" onClick={() => onCopy(`${label} kopiert`, value)}>
          <Clipboard className="mr-2 h-3.5 w-3.5" /> Kopier
        </Button>
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-sm leading-6 text-slate-300">{value}</pre>
    </div>
  );
}
