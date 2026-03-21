"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, TrendingUp, Globe, FileText, Send, RefreshCw,
  Calendar, Clock, ChevronRight, Eye, Mail, Zap, DollarSign,
  Users, Building2, Newspaper, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

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
  internal_metrics?: Record<string, number>;
  fetched_at?: string;
}

// ─── Template Config ─────────────────────────────────────────
const TEMPLATES = [
  { id: "tall-og-trender", name: "Tall og Trender", icon: BarChart3, color: "text-cyan-400", bg: "bg-cyan-500/15", freq: "Annenhver uke" },
  { id: "det-store-bildet", name: "Det Store Bildet", icon: Globe, color: "text-purple-400", bg: "bg-purple-500/15", freq: "Månedlig" },
  { id: "brand-spotlight", name: "Brand Spotlight", icon: Zap, color: "text-amber-400", bg: "bg-amber-500/15", freq: "Månedlig" },
  { id: "intern-ukesoppsummering", name: "Intern Ukesoppsummering", icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/15", freq: "Fredag" },
  { id: "dona-anna-sesong", name: "Dona Anna Sesongbrev", icon: Newspaper, color: "text-orange-400", bg: "bg-orange-500/15", freq: "Kvartalsvis" },
];

// ─── Component ───────────────────────────────────────────────
export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [activeTab, setActiveTab] = useState<"oversikt" | "rapporter" | "markedsdata" | "mottakere">("oversikt");

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

  // Generate a report
  const handleGenerate = async (templateId: string) => {
    setGenerating(templateId);
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
        }
      }
    } catch (err) {
      console.error("Failed to generate:", err);
    }
    setGenerating(null);
  };

  // Send a report via email
  const handleSend = async (reportId: string) => {
    setSending(reportId);
    try {
      const res = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      if (res.ok) {
        setReports(prev =>
          prev.map(r => r.id === reportId ? { ...r, sent_at: new Date().toISOString() } : r)
        );
      }
    } catch (err) {
      console.error("Failed to send:", err);
    }
    setSending(null);
  };

  // Format date
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
  };
  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  };

  // Get template info
  const getTemplate = (id: string) => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Intelligence</h1>
          <p className="text-sm text-slate-400 mt-1">
            Automatiske markedsrapporter med AI-analyse, valutakurser og bransjetrender
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors text-sm"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Oppdater
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg w-fit">
        {(["oversikt", "rapporter", "markedsdata", "mottakere"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab === "oversikt" ? "Oversikt" : tab === "rapporter" ? `Rapporter (${reports.length})` : tab === "markedsdata" ? "Markedsdata" : "Mottakere"}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                          {snapshot.eur_nok_7d_change >= 0 ? "+" : ""}
                          {snapshot.eur_nok_7d_change.toFixed(2)}% 7d
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
                      <p className="text-xs text-slate-400">ECB Rente</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {snapshot?.ecb_rate ? `${snapshot.ecb_rate}%` : "--"}
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
                    onClick={() => setSelectedReport(report)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-9 h-9 rounded-lg ${tmpl.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon size={16} className={tmpl.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-white truncate">{report.title}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {tmpl.name} · {formatDate(report.generated_at)} kl. {formatTime(report.generated_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {report.sent_at ? (
                            <Badge variant="success" className="text-[10px]">
                              <Mail size={10} className="mr-1" /> Sendt
                            </Badge>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSend(report.id); }}
                              disabled={sending === report.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            >
                              {sending === report.id ? (
                                <RefreshCw size={10} className="animate-spin" />
                              ) : (
                                <Send size={10} />
                              )}
                              Send
                            </button>
                          )}
                          <ChevronRight size={14} className="text-slate-600" />
                        </div>
                      </div>
                      {report.key_metrics && report.key_metrics.length > 0 && (
                        <div className="flex gap-4 mt-3 pt-3 border-t border-slate-700/50">
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report List */}
          <div className="lg:col-span-1 space-y-2">
            {reports.map(report => {
              const tmpl = getTemplate(report.template_id);
              const Icon = tmpl.icon;
              const isSelected = selectedReport?.id === report.id;
              return (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? "border-cyan-500/50 bg-cyan-500/5"
                      : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={tmpl.color} />
                    <span className="text-sm text-white font-medium truncate">{report.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-500">{formatDate(report.generated_at)}</span>
                    {report.sent_at && <Badge variant="success" className="text-[9px] py-0">Sendt</Badge>}
                  </div>
                </div>
              );
            })}
            {reports.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Ingen rapporter ennå</p>
            )}
          </div>

          {/* Report Preview */}
          <div className="lg:col-span-2">
            {selectedReport ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{selectedReport.title}</CardTitle>
                      {selectedReport.subtitle && (
                        <p className="text-sm text-slate-400 mt-1">{selectedReport.subtitle}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!selectedReport.sent_at && (
                        <button
                          onClick={() => handleSend(selectedReport.id)}
                          disabled={sending === selectedReport.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 text-sm transition-colors"
                        >
                          {sending === selectedReport.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                          Send rapport
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
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
                            className="text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: section.content }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : selectedReport.content_html ? (
                    <div
                      className="text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedReport.content_html }}
                    />
                  ) : selectedReport.content_text ? (
                    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {selectedReport.content_text}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Ingen innhold tilgjengelig</p>
                  )}

                  {/* Footer */}
                  <div className="mt-6 pt-4 border-t border-slate-700/50 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      Generert {formatDate(selectedReport.generated_at)} kl. {formatTime(selectedReport.generated_at)}
                      {selectedReport.data_sources && selectedReport.data_sources.length > 0 && (
                        <span> · Kilder: {selectedReport.data_sources.join(", ")}</span>
                      )}
                    </div>
                    {selectedReport.sent_at && (
                      <div className="text-xs text-emerald-400">
                        Sendt {formatDate(selectedReport.sent_at)}
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
                      {rate.change !== undefined && (
                        <div className={`flex items-center text-xs mb-0.5 ${rate.change >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {rate.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {Math.abs(rate.change).toFixed(2)}%
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

          {/* ECB Rate */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-400" />
                ECB Styringsrente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-xs text-slate-500">Nåværende</p>
                  <p className="text-3xl font-bold text-white">{snapshot?.ecb_rate ? `${snapshot.ecb_rate}%` : "--"}</p>
                </div>
                {snapshot?.ecb_rate_previous && (
                  <div>
                    <p className="text-xs text-slate-500">Forrige</p>
                    <p className="text-xl text-slate-400">{snapshot.ecb_rate_previous}%</p>
                  </div>
                )}
              </div>
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
                  { group: "leads", label: "Aktive Leads", desc: "Leads i Viewing/Interested-fase", count: 0, color: "bg-cyan-500" },
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
                Mottakere hentes automatisk fra CRM og kan konfigureres i Innstillinger.
                Rapporter sendes foreløpig kun til din e-post.
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
