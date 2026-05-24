"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3, TrendingUp, Globe, FileText, Send, RefreshCw,
  Calendar, Clock, Eye, Mail, Zap, DollarSign,
  Users, Building2, Newspaper, ArrowUpRight, ArrowDownRight, Loader2,
} from "lucide-react";
import { AdvisorPlaybooksStudio, type AdvisorMarketContext } from "@/components/advisor/advisor-playbooks-studio";

// ─── Types ───────────────────────────────────────────────────
interface Report {
  id: string;
  template_id: string;
  title: string;
  subtitle?: string;
  summary?: string;
  content_html?: string;
  content_text?: string;
  key_metrics?: { label: string; value: string; change?: string }[];
  sections?: { heading: string; content: string }[];
  theme?: string;
  brand?: string;
  recipients: string;
  sent_at?: string;
  sent_to?: string[];
  generated_at: string;
  data_sources?: string[];
}

interface MarketSnapshot {
  eur_nok?: number;
  eur_nok_7d_change?: number;
  eur_sek?: number;
  eur_gbp?: number;
  ecb_rate?: number;
  ecb_rate_previous?: number;
  idealista_news?: { title: string; link: string; date: string; summary: string }[];
  perplexity_insights?: { topic: string; summary: string; details: string; sources?: string[] }[];
  internal_metrics?: Record<string, number>;
  raw_data?: {
    interestRates?: InterestRates;
    perplexityInsights?: { topic: string; summary: string; details: string; sources?: string[] }[];
  };
  fetched_at?: string;
}

interface InterestRates {
  norway?: {
    policyRate: number;
    policyRateDate?: string;
    bankMarkupMin: number;
    bankMarkupMax: number;
    estimatedMortgageMin: number;
    estimatedMortgageMax: number;
    note?: string;
  };
  spain?: {
    ecbDepositRate: number;
    ecbMainRefinancingRate: number;
    ecbMarginalLendingRate: number;
    ecbRateDate?: string;
    bankMarkupMin: number;
    bankMarkupMax: number;
    estimatedMortgageMin: number;
    estimatedMortgageMax: number;
    note?: string;
  };
}

interface Contact {
  id: string;
  name?: string;
  email?: string;
  pipeline_status?: string;
}

interface SavedInsight {
  id?: string;
  topic: string;
  summary: string;
  details: string;
  date?: string;
  created_at?: string;
  sources?: string[];
}

type ReportsTab = "oversikt" | "rapporter" | "markedsdata" | "ekspertinnhold" | "mottakere";

