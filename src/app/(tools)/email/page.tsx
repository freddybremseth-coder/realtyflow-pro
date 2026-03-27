"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Mail, Inbox, Send, Star, Archive, RefreshCw, Search, Filter,
  ChevronRight, AlertTriangle, MessageSquare, Eye, Building2,
  User, MapPin, Sparkles, CheckCircle2, Clock, XCircle,
  ArrowLeft, Loader2, StarOff,
} from "lucide-react";
import { BRANDS } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────────────────

interface EmailMessage {
  id: string;
  brand_id: string;
  message_id: string;
  thread_id?: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name?: string;
  to_addresses: string[];
  cc_addresses?: string[];
  subject: string;
  body_text?: string;
  body_html?: string;
  ai_summary?: string;
  ai_intent?: string;
  ai_language?: string;
  ai_urgency?: string;
  ai_sentiment?: string;
  ai_suggested_action?: string;
  matched_lead_id?: string;
  matched_customer_id?: string;
  matched_property_ids?: string[];
  matched_plot_ids?: string[];
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  has_draft_reply: boolean;
  replied_at?: string;
  received_at: string;
  created_at: string;
}

interface EmailDraft {
  id: string;
  email_message_id: string;
  brand_id: string;
  to_addresses: string[];
  subject: string;
  body_text: string;
  body_html?: string;
  ai_confidence?: number;
  tone?: string;
  language?: string;
  status: "draft" | "approved" | "sent" | "discarded";
}

interface AnalysisResult {
  analysis: {
    intent: string;
    urgency: string;
    sentiment: string;
    language: string;
    summary: string;
    key_points: string[];
    suggested_action: string;
  };
  context_match: {
    matched_lead_id?: string;
    matched_lead_name?: string;
    matched_customer_id?: string;
    matched_customer_name?: string;
    matched_property_ids: string[];
    matched_plot_ids: string[];
    confidence: number;
    reasoning: string;
  };
  draft: EmailDraft;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const INTENT_LABELS: Record<string, { label: string; color: string }> = {
  inquiry: { label: "Forespørsel", color: "bg-blue-500/20 text-blue-300" },
  viewing_request: { label: "Visning", color: "bg-purple-500/20 text-purple-300" },
  offer: { label: "Bud", color: "bg-green-500/20 text-green-300" },
  complaint: { label: "Klage", color: "bg-red-500/20 text-red-300" },
  follow_up: { label: "Oppfølging", color: "bg-yellow-500/20 text-yellow-300" },
  general: { label: "Generell", color: "bg-slate-500/20 text-slate-300" },
};

const URGENCY_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  critical: { label: "Kritisk", color: "text-red-400", icon: AlertTriangle },
  high: { label: "Høy", color: "text-orange-400", icon: AlertTriangle },
  medium: { label: "Middels", color: "text-yellow-400", icon: Clock },
  low: { label: "Lav", color: "text-slate-400", icon: Clock },
};