// ─── Template Config ─────────────────────────────────────────
const TEMPLATES = [
  { id: "tall-og-trender", name: "Tall og Trender", icon: BarChart3, color: "text-cyan-400", bg: "bg-cyan-500/15", freq: "Annenhver uke" },
  { id: "det-store-bildet", name: "Det Store Bildet", icon: Globe, color: "text-purple-400", bg: "bg-purple-500/15", freq: "Månedlig" },
  { id: "brand-spotlight", name: "Brand Spotlight", icon: Zap, color: "text-amber-400", bg: "bg-amber-500/15", freq: "Månedlig" },
  { id: "intern-ukesoppsummering", name: "Intern Ukesoppsummering", icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/15", freq: "Fredag" },
  { id: "dona-anna-sesong", name: "Dona Anna Sesongbrev", icon: Newspaper, color: "text-orange-400", bg: "bg-orange-500/15", freq: "Kvartalsvis" },
];

const RECIPIENT_GROUP_LABELS: Record<string, string> = {
  all: "alle aktive rapportmottakere",
  investors: "investorlisten",
  leads: "aktive leads",
  internal: "internlisten",
  donaanna: "Dona Anna-listen",
  portal_all: "alle portalbrukere",
  portal_selected: "valgte portalbrukere",
};

function getRecipientDescription(report?: Pick<Report, "recipients"> | null) {
  const group = report?.recipients || "internal";
  const label = RECIPIENT_GROUP_LABELS[group] || group;
  if (group === "donaanna") {
    return `${label} (olivenoljekunder og grossister). Hvis listen er tom, brukes Freddy som fallback.`;
  }
  return `${label}. Hvis listen er tom, brukes Freddy som fallback.`;
}

function isOffBrandDonaAnnaReport(report: Report) {
  if (report.template_id !== "dona-anna-sesong") return false;
  const text = [
    report.title,
    report.subtitle,
    report.summary,
    report.content_text,
    ...(report.sections || []).flatMap(section => [section.heading, section.content]),
  ].filter(Boolean).join(" ");
  return /finansmarked|boligmarked|eiendomsmarked|boligkjøp|rente|ecb|eur\/?nok|eurokurs|investor|costa blanca/i.test(text);
}

// ─── Component ───────────────────────────────────────────────
export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<{ reportId: string; type: "success" | "error" | "info"; message: string } | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [activeTab, setActiveTab] = useState<ReportsTab>("oversikt");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [portalMode, setPortalMode] = useState<"all" | "selected">("all");
  const [selectedContactEmails, setSelectedContactEmails] = useState<string[]>([]);
  const [portalPublishing, setPortalPublishing] = useState<string | null>(null);
  const [portalStatus, setPortalStatus] = useState<"idle" | "saved" | "error">("idle");
  const [reportApproved, setReportApproved] = useState(false);

  // Manual market intelligence input
  const [manualInsightTopic, setManualInsightTopic] = useState("Costa Blanca eiendomsmarked");
  const [manualInsightText, setManualInsightText] = useState("");
  const [savingInsight, setSavingInsight] = useState(false);
  const [savedInsights, setSavedInsights] = useState<SavedInsight[]>([]);
  const [buyerReportTitle, setBuyerReportTitle] = useState("Markedsrapport for norske boligkjøpere");
  const [buyerReportArea, setBuyerReportArea] = useState("Costa Blanca Sør");
  const [buyerReportSource, setBuyerReportSource] = useState("");
  const [buyerDrafting, setBuyerDrafting] = useState(false);
  const [insightGenerating, setInsightGenerating] = useState<string | null>(null);

  const interestRates: InterestRates = snapshot?.raw_data?.interestRates ?? {
    norway: {
      policyRate: 4.25,
      policyRateDate: "2026-05-07",
      bankMarkupMin: 1.25,
      bankMarkupMax: 2,
      estimatedMortgageMin: 5.5,
      estimatedMortgageMax: 6.25,
    },
    spain: {
      ecbDepositRate: 2,
      ecbMainRefinancingRate: snapshot?.ecb_rate || 2.15,
      ecbMarginalLendingRate: 2.4,
      ecbRateDate: "2025-06-11",
      bankMarkupMin: 0.75,
      bankMarkupMax: 1.75,
      estimatedMortgageMin: Number(((snapshot?.ecb_rate || 2.15) + 0.75).toFixed(2)),
      estimatedMortgageMax: Number(((snapshot?.ecb_rate || 2.15) + 1.75).toFixed(2)),
    },
  };

  // Fetch reports and latest snapshot
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, snapshotRes] = await Promise.all([
        fetch("/api/reports?limit=50"),
        fetch("/api/reports?snapshot=latest"),
      ]);
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports || []);
      }
      if (snapshotRes.ok) {
        const data = await snapshotRes.json();
        setSnapshot(data.snapshot || null);
      }
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (
      requestedTab === "oversikt" ||
      requestedTab === "rapporter" ||
      requestedTab === "markedsdata" ||
      requestedTab === "ekspertinnhold" ||
      requestedTab === "mottakere"
    ) {
      setActiveTab(requestedTab);
    }
  }, []);

  useEffect(() => {
    fetch("/api/contacts?view=pipeline")
      .then(r => r.ok ? r.json() : { contacts: [] })
      .then(d => {
        const withEmail = (d.contacts || []).filter((contact: Contact) => contact.email);
        setContacts(withEmail);
      })
      .catch(() => setContacts([]));
  }, []);

  // Generate a report
  const handleGenerate = async (templateId: string) => {
    setGenerating(templateId);
    setSendStatus(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.report) {
          setReports(prev => [data.report, ...prev]);
          setSelectedReport(data.report);
          setReportApproved(false);
          setPortalStatus("idle");
          setActiveTab("rapporter");
          const url = new URL(window.location.href);
          url.searchParams.set("tab", "rapporter");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
    } catch (err) {
      console.error("Failed to generate:", err);
    }
    setGenerating(null);
  };

  // Send a report via email
  const handleSend = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId) || selectedReport;
    setSending(reportId);
    setSendStatus({
      reportId,
      type: "info",
      message: `Sender e-post til ${getRecipientDescription(report)}`
    });
    try {
      const res = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Kunne ikke sende rapporten.");
      }
      if (res.ok) {
        setReports(prev =>
          prev.map(r => r.id === reportId ? { ...r, sent_at: new Date().toISOString(), sent_to: data.sentTo || r.sent_to } : r)
        );
        if (selectedReport?.id === reportId) {
          setSelectedReport(prev => prev ? { ...prev, sent_at: new Date().toISOString(), sent_to: data.sentTo || prev.sent_to } : prev);
        }
        const sentTo = Array.isArray(data.sentTo) && data.sentTo.length > 0 ? data.sentTo.join(", ") : getRecipientDescription(report);
        setSendStatus({
          reportId,
          type: "success",
          message: `Rapporten er sendt til ${sentTo}${data.fallbackRecipientUsed ? " fordi mottakerlisten var tom" : ""}.`
        });
      }
    } catch (err) {
      console.error("Failed to send:", err);
      setSendStatus({
        reportId,
        type: "error",
        message: err instanceof Error ? err.message : "Kunne ikke sende rapporten."
      });
    }
    setSending(null);
  };

  const toggleContact = (email?: string) => {
    if (!email) return;
    const normalized = email.toLowerCase();
    setSelectedContactEmails(prev =>
      prev.includes(normalized) ? prev.filter(item => item !== normalized) : [...prev, normalized]
    );
  };

  const publishToPortal = async (reportId: string) => {
    setPortalPublishing(reportId);
    setPortalStatus("idle");
    try {
      const res = await fetch("/api/reports/publish-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          mode: portalMode,
          recipients: selectedContactEmails,
        }),
      });
      if (!res.ok) throw new Error("Publish failed");
      const data = await res.json();
      setReports(prev => prev.map(r => r.id === reportId ? data.report : r));
      if (selectedReport?.id === reportId) setSelectedReport(data.report);
      setPortalStatus("saved");
      setReportApproved(false);
    } catch (err) {
      console.error("Failed to publish to portal:", err);
      setPortalStatus("error");
    }
    setPortalPublishing(null);
  };

  const createBuyerDraft = async () => {
    if (!buyerReportSource.trim()) return;
    setBuyerDrafting(true);
    try {
      const res = await fetch("/api/reports/buyer-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: buyerReportTitle,
          area: buyerReportArea,
          sourceText: buyerReportSource,
        }),
      });
      if (!res.ok) throw new Error("Draft failed");
      const data = await res.json();
      if (data.report) {
        setReports(prev => [data.report, ...prev]);
        setSelectedReport(data.report);
        setReportApproved(false);
        setPortalStatus("idle");
        setBuyerReportSource("");
        setActiveTab("rapporter");
      }
    } catch (err) {
      console.error("Failed to create buyer draft:", err);
    }
    setBuyerDrafting(false);
  };

  const createFromInsight = async (insight: SavedInsight, outputType: "report" | "presentation" | "both") => {
    if (!insight.id) {
      setBuyerReportSource(insight.details || insight.summary || "");
      setActiveTab("oversikt");
      return;
    }
    setInsightGenerating(`${insight.id}:${outputType}`);
    try {
      const res = await fetch("/api/reports/from-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightIds: [insight.id],
          title: outputType === "presentation" ? `Presentasjon: ${insight.topic}` : `Kjøperrapport: ${insight.topic}`,
          area: buyerReportArea,
          outputType,
        }),
      });
      if (!res.ok) throw new Error("Insight generation failed");
      const data = await res.json();
      if (data.report) {
        setReports(prev => [data.report, ...prev]);
        setSelectedReport(data.report);
        setReportApproved(false);
        setPortalStatus("idle");
        setActiveTab("rapporter");
      }
    } catch (err) {
      console.error("Failed to create report from insight:", err);
    }
    setInsightGenerating(null);
  };

  // Save manual market intelligence
  const saveManualInsight = async () => {
    if (!manualInsightText.trim()) return;
    setSavingInsight(true);
    try {
      const insight = {
        topic: manualInsightTopic,
        summary: manualInsightText.split('\n\n')[0]?.substring(0, 300) || manualInsightText.substring(0, 300),
        details: manualInsightText,
        sources: ['Manuell input'],
        date: new Date().toISOString(),
      };

      const res = await fetch("/api/reports/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insight),
      });

      if (res.ok) {
        const data = await res.json();
        setSavedInsights(prev => [data.insight || insight, ...prev]);
        setManualInsightText("");
      }
    } catch (err) {
      console.error("Failed to save insight:", err);
    }
    setSavingInsight(false);
  };

  // Load saved insights on mount
  useEffect(() => {
    fetch("/api/reports/insights").then(r => r.ok ? r.json() : { insights: [] }).then(d => {
      setSavedInsights(d.insights || []);
    }).catch(() => {});
  }, []);

  // Format date
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
  };
  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  };
  const getInsightDate = (insight: SavedInsight) => insight.created_at || insight.date || "";
  const formatInsightDate = (insight: SavedInsight) => {
    const value = getInsightDate(insight);
    if (!value) return "Uten dato";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Uten dato";
    return date.toLocaleDateString("nb-NO");
  };

  // Get template info
  const getTemplate = (id: string) => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];

  const expertMarketContexts = useMemo<AdvisorMarketContext[]>(() => {
    const contexts: AdvisorMarketContext[] = [];

    if (snapshot) {
      const rateLines = [
        snapshot.eur_nok ? `EUR/NOK: ${snapshot.eur_nok.toFixed(4)}${snapshot.eur_nok_7d_change != null ? ` (${snapshot.eur_nok_7d_change.toFixed(2)}% siste 7 dager)` : ""}` : "",
        interestRates?.spain?.ecbMainRefinancingRate ? `ECB MRO: ${interestRates.spain.ecbMainRefinancingRate}%` : "",
        interestRates?.norway?.policyRate ? `Norges Bank: ${interestRates.norway.policyRate}%` : "",
        interestRates?.spain ? `Estimert spansk lånerente: ${interestRates.spain.estimatedMortgageMin}-${interestRates.spain.estimatedMortgageMax}%` : "",
        interestRates?.norway ? `Estimert norsk boliglån: ${interestRates.norway.estimatedMortgageMin}-${interestRates.norway.estimatedMortgageMax}%` : "",
      ].filter(Boolean);

      const newsLines = (snapshot.idealista_news || [])
        .slice(0, 5)
        .map((item) => `Idealista: ${item.title} (${item.date})\n${item.summary || ""}\n${item.link}`);

      const insightLines = (snapshot.perplexity_insights || snapshot.raw_data?.perplexityInsights || [])
        .slice(0, 5)
        .map((item) => `${item.topic}\n${item.summary}\n${item.details}`);

      contexts.push({
        id: "snapshot-latest",
        type: "snapshot",
        label: "Live markedskontekst: renter, eurokurs og nyheter",
        title: "Live markedskontekst",
        summary: rateLines.join(" · ") || "Siste snapshot fra Market Intelligence.",
        details: [...rateLines, ...newsLines, ...insightLines].join("\n\n"),
        sources: [
          { label: "Market Intelligence snapshot", url: "" },
          ...(snapshot.idealista_news || []).slice(0, 5).map((item) => ({ label: item.title, url: item.link, note: item.date })),
        ],
      });
    }

    savedInsights.slice(0, 20).forEach((insight) => {
      contexts.push({
        id: `insight-${insight.id || insight.created_at || insight.topic}`,
        type: "insight",
        label: `Analyse: ${insight.topic}`,
        title: insight.topic,
        summary: insight.summary,
        details: insight.details,
        sources: (insight.sources || []).map((source) => ({ label: source, url: source.startsWith("http") ? source : "" })),
      });
    });

    reports.slice(0, 20).forEach((report) => {
      const sectionsText = (report.sections || [])
        .map((section) => `${section.heading}\n${String(section.content || "").replace(/<[^>]+>/g, " ")}`)
        .join("\n\n");

      contexts.push({
        id: `report-${report.id}`,
        type: "report",
        label: `Rapport: ${report.title}`,
        title: report.title,
        summary: report.summary || report.subtitle || "",
        details: [report.content_text, sectionsText].filter(Boolean).join("\n\n"),
        sources: (report.data_sources || []).map((source) => ({ label: source, url: source.startsWith("http") ? source : "" })),
      });
    });

    return contexts;
  }, [interestRates, reports, savedInsights, snapshot]);

  const switchTab = (tab: ReportsTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "oversikt") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Intelligence</h1>
          <p className="text-sm text-slate-400 mt-1">
            Markedsdata, renter, eurokurs, rapporter og ekspertinnhold for kundedialog
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white sm:w-auto"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Oppdater
        </button>
      </div>

      {/* Tabs */}
      <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-slate-800/50 p-1 sm:flex sm:w-fit sm:flex-wrap">
        {(["oversikt", "rapporter", "markedsdata", "ekspertinnhold", "mottakere"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
              activeTab === tab ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab === "oversikt"
              ? "Oversikt"
              : tab === "rapporter"
                ? `Rapporter (${reports.length})`
                : tab === "markedsdata"
                  ? "Markedsdata"
                  : tab === "ekspertinnhold"
                    ? "Ekspertinnhold"
                    : "Mottakere"}
          </button>
        ))}
      </div>

      {/* ═══════════ TAB: OVERSIKT ═══════════ */}
      {activeTab === "oversikt" && (
        <div className="space-y-6">
          {/* Live Market Data Cards */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Siste Markedsdata
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">EUR/NOK</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {snapshot?.eur_nok?.toFixed(4) || "--"}
                      </p>
                      {snapshot?.eur_nok_7d_change !== undefined && (
                        <Badge
                          variant={snapshot.eur_nok_7d_change >= 0 ? "destructive" : "success"}
                          className="mt-2 text-[10px]"
                        >
                          {(snapshot.eur_nok_7d_change ?? 0) >= 0 ? "+" : ""}
                          {(snapshot.eur_nok_7d_change ?? 0).toFixed(2)}% 7d
                        </Badge>
                      )}
                    </div>
                    <DollarSign className="text-cyan-400 opacity-60" size={28} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">ECB MRO</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {interestRates?.spain?.ecbMainRefinancingRate
                          ? `${interestRates.spain.ecbMainRefinancingRate}%`
                          : snapshot?.ecb_rate ? `${snapshot.ecb_rate}%` : "--"}
                      </p>
                      {snapshot?.ecb_rate_previous && (
                        <Badge variant="default" className="mt-2 text-[10px]">
                          Forrige: {snapshot.ecb_rate_previous}%
                        </Badge>
                      )}
                    </div>
                    <TrendingUp className="text-emerald-400 opacity-60" size={28} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Norges Bank</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {interestRates?.norway?.policyRate ? `${interestRates.norway.policyRate}%` : "--"}
                      </p>
                      {interestRates?.norway && (
                        <Badge variant="default" className="mt-2 text-[10px]">
                          Bank +{interestRates.norway.bankMarkupMin}-{interestRates.norway.bankMarkupMax}pp
                        </Badge>
                      )}
                    </div>
                    <TrendingUp className="text-amber-400 opacity-60" size={28} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Rapporter Generert</p>
                      <p className="text-2xl font-bold text-white mt-1">{reports.length}</p>
                      <Badge variant="default" className="mt-2 text-[10px]">
                        {reports.filter(r => r.sent_at).length} sendt
                      </Badge>
                    </div>
                    <FileText className="text-purple-400 opacity-60" size={28} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Idealista Nyheter</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {snapshot?.idealista_news?.length || 0}
                      </p>
                      <Badge variant="default" className="mt-2 text-[10px]">
                        Siste 7 dager
                      </Badge>
                    </div>
                    <Newspaper className="text-amber-400 opacity-60" size={28} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Markedsintelligens</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {(snapshot?.perplexity_insights || snapshot?.raw_data?.perplexityInsights || []).length || 0}
                      </p>
                      <Badge variant="default" className="mt-2 text-[10px] bg-purple-500/20 text-purple-300">
                        Perplexity AI
                      </Badge>
                    </div>
                    <Globe className="text-purple-400 opacity-60" size={28} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Report Templates - Generate */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Generer Rapport
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TEMPLATES.map(tmpl => {
                const Icon = tmpl.icon;
                const isGenerating = generating === tmpl.id;
                const lastReport = reports.find(r => r.template_id === tmpl.id);
                return (
                  <Card key={tmpl.id} className="hover:border-slate-600 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg ${tmpl.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon size={18} className={tmpl.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-white">{tmpl.name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{tmpl.freq}</p>
                          {lastReport && (
                            <p className="text-xs text-slate-500 mt-1">
                              Sist: {formatDate(lastReport.generated_at)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleGenerate(tmpl.id)}
                          disabled={isGenerating || generating !== null}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isGenerating
                              ? "bg-cyan-500/20 text-cyan-300 cursor-wait"
                              : "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                          }`}
                        >
                          {isGenerating ? (
                            <span className="flex items-center gap-1">
                              <RefreshCw size={12} className="animate-spin" />
                              Genererer...
                            </span>
                          ) : (
                            "Generer"
                          )}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Manual Market Intelligence Input */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Markedsintelligens (lim inn fra Perplexity / Gemini)
            </h2>
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Lim inn markedsdata fra Perplexity Pro, Gemini, eller andre kilder. Dataen brukes av AI-rapporten.
                </p>
                <select
                  value={manualInsightTopic}
                  onChange={(e) => setManualInsightTopic(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="Costa Blanca eiendomsmarked">Costa Blanca eiendomsmarked</option>
                  <option value="Spansk boligmarked nasjonalt">Spansk boligmarked nasjonalt</option>
                  <option value="Europeisk økonomi og renter">Europeisk økonomi og renter</option>
                  <option value="Nybygg og utviklingsprosjekter">Nybygg og utviklingsprosjekter</option>
                  <option value="Utenlandske kjøpere og trender">Utenlandske kjøpere og trender</option>
                  <option value="Annet">Annet</option>
                </select>
                <textarea
                  value={manualInsightText}
                  onChange={(e) => setManualInsightText(e.target.value)}
                  placeholder="Lim inn markedsrapport, analyse eller statistikk her..."
                  rows={6}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 resize-y"
                />
                <div className="flex items-center justify-between">
                  <Button
                    onClick={saveManualInsight}
                    disabled={savingInsight || !manualInsightText.trim()}
                    className="bg-purple-600 hover:bg-purple-500"
                  >
                    {savingInsight ? <><Loader2 size={14} className="mr-2 animate-spin" /> Lagrer...</> : "Lagre markedsdata"}
                  </Button>
                  {savedInsights.length > 0 && (
                    <span className="text-xs text-slate-500">{savedInsights.length} lagrede analyser</span>
                  )}
                </div>
                {/* Compact saved insights list */}
                {savedInsights.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-700/50">
                    {savedInsights.slice(0, 5).map((insight, i) => (
                      <div key={insight.id || i} className="flex items-center gap-2 text-xs">
                        <Badge className="bg-purple-500/20 text-purple-300 text-[9px] shrink-0">{insight.topic}</Badge>
                        <span className="text-slate-400 truncate">{insight.summary?.substring(0, 80)}...</span>
                        <span className="text-slate-600 shrink-0">{formatInsightDate(insight)}</span>
                        <button
                          onClick={() => createFromInsight(insight, "both")}
                          disabled={Boolean(insightGenerating)}
                          className="ml-auto shrink-0 rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {insightGenerating === `${insight.id}:both` ? "Lager..." : "Lag kundemateriale"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Kjøperrapport: Perplexity / Idealista → AI → godkjenning
            </h2>
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Lim inn rådata fra Perplexity Pro, Idealista eller egne notater. RealtyFlow skriver en norsk,
                  kjøpervennlig rapport som du kan lese, godkjenne og publisere til alle eller utvalgte kunder.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={buyerReportTitle}
                    onChange={(e) => setBuyerReportTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    placeholder="Rapporttittel"
                  />
                  <select
                    value={buyerReportArea}
                    onChange={(e) => setBuyerReportArea(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option>Costa Blanca Nord</option>
                    <option>Costa Blanca Sør</option>
                    <option>Costa Calida</option>
                    <option>Hele markedet</option>
                  </select>
                </div>
                <textarea
                  value={buyerReportSource}
                  onChange={(e) => setBuyerReportSource(e.target.value)}
                  placeholder="Lim inn rådata, Idealista-tall, Perplexity-rapport, kilder eller egne notater her..."
                  rows={7}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 resize-y"
                />
                <Button
                  onClick={createBuyerDraft}
                  disabled={buyerDrafting || !buyerReportSource.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  {buyerDrafting ? <><Loader2 size={14} className="mr-2 animate-spin" /> Skriver kjøperrapport...</> : "Lag AI-utkast for kjøpere"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Reports */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Siste Rapporter
            </h2>
            <div className="space-y-2">
              {reports.length === 0 && !loading && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FileText className="mx-auto text-slate-600 mb-3" size={32} />
                    <p className="text-slate-400 text-sm">Ingen rapporter generert ennå</p>
                    <p className="text-slate-500 text-xs mt-1">Klikk &quot;Generer&quot; på en mal for å starte</p>
                  </CardContent>
                </Card>
              )}
              {reports.slice(0, 10).map(report => {
                const tmpl = getTemplate(report.template_id);
                const Icon = tmpl.icon;
                return (
                  <Card
                    key={report.id}
                    className="hover:border-slate-600 transition-colors cursor-pointer"
                    onClick={() => { setSelectedReport(report); setReportApproved(false); setPortalStatus("idle"); setSendStatus(null); }}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className={`w-9 h-9 rounded-lg ${tmpl.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon size={16} className={tmpl.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium leading-snug text-white">{report.title}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {tmpl.name} · {formatDate(report.generated_at)} kl. {formatTime(report.generated_at)}
                          </p>
                          {(report.summary || report.subtitle) && (
                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">
                              {report.summary || report.subtitle}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:flex-shrink-0">
                          {report.sent_at && (
                            <Badge variant="success" className="text-[10px]">
                              <Mail size={10} className="mr-1" /> Sendt
                            </Badge>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedReport(report); setReportApproved(false); setPortalStatus("idle"); setSendStatus(null); switchTab("rapporter"); }}
                            className="ml-auto flex items-center gap-1 rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:text-white sm:ml-0"
                          >
                            <Eye size={12} />
                            Se resultat
                          </button>
                        </div>
                      </div>
                      {report.key_metrics && report.key_metrics.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-700/50">
                          {report.key_metrics.slice(0, 4).map((m, i) => (
                            <div key={i} className="text-xs">
                              <span className="text-slate-500">{m.label}: </span>
                              <span className="text-white font-medium">{m.value}</span>
                              {m.change && (
                                <span className={`ml-1 ${m.change.startsWith('+') || m.change.startsWith('-') ? (m.change.startsWith('+') ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400'}`}>
                                  {m.change}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TAB: RAPPORTER ═══════════ */}
      {activeTab === "rapporter" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Report List */}
          <div className="order-2 space-y-2 lg:order-1 lg:col-span-1">
            {reports.map(report => {
              const tmpl = getTemplate(report.template_id);
              const Icon = tmpl.icon;
              const isSelected = selectedReport?.id === report.id;
              return (
                <div
                  key={report.id}
                  onClick={() => { setSelectedReport(report); setReportApproved(false); setPortalStatus("idle"); setSendStatus(null); }}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? "border-cyan-500/50 bg-cyan-500/5"
                      : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Icon size={14} className={`${tmpl.color} mt-0.5 shrink-0`} />
                    <span className="text-sm font-medium leading-snug text-white">{report.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">{formatDate(report.generated_at)}</span>
                    {report.sent_at && <Badge variant="success" className="text-[9px] py-0">Sendt</Badge>}
                  </div>
                  {(report.summary || report.subtitle) && (
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">
                      {report.summary || report.subtitle}
                    </p>
                  )}
                </div>
              );
            })}
            {reports.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Ingen rapporter ennå</p>
            )}
          </div>

          {/* Report Preview */}
          <div className="order-1 lg:order-2 lg:col-span-2">
            {selectedReport ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle>{selectedReport.title}</CardTitle>
                      {selectedReport.subtitle && (
                        <p className="text-sm text-slate-400 mt-1">{selectedReport.subtitle}</p>
                      )}
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <button
                        onClick={() => publishToPortal(selectedReport.id)}
                        disabled={!reportApproved || portalPublishing === selectedReport.id || (portalMode === "selected" && selectedContactEmails.length === 0)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
                      >
                        {portalPublishing === selectedReport.id ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <FileText size={14} />
                        )}
                        Legg på Min side
                      </button>
                      {!selectedReport.sent_at && (
                        <button
                          onClick={() => handleSend(selectedReport.id)}
                          disabled={sending === selectedReport.id}
                          title={`Sender til ${getRecipientDescription(selectedReport)}`}
                          className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-2 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
                        >
                          {sending === selectedReport.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                          Send e-post
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isOffBrandDonaAnnaReport(selectedReport) && (
                    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                      <p className="text-sm font-medium text-amber-200">
                        Denne eldre Dona Anna-rapporten ser ut til å ha fått finans-/eiendomsvinkel.
                      </p>
                      <p className="mt-1 text-xs leading-5 text-amber-100/80">
                        Generer en ny versjon for å bruke den oppdaterte olivenolje- og sesongbrevmalen.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => handleGenerate("dona-anna-sesong")}
                        disabled={Boolean(generating)}
                        className="mt-3 bg-amber-600 hover:bg-amber-500"
                      >
                        {generating === "dona-anna-sesong" ? <><Loader2 size={14} className="mr-2 animate-spin" /> Lager ny...</> : "Generer nytt Dona Anna-brev"}
                      </Button>
                    </div>
                  )}
                  <div className="mb-6 rounded-lg border border-slate-700/40 bg-slate-900/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Publisering</span>
                      <button
                        onClick={() => setPortalMode("all")}
                        className={`rounded px-3 py-1.5 text-xs font-medium ${portalMode === "all" ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-400"}`}
                      >
                        Alle med Min side
                      </button>
                      <button
                        onClick={() => setPortalMode("selected")}
                        className={`rounded px-3 py-1.5 text-xs font-medium ${portalMode === "selected" ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-400"}`}
                      >
                        Valgte kontakter
                      </button>
                      {selectedReport.recipients === "portal_all" && <Badge variant="success" className="text-[10px]">Synlig for alle portalbrukere</Badge>}
                      {selectedReport.recipients === "portal_selected" && <Badge variant="success" className="text-[10px]">Synlig for {selectedReport.sent_to?.length || 0}</Badge>}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      E-postknappen sender til {getRecipientDescription(selectedReport)}
                    </p>
                    <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
                      <input
                        checked={reportApproved}
                        onChange={(e) => setReportApproved(e.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        Jeg har lest gjennom og godkjent rapporten for kundebruk. Publisering til Min side låses opp etter godkjenning.
                      </span>
                    </label>
                    {portalMode === "selected" && (
                      <div className="mt-3 max-h-44 overflow-auto rounded border border-slate-700/40">
                        {contacts.map(contact => {
                          const email = contact.email?.toLowerCase() || "";
                          return (
                            <label key={contact.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-800 px-3 py-2 text-xs text-slate-300 last:border-b-0">
                              <input
                                type="checkbox"
                                checked={selectedContactEmails.includes(email)}
                                onChange={() => toggleContact(email)}
                              />
                              <span className="flex-1">
                                <strong className="text-white">{contact.name || contact.email}</strong>
                                <span className="ml-2 text-slate-500">{contact.email}</span>
                              </span>
                              {contact.pipeline_status && <span className="text-slate-500">{contact.pipeline_status}</span>}
                            </label>
                          );
                        })}
                        {contacts.length === 0 && <p className="p-3 text-xs text-slate-500">Ingen kontakter med e-post funnet.</p>}
                      </div>
                    )}
                    {portalStatus === "saved" && <p className="mt-2 text-xs text-emerald-300">Rapporten er lagt under Dokumenter på Min side.</p>}
                    {portalStatus === "error" && <p className="mt-2 text-xs text-red-300">Kunne ikke publisere rapporten.</p>}
                    {sendStatus?.reportId === selectedReport.id && (
                      <p className={`mt-2 text-xs ${
                        sendStatus.type === "success"
                          ? "text-emerald-300"
                          : sendStatus.type === "error"
                            ? "text-red-300"
                            : "text-cyan-300"
                      }`}>
                        {sendStatus.message}
                      </p>
                    )}
                  </div>

                  {/* Key Metrics */}
                  {selectedReport.key_metrics && selectedReport.key_metrics.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      {selectedReport.key_metrics.map((m, i) => (
                        <div key={i} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                          <p className="text-[10px] text-slate-500 uppercase">{m.label}</p>
                          <p className="text-lg font-bold text-white mt-0.5">{m.value}</p>
                          {m.change && (
                            <p className={`text-xs mt-0.5 ${
                              m.change.startsWith("+") ? "text-emerald-400" :
                              m.change.startsWith("-") ? "text-red-400" : "text-slate-400"
                            }`}>
                              {m.change}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  {selectedReport.summary && (
                    <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20 mb-6">
                      <p className="text-sm text-slate-200 italic">{selectedReport.summary}</p>
                    </div>
                  )}

                  {/* Sections */}
                  {selectedReport.sections && selectedReport.sections.length > 0 ? (
                    <div className="space-y-6">
                      {selectedReport.sections.map((section, i) => (
                        <div key={i}>
                          <h3 className="text-sm font-semibold text-white mb-2">{section.heading}</h3>
                          <div
                            className="prose prose-invert prose-sm max-w-none break-words text-sm leading-relaxed text-slate-300"
                            dangerouslySetInnerHTML={{ __html: section.content }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : selectedReport.content_html ? (
                    <div
                      className="prose prose-invert prose-sm max-w-none break-words text-sm leading-relaxed text-slate-300"
                      dangerouslySetInnerHTML={{ __html: selectedReport.content_html }}
                    />
                  ) : selectedReport.content_text ? (
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
                      {selectedReport.content_text}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Ingen innhold tilgjengelig</p>
                  )}

                  {/* Footer */}
                  <div className="mt-6 flex flex-col gap-2 border-t border-slate-700/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs leading-5 text-slate-500">
                      Generert {formatDate(selectedReport.generated_at)} kl. {formatTime(selectedReport.generated_at)}
                      {selectedReport.data_sources && selectedReport.data_sources.length > 0 && (
                        <span> · Kilder: {selectedReport.data_sources.join(", ")}</span>
                      )}
                    </div>
                    {selectedReport.sent_at && (
                      <div className="text-xs text-emerald-400">
                        Sendt {formatDate(selectedReport.sent_at)}
                        {selectedReport.sent_to?.length ? ` til ${selectedReport.sent_to.join(", ")}` : ""}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Eye className="mx-auto text-slate-600 mb-3" size={32} />
                  <p className="text-slate-400 text-sm">Velg en rapport for forhåndsvisning</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: MARKEDSDATA ═══════════ */}
      {activeTab === "markedsdata" && (
        <div className="space-y-6">
          {/* Exchange Rates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign size={16} className="text-cyan-400" />
                Valutakurser
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { pair: "EUR/NOK", value: snapshot?.eur_nok, change: snapshot?.eur_nok_7d_change },
                  { pair: "EUR/SEK", value: snapshot?.eur_sek },
                  { pair: "EUR/GBP", value: snapshot?.eur_gbp },
                ].map(rate => (
                  <div key={rate.pair} className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/30">
                    <p className="text-xs text-slate-500">{rate.pair}</p>
                    <div className="flex items-end gap-2 mt-1">
                      <p className="text-xl font-bold text-white">{rate.value?.toFixed(4) || "--"}</p>
                      {rate.change != null && (
                        <div className={`flex items-center text-xs mb-0.5 ${(rate.change ?? 0) >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {(rate.change ?? 0) >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {Math.abs(rate.change ?? 0).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {snapshot?.fetched_at && (
                <p className="text-[10px] text-slate-600 mt-3">
                  Sist oppdatert: {formatDate(snapshot.fetched_at)} kl. {formatTime(snapshot.fetched_at)}
                </p>
              )}
              {!snapshot && (
                <p className="text-sm text-slate-500 text-center py-4">
                  Ingen markedsdata lastet. Generer en rapport for å hente ferske data.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Interest Rates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-400" />
                Renter og bankpåslag
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/30">
                  <p className="text-xs text-slate-500 uppercase">Norge</p>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-xs text-slate-500">Norges Bank</p>
                      <p className="text-2xl font-bold text-white">
                        {interestRates?.norway?.policyRate ? `${interestRates.norway.policyRate}%` : "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Estimert boliglån</p>
                      <p className="text-2xl font-bold text-white">
                        {interestRates?.norway
                          ? `${interestRates.norway.estimatedMortgageMin}-${interestRates.norway.estimatedMortgageMax}%`
                          : "--"}
                      </p>
                    </div>
                  </div>
                  {interestRates?.norway && (
                    <p className="text-xs text-slate-400 mt-3">
                      Vanlig bankpåslag brukt i modellen: +{interestRates.norway.bankMarkupMin}-{interestRates.norway.bankMarkupMax} prosentpoeng.
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/30">
                  <p className="text-xs text-slate-500 uppercase">Spania / eurosonen</p>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-xs text-slate-500">ECB MRO</p>
                      <p className="text-2xl font-bold text-white">
                        {interestRates?.spain?.ecbMainRefinancingRate
                          ? `${interestRates.spain.ecbMainRefinancingRate}%`
                          : snapshot?.ecb_rate ? `${snapshot.ecb_rate}%` : "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Estimert lånerente</p>
                      <p className="text-2xl font-bold text-white">
                        {interestRates?.spain
                          ? `${interestRates.spain.estimatedMortgageMin}-${interestRates.spain.estimatedMortgageMax}%`
                          : "--"}
                      </p>
                    </div>
                  </div>
                  {interestRates?.spain && (
                    <p className="text-xs text-slate-400 mt-3">
                      ECB deposit {interestRates.spain.ecbDepositRate}%, marginal {interestRates.spain.ecbMarginalLendingRate}%. Spansk bankpåslag i modellen: +{interestRates.spain.bankMarkupMin}-{interestRates.spain.bankMarkupMax} prosentpoeng.
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-600 mt-3">
                Bankpåslag er rådgivningsestimater og må erstattes av faktisk banktilbud i konkrete kundecaser.
              </p>
            </CardContent>
          </Card>

          {/* Idealista News */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Newspaper size={16} className="text-amber-400" />
                Idealista Nyheter
              </CardTitle>
            </CardHeader>
            <CardContent>
              {snapshot?.idealista_news && snapshot.idealista_news.length > 0 ? (
                <div className="space-y-3">
                  {snapshot.idealista_news.map((news, i) => (
                    <div key={i} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                      <a
                        href={news.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-white hover:text-cyan-400 transition-colors"
                      >
                        {news.title}
                      </a>
                      <p className="text-xs text-slate-500 mt-1">{news.date}</p>
                      {news.summary && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{news.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  Ingen nyheter lastet ennå
                </p>
              )}
            </CardContent>
          </Card>

          {/* Manual Market Intelligence Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe size={16} className="text-purple-400" />
                Markedsintelligens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Input form */}
              <div className="p-4 rounded-lg bg-slate-800/50 border border-purple-500/20 space-y-3">
                <p className="text-xs text-slate-400">
                  Lim inn markedsdata fra Perplexity Pro, Gemini, eller andre kilder. Dataen brukes av AI-rapporten.
                </p>
                <select
                  value={manualInsightTopic}
                  onChange={(e) => setManualInsightTopic(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="Costa Blanca eiendomsmarked">Costa Blanca eiendomsmarked</option>
                  <option value="Spansk boligmarked nasjonalt">Spansk boligmarked nasjonalt</option>
                  <option value="Europeisk økonomi og renter">Europeisk økonomi og renter</option>
                  <option value="Nybygg og utviklingsprosjekter">Nybygg og utviklingsprosjekter</option>
                  <option value="Utenlandske kjøpere og trender">Utenlandske kjøpere og trender</option>
                  <option value="Annet">Annet</option>
                </select>
                <textarea
                  value={manualInsightText}
                  onChange={(e) => setManualInsightText(e.target.value)}
                  placeholder="Lim inn markedsrapport, analyse eller statistikk her..."
                  rows={8}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 resize-y"
                />
                <Button
                  onClick={saveManualInsight}
                  disabled={savingInsight || !manualInsightText.trim()}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  {savingInsight ? <><Loader2 size={14} className="mr-2 animate-spin" /> Lagrer...</> : "Lagre markedsdata"}
                </Button>
              </div>

              {/* Saved insights */}
              {savedInsights.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase">Lagrede analyser ({savedInsights.length})</h4>
                  {savedInsights.map((insight, i) => (
                    <div key={insight.id || i} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                      <div className="flex items-center justify-between mb-1">
                        <Badge className="bg-purple-500/20 text-purple-300 text-[10px]">{insight.topic}</Badge>
                        <span className="text-[10px] text-slate-500">{formatInsightDate(insight)}</span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-3 whitespace-pre-line">{insight.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => createFromInsight(insight, "report")}
                          disabled={Boolean(insightGenerating)}
                          className="h-8 text-xs"
                        >
                          {insightGenerating === `${insight.id}:report` ? <Loader2 size={12} className="mr-1 animate-spin" /> : <FileText size={12} className="mr-1" />}
                          Lag rapport
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => createFromInsight(insight, "presentation")}
                          disabled={Boolean(insightGenerating)}
                          className="h-8 text-xs"
                        >
                          {insightGenerating === `${insight.id}:presentation` ? <Loader2 size={12} className="mr-1 animate-spin" /> : <BarChart3 size={12} className="mr-1" />}
                          Lag presentasjon
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => createFromInsight(insight, "both")}
                          disabled={Boolean(insightGenerating)}
                          className="h-8 bg-emerald-600 text-xs hover:bg-emerald-500"
                        >
                          {insightGenerating === `${insight.id}:both` ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Zap size={12} className="mr-1" />}
                          Kundemateriale
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════ TAB: EKSPERTINNHOLD ═══════════ */}
      {activeTab === "ekspertinnhold" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200/80">
                  Fra markedsdata til kundeverdi
                </p>
                <h2 className="mt-2 text-lg font-semibold text-white">Bruk kvalitetssikret input som grunnlag for ekspertinnhold</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Her henger arbeidsflyten sammen: lim inn og lagre markedsartikler, renter, eurokurs og egne analyser i
                  Markedsdata-fanen, og bruk denne flaten til å gjøre materialet om til rapporter, artikler og instruksjoner.
                </p>
              </div>
              <Button variant="outline" onClick={() => switchTab("markedsdata")}>
                <Globe size={14} className="mr-2" />
                Gå til markedsdata
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">EUR/NOK</p>
                <p className="mt-1 text-xl font-semibold text-white">{snapshot?.eur_nok?.toFixed(4) || "--"}</p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">ECB MRO</p>
                <p className="mt-1 text-xl font-semibold text-white">
                  {interestRates?.spain?.ecbMainRefinancingRate ? `${interestRates.spain.ecbMainRefinancingRate}%` : "--"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Norges Bank</p>
                <p className="mt-1 text-xl font-semibold text-white">
                  {interestRates?.norway?.policyRate ? `${interestRates.norway.policyRate}%` : "--"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-500">Lagrede analyser</p>
                <p className="mt-1 text-xl font-semibold text-white">{savedInsights.length}</p>
              </div>
            </div>
          </div>

          <AdvisorPlaybooksStudio embedded marketContexts={expertMarketContexts} />
        </div>
      )}

      {/* ═══════════ TAB: MOTTAKERE ═══════════ */}
      {activeTab === "mottakere" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users size={16} className="text-cyan-400" />
                Mottakerlister
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { group: "internal", label: "Intern", desc: "Kun deg (Freddy)", count: 1, color: "bg-slate-500" },
                  { group: "investors", label: "Investorer", desc: "Investorprofiler fra CRM", count: 0, color: "bg-emerald-500" },
                  { group: "leads", label: "Aktive Leads", desc: "Leads i Viewing/Interested-fase", count: contacts.length, color: "bg-cyan-500" },
                  { group: "donaanna", label: "Dona Anna", desc: "Olivenoljekunder og grossister", count: 0, color: "bg-amber-500" },
                  { group: "all", label: "Alle", desc: "Full distribusjonslist", count: 0, color: "bg-purple-500" },
                ].map(list => (
                  <div key={list.group} className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700/30">
                    <div className={`w-3 h-3 rounded-full ${list.color}`} />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-white">{list.label}</h3>
                      <p className="text-xs text-slate-500">{list.desc}</p>
                    </div>
                    <Badge variant="default" className="text-[10px]">{list.count} mottakere</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Mottakere hentes fra CRM. Bruk rapportvisningen for å legge rapporten på Min side for alle portalbrukere
                eller bare utvalgte kontakter.
              </p>
            </CardContent>
          </Card>

          {/* Automation Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={16} className="text-purple-400" />
                Automatisk Kalender
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { day: "Mandag 08:00", template: "Tall og Trender / Det Store Bildet (rotasjon)", active: true },
                  { day: "Fredag 17:00", template: "Intern Ukesoppsummering", active: true },
                  { day: "1. i måneden", template: "Brand Spotlight (roterer)", active: true },
                  { day: "Kvartalsvis", template: "Dona Anna Sesongbrev", active: true },
                  { day: "Nattlig 03:00", template: "Markedsdata-innhenting (ECB, Idealista)", active: true },
                ].map((schedule, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-slate-800/30">
                    <Clock size={14} className="text-slate-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-white">{schedule.day}</p>
                      <p className="text-xs text-slate-500">{schedule.template}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${schedule.active ? "bg-emerald-400" : "bg-slate-600"}`} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