const SENTIMENT_LABELS: Record<string, { label: string; color: string }> = {
  positive: { label: "Positiv", color: "text-green-400" },
  neutral: { label: "Nøytral", color: "text-slate-400" },
  negative: { label: "Negativ", color: "text-red-400" },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Nå";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}t`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

function getBrandColor(brandId: string): string {
  const brand = BRANDS.find((b) => b.id === brandId);
  return brand?.color || "#64748b";
}

function getBrandName(brandId: string): string {
  const brand = BRANDS.find((b) => b.id === brandId);
  return brand?.name || brandId;
}

// ─── Component ───────────────────────────────────────────────────────

export default function EmailInboxPage() {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [unreadByBrand, setUnreadByBrand] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [draftText, setDraftText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterIntent, setFilterIntent] = useState<string | null>(null);
  const [filterUrgency, setFilterUrgency] = useState<string | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────────────

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBrand) params.set("brand_id", selectedBrand);
      if (filterIntent) params.set("intent", filterIntent);
      if (filterUrgency) params.set("urgency", filterUrgency);
      params.set("limit", "100");

      const res = await fetch(`/api/email/inbox?${params}`);
      const data = await res.json();

      if (data.messages) {
        setMessages(data.messages);
        setUnreadByBrand(data.unread_by_brand || {});
      }
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBrand, filterIntent, filterUrgency]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const triggerImapFetch = async (brandId: string) => {
    setFetching(true);
    try {
      const res = await fetch("/api/email/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchEmails();
      }
    } catch (err) {
      console.error("Failed to fetch from IMAP:", err);
    } finally {
      setFetching(false);
    }
  };

  const analyzeEmail = async (emailId: string) => {
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch("/api/email/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data);
        setDraftText(data.draft?.body_text || "");
        await fetchEmails();
      }
    } catch (err) {
      console.error("Failed to analyze email:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const sendDraft = async () => {
    if (!analysisResult?.draft?.id || !draftText) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: analysisResult.draft.id }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(null);
        setDraftText("");
        setSelectedMessage(null);
        await fetchEmails();
      }
    } catch (err) {
      console.error("Failed to send email:", err);
    } finally {
      setSending(false);
    }
  };

  const toggleStar = async (msg: EmailMessage) => {
    try {
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, is_starred: !m.is_starred } : m
        )
      );
      if (selectedMessage?.id === msg.id) {
        setSelectedMessage({ ...msg, is_starred: !msg.is_starred });
      }
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  };

  const selectMessage = (msg: EmailMessage) => {
    setSelectedMessage(msg);
    setAnalysisResult(null);
    setDraftText("");
    setShowMobileDetail(true);
    // Mark as read optimistically
    if (!msg.is_read) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m))
      );
    }
  };

  // ─── Filtered messages ─────────────────────────────────────────────

  const filteredMessages = messages.filter((msg) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        msg.subject?.toLowerCase().includes(q) ||
        msg.from_name?.toLowerCase().includes(q) ||
        msg.from_address?.toLowerCase().includes(q) ||
        msg.ai_summary?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    return true;
  });

  const totalUnread = Object.values(unreadByBrand).reduce((a, b) => a + b, 0);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
            <Mail size={20} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">E-post AI</h1>
            <p className="text-xs text-slate-400">
              {totalUnread > 0
                ? `${totalUnread} uleste meldinger`
                : "Alle meldinger lest"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setFetching(true);
              try {
                const brandsToFetch = selectedBrand
                  ? [selectedBrand]
                  : ["pinosoecolife", "zeneco", "chatgenius", "freddyb"];
                for (const bid of brandsToFetch) {
                  await fetch("/api/email/inbox", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ brand_id: bid }),
                  });
                }
                await fetchEmails();
              } catch (err) {
                console.error("Failed to fetch emails:", err);
              } finally {
                setFetching(false);
              }
            }}
            disabled={fetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/15 text-cyan-300 text-sm hover:bg-cyan-500/25 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={fetching ? "animate-spin" : ""} />
            {fetching ? "Henter..." : selectedBrand ? "Hent e-post" : "Hent alle e-poster"}
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Brand sidebar */}
        <div className="w-56 border-r border-slate-700/50 overflow-y-auto flex-shrink-0 hidden lg:block">
          <div className="p-3">
            <button
              onClick={() => setSelectedBrand(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                !selectedBrand
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
              }`}
            >
              <span className="flex items-center gap-2">
                <Inbox size={16} />
                Alle
              </span>
              {totalUnread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-medium">
                  {totalUnread}
                </span>
              )}
            </button>

            <div className="mt-3 space-y-0.5">
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Brands
              </p>
              {BRANDS.map((brand) => {
                const count = unreadByBrand[brand.id] || 0;
                return (
                  <button
                    key={brand.id}
                    onClick={() => setSelectedBrand(brand.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedBrand === brand.id
                        ? "bg-slate-700/60 text-white"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: brand.color }}
                      />
                      <span className="truncate">{brand.name}</span>
                    </span>
                    {count > 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${brand.color}20`,
                          color: brand.color,
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filters */}
            <div className="mt-4 space-y-0.5">
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Filter
              </p>
              {Object.entries(INTENT_LABELS).map(([key, { label, color }]) => (
                <button
                  key={key}
                  onClick={() =>
                    setFilterIntent(filterIntent === key ? null : key)
                  }
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    filterIntent === key
                      ? "bg-slate-700/60 text-white"
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/30"
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${color}`}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Email list */}
        <div
          className={`flex-1 min-w-0 border-r border-slate-700/50 flex flex-col ${
            showMobileDetail ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Search bar */}
          <div className="p-3 border-b border-slate-700/50">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                placeholder="Søk i e-poster..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 size={24} className="animate-spin text-slate-500" />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <Mail size={32} className="mb-2" />
                <p className="text-sm">Ingen e-poster funnet</p>
                {selectedBrand && (
                  <button
                    onClick={() => triggerImapFetch(selectedBrand)}
                    className="mt-3 text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    Hent e-poster fra server
                  </button>
                )}
              </div>
            ) : (
              filteredMessages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => selectMessage(msg)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-800/50 transition-colors ${
                    selectedMessage?.id === msg.id
                      ? "bg-slate-700/40"
                      : msg.is_read
                      ? "hover:bg-slate-800/40"
                      : "bg-slate-800/20 hover:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Brand indicator */}
                    <div
                      className="w-1 h-10 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: getBrandColor(msg.brand_id) }}
                    />

                    <div className="flex-1 min-w-0">
                      {/* Sender row */}
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span
                          className={`text-sm truncate ${
                            msg.is_read
                              ? "text-slate-300"
                              : "text-white font-semibold"
                          }`}
                        >
                          {msg.from_name || msg.from_address}
                        </span>
                        <span className="text-[10px] text-slate-500 flex-shrink-0">
                          {formatDate(msg.received_at)}
                        </span>
                      </div>

                      {/* Subject */}
                      <p
                        className={`text-xs truncate mb-1 ${
                          msg.is_read ? "text-slate-400" : "text-slate-200"
                        }`}
                      >
                        {msg.subject || "(ingen emne)"}
                      </p>

                      {/* AI summary + badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {msg.ai_summary && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[200px]">
                            {msg.ai_summary}
                          </span>
                        )}
                        {msg.ai_intent &&
                          INTENT_LABELS[msg.ai_intent] && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                INTENT_LABELS[msg.ai_intent].color
                              }`}
                            >
                              {INTENT_LABELS[msg.ai_intent].label}
                            </span>
                          )}
                        {msg.ai_urgency &&
                          msg.ai_urgency !== "low" &&
                          URGENCY_LABELS[msg.ai_urgency] && (
                            <span
                              className={`text-[9px] font-medium ${
                                URGENCY_LABELS[msg.ai_urgency].color
                              }`}
                            >
                              {URGENCY_LABELS[msg.ai_urgency].label}
                            </span>
                          )}
                        {msg.is_starred && (
                          <Star
                            size={10}
                            className="text-yellow-400 fill-yellow-400"
                          />
                        )}
                        {msg.replied_at && (
                          <Send size={10} className="text-green-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div
          className={`flex-1 min-w-0 overflow-y-auto ${
            showMobileDetail ? "flex flex-col" : "hidden lg:flex lg:flex-col"
          }`}
        >
          {selectedMessage ? (
            <div className="flex-1">
              {/* Detail header */}
              <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-6 py-4">
                <div className="flex items-center gap-3 mb-3 lg:hidden">
                  <button
                    onClick={() => {
                      setShowMobileDetail(false);
                      setSelectedMessage(null);
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    <ArrowLeft size={18} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {selectedMessage.subject || "(ingen emne)"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: getBrandColor(
                            selectedMessage.brand_id
                          ),
                        }}
                      />
                      <span className="text-xs text-slate-400">
                        {getBrandName(selectedMessage.brand_id)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleStar(selectedMessage)}
                      className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-yellow-400 transition-colors"
                    >
                      {selectedMessage.is_starred ? (
                        <Star
                          size={16}
                          className="text-yellow-400 fill-yellow-400"
                        />
                      ) : (
                        <StarOff size={16} />
                      )}
                    </button>
                    <button className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors">
                      <Archive size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Sender info */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-white">
                    {(
                      selectedMessage.from_name?.[0] ||
                      selectedMessage.from_address[0] ||
                      "?"
                    ).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">
                      {selectedMessage.from_name || selectedMessage.from_address}
                    </p>
                    <p className="text-xs text-slate-400">
                      {selectedMessage.from_address}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Til: {selectedMessage.to_addresses?.join(", ")}
                      {selectedMessage.cc_addresses?.length
                        ? ` | Kopi: ${selectedMessage.cc_addresses.join(", ")}`
                        : ""}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(selectedMessage.received_at).toLocaleString(
                        "nb-NO"
                      )}
                    </p>
                  </div>
                </div>

                {/* Email body */}
                <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/30">
                  {selectedMessage.body_html ? (
                    <div
                      className="text-sm text-slate-200 prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: selectedMessage.body_html,
                      }}
                    />
                  ) : (
                    <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans">
                      {selectedMessage.body_text || "(tom e-post)"}
                    </pre>
                  )}
                </div>

                {/* AI Analysis section */}
                {(selectedMessage.ai_intent || analysisResult) && (
                  <div className="bg-slate-800/50 rounded-xl p-5 border border-cyan-500/20">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={16} className="text-cyan-400" />
                      <h3 className="text-sm font-semibold text-cyan-300">
                        AI-analyse
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {/* Intent */}
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase mb-1">
                          Formål
                        </p>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            INTENT_LABELS[
                              analysisResult?.analysis?.intent ||
                                selectedMessage.ai_intent ||
                                ""
                            ]?.color || "bg-slate-600/20 text-slate-300"
                          }`}
                        >
                          {INTENT_LABELS[
                            analysisResult?.analysis?.intent ||
                              selectedMessage.ai_intent ||
                              ""
                          ]?.label || "Ukjent"}
                        </span>
                      </div>

                      {/* Urgency */}
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase mb-1">
                          Hast
                        </p>
                        <span
                          className={`text-xs font-medium ${
                            URGENCY_LABELS[
                              analysisResult?.analysis?.urgency ||
                                selectedMessage.ai_urgency ||
                                ""
                            ]?.color || "text-slate-400"
                          }`}
                        >
                          {URGENCY_LABELS[
                            analysisResult?.analysis?.urgency ||
                              selectedMessage.ai_urgency ||
                              ""
                          ]?.label || "Ukjent"}
                        </span>
                      </div>

                      {/* Sentiment */}
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase mb-1">
                          Sentiment
                        </p>
                        <span
                          className={`text-xs font-medium ${
                            SENTIMENT_LABELS[
                              analysisResult?.analysis?.sentiment ||
                                selectedMessage.ai_sentiment ||
                                ""
                            ]?.color || "text-slate-400"
                          }`}
                        >
                          {SENTIMENT_LABELS[
                            analysisResult?.analysis?.sentiment ||
                              selectedMessage.ai_sentiment ||
                              ""
                          ]?.label || "Ukjent"}
                        </span>
                      </div>

                      {/* Language */}
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase mb-1">
                          Språk
                        </p>
                        <span className="text-xs text-slate-300">
                          {analysisResult?.analysis?.language ||
                            selectedMessage.ai_language ||
                            "-"}
                        </span>
                      </div>
                    </div>

                    {/* Summary */}
                    {(analysisResult?.analysis?.summary ||
                      selectedMessage.ai_summary) && (
                      <div className="mb-3">
                        <p className="text-[10px] text-slate-500 uppercase mb-1">
                          Oppsummering
                        </p>
                        <p className="text-xs text-slate-300">
                          {analysisResult?.analysis?.summary ||
                            selectedMessage.ai_summary}
                        </p>
                      </div>
                    )}

                    {/* Key Points */}
                    {analysisResult?.analysis?.key_points && (
                      <div className="mb-3">
                        <p className="text-[10px] text-slate-500 uppercase mb-1">
                          Nøkkelpunkter
                        </p>
                        <ul className="space-y-1">
                          {analysisResult.analysis.key_points.map((pt, i) => (
                            <li
                              key={i}
                              className="text-xs text-slate-300 flex items-start gap-1.5"
                            >
                              <ChevronRight
                                size={10}
                                className="mt-0.5 text-cyan-400"
                              />
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Suggested action */}
                    {(analysisResult?.analysis?.suggested_action ||
                      selectedMessage.ai_suggested_action) && (
                      <div className="mt-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <p className="text-[10px] text-cyan-400 uppercase mb-1">
                          Foreslått handling
                        </p>
                        <p className="text-xs text-cyan-200">
                          {analysisResult?.analysis?.suggested_action ||
                            selectedMessage.ai_suggested_action}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Context Match */}
                {analysisResult?.context_match && (
                  <div className="bg-slate-800/50 rounded-xl p-5 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-4">
                      <User size={16} className="text-purple-400" />
                      <h3 className="text-sm font-semibold text-purple-300">
                        Kontekst-match
                      </h3>
                      <span className="text-[10px] text-slate-500">
                        ({Math.round(analysisResult.context_match.confidence * 100)}% sikkerhet)
                      </span>
                    </div>

                    <div className="space-y-2">
                      {analysisResult.context_match.matched_lead_name && (
                        <div className="flex items-center gap-2 text-xs">
                          <User size={12} className="text-blue-400" />
                          <span className="text-slate-400">Lead:</span>
                          <span className="text-slate-200">
                            {analysisResult.context_match.matched_lead_name}
                          </span>
                        </div>
                      )}
                      {analysisResult.context_match.matched_customer_name && (
                        <div className="flex items-center gap-2 text-xs">
                          <User size={12} className="text-green-400" />
                          <span className="text-slate-400">Kunde:</span>
                          <span className="text-slate-200">
                            {analysisResult.context_match.matched_customer_name}
                          </span>
                        </div>
                      )}
                      {analysisResult.context_match.matched_property_ids
                        ?.length > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <Building2 size={12} className="text-cyan-400" />
                          <span className="text-slate-400">Eiendommer:</span>
                          <span className="text-slate-200">
                            {analysisResult.context_match.matched_property_ids.join(", ")}
                          </span>
                        </div>
                      )}
                      {analysisResult.context_match.matched_plot_ids?.length >
                        0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <MapPin size={12} className="text-green-400" />
                          <span className="text-slate-400">Tomter:</span>
                          <span className="text-slate-200">
                            {analysisResult.context_match.matched_plot_ids.join(", ")}
                          </span>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-500 mt-2">
                        {analysisResult.context_match.reasoning}
                      </p>
                    </div>
                  </div>
                )}

                {/* Analyze button (if not yet analyzed) */}
                {!selectedMessage.ai_intent && !analysisResult && (
                  <button
                    onClick={() => analyzeEmail(selectedMessage.id)}
                    disabled={analyzing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-300 text-sm font-medium hover:from-cyan-500/30 hover:to-blue-500/30 transition-all disabled:opacity-50"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Analyserer med AI...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Analyser med Elena AI
                      </>
                    )}
                  </button>
                )}

                {/* Draft Reply Section */}
                {(analysisResult?.draft || draftText) && (
                  <div className="bg-slate-800/50 rounded-xl p-5 border border-green-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={16} className="text-green-400" />
                        <h3 className="text-sm font-semibold text-green-300">
                          AI svar-utkast
                        </h3>
                      </div>
                      {analysisResult?.draft?.ai_confidence && (
                        <span className="text-[10px] text-slate-500">
                          {Math.round(analysisResult.draft.ai_confidence * 100)}%
                          sikkerhet
                        </span>
                      )}
                    </div>

                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      rows={10}
                      className="w-full px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-green-500/50 resize-y"
                    />

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setDraftText("");
                            setAnalysisResult(null);
                          }}
                          className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                        >
                          <XCircle size={14} className="inline mr-1" />
                          Forkast
                        </button>
                      </div>
                      <button
                        onClick={sendDraft}
                        disabled={sending || !draftText}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-300 text-sm font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                      >
                        {sending ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Sender...
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            Send svar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {selectedMessage.ai_intent && (
                  <div className="flex flex-wrap gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
                      <User size={12} />
                      Legg til i CRM
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
                      <Eye size={12} />
                      Planlegg visning
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
                      <Building2 size={12} />
                      Send prospekt
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Mail size={48} className="mb-4 opacity-30" />
              <p className="text-sm">Velg en e-post for å se detaljer</p>
              <p className="text-xs text-slate-600 mt-1">
                Elena AI analyserer og foreslår svar automatisk
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
