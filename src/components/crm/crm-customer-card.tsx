"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BotOff,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Home,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CustomerUpdatePanel } from "@/components/customers/customer-update-panel";
import { CustomerSalesAssistantNote } from "@/components/customers/customer-sales-assistant-note";
import { CustomerPipelineControl } from "@/components/customers/customer-pipeline-control";

interface Customer360Payload {
  generatedAt: string;
  contact: Record<string, any>;
  brandId: string;
  nextAction?: {
    title: string;
    description: string;
    reason: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel?: string;
    secondaryHref?: string;
  };
  completeness: {
    score: number;
    checks: Array<{ id: string; label: string; complete: boolean }>;
    missing: string[];
  };
  activeBuyerProfile: Record<string, any> | null;
  criteria: Array<Record<string, any>>;
  shortlists: Array<Record<string, any> & { items: Array<Record<string, any>> }>;
  presentations: Array<Record<string, any>>;
  messageDrafts: Array<Record<string, any>>;
  workItems: Array<Record<string, any>>;
  communicationDialogue: {
    sentCount: number;
    replyCount: number;
    lastSentAt: string | null;
    lastReplyAt: string | null;
    awaitingReply: boolean;
    manualTakeover: boolean;
    emailBlocked: boolean;
    blockedReason: string | null;
    messages: Array<Record<string, any>>;
  };
  salesIntelligence: {
    stage: string;
    priority: "P1" | "P2" | "P3" | "PAUSED";
    score: number;
    headline: string;
    momentum: "HOT" | "WARM" | "COOL" | "PAUSED" | "CLOSED";
    scores: { profile: number; engagement: number; timing: number; intent: number; overall: number };
    whyNow: string[];
    signals: string[];
    risks: string[];
    missing: string[];
    nextBestAction: { action: string; why: string; channel: string };
    stageGuidance: {
      current: string;
      next: string | null;
      completionPercent: number;
      readyToAdvance: boolean;
      criteria: Array<{ id: string; label: string; met: boolean; evidence?: string | null }>;
    };
    commitmentLadder: Array<{
      id: string;
      label: string;
      status: "CONFIRMED" | "PARTIAL" | "OPEN" | "NOT_APPLICABLE";
      evidence: string | null;
      nextQuestion: string | null;
    }>;
    discoveryQuestions: string[];
    coach: { do: string[]; avoid: string[] };
    guardrail: string;
  };
  timeline: Array<{
    id: string;
    kind: string;
    title: string;
    detail?: string | null;
    occurredAt: string;
    direction?: string;
  }>;
  warnings: string[];
}

type CustomerCardTab = "overview" | "dialog" | "update" | "timeline" | "property" | "portal";
type CustomerUpdateTab = "details" | "update";

const STAGE_LABELS: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  MATCHING: "Boligmatching",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  RESERVED: "Reservert",
  WON: "Kunde / vunnet",
  LOST: "Tapt",
  ON_HOLD: "På vent",
};

const BRAND_LABELS: Record<string, string> = {
  zeneco: "Zen Eco Homes",
  soleada: "Soleada.no",
  pinosoecolife: "Pinoso EcoLife",
};

const CRITERION_LABELS: Record<string, string> = {
  bedrooms: "Soverom",
  bathrooms: "Bad",
  property_type: "Boligtype",
  location: "Område",
  total_budget: "Totalbudsjett",
  purchase_price: "Kjøpspris",
  living_area_m2: "Boligareal",
  plot_area_m2: "Tomteareal",
  floor_position: "Etasje",
  has_lift: "Heis",
  terrace_area_m2: "Terrasse",
  view_quality: "Utsikt",
  orientation: "Orientering",
  parking: "Parkering",
  pool: "Basseng",
  new_build_or_resale: "Nybygg / brukt",
  distance_to_beach: "Avstand til strand",
  other: "Annet",
};

const OPEN_TASK_STATUSES = new Set(["TO_DO", "IN_PROGRESS", "REVIEW"]);

function money(value: unknown) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: Number(value || 0) >= 1_000_000 ? "compact" : "standard",
  }).format(Number(value || 0));
}

function dateLabel(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime())
    ? "Ikke satt"
    : new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function criterionValue(value: unknown) {
  if (value === null || value === undefined) return "Ikke satt";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return String(row.value ?? row.label ?? row.text ?? JSON.stringify(value));
  }
  return String(value);
}

function priorityClasses(priority?: string) {
  if (priority === "CRITICAL") return "border-red-400/40 bg-red-500/15 text-red-100";
  if (priority === "HIGH") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  if (priority === "MEDIUM") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  return "border-slate-700 bg-slate-800 text-slate-300";
}

function momentumClasses(momentum?: string) {
  if (momentum === "HOT") return "border-red-400/40 bg-red-500/15 text-red-100";
  if (momentum === "WARM") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  if (momentum === "PAUSED") return "border-slate-500/40 bg-slate-500/10 text-slate-200";
  if (momentum === "CLOSED") return "border-slate-700 bg-slate-900 text-slate-400";
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}

function timelineIcon(kind: string) {
  if (kind === "portal") return MessageSquare;
  if (kind === "profile") return UserRound;
  if (kind === "shortlist") return Home;
  if (kind === "presentation" || kind === "draft") return FileText;
  if (kind === "task") return ClipboardCheck;
  if (kind === "revenue") return CircleDollarSign;
  return CalendarClock;
}

function actionUsesCustomerUpdateTab(href?: string) {
  return Boolean(href && /^\/customers\/[^/]+$/.test(href));
}

function cleanEmailBody(message: Record<string, any>) {
  const text = String(message.body_text || "").trim();
  if (text) return text;
  const html = String(message.body_html || "");
  if (!html) return "";
  return html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function communicationStatusLabel(data: Customer360Payload) {
  if (data.communicationDialogue.manualTakeover) return "STOPPET AV DEG";
  if (data.contact?.do_not_contact) return "STOPP / IKKE KONTAKT";
  if (data.communicationDialogue.emailBlocked) return "BLOKKERT";
  return "PÅ";
}

export function CrmCustomerCard({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [data, setData] = useState<Customer360Payload | null>(null);
  const [tab, setTab] = useState<CustomerCardTab>("overview");
  const [updateDefaultTab, setUpdateDefaultTab] = useState<CustomerUpdateTab>("update");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [portalData, setPortalData] = useState<Record<string, any> | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [takeoverMessage, setTakeoverMessage] = useState("");
  const [salesCoachBusy, setSalesCoachBusy] = useState(false);
  const [salesCoachMode, setSalesCoachMode] = useState<"NEXT_STEP" | "DISCOVERY" | "EMAIL" | "OBJECTION" | "MEETING">("NEXT_STEP");
  const [salesCoach, setSalesCoach] = useState<Record<string, any> | null>(null);
  const [salesCoachMeta, setSalesCoachMeta] = useState<{ provider?: string; model?: string } | null>(null);
  const [salesCoachSourceText, setSalesCoachSourceText] = useState("");
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachSending, setOutreachSending] = useState(false);
  const [outreachGenerating, setOutreachGenerating] = useState(false);
  const [outreachData, setOutreachData] = useState<Record<string, any> | null>(null);
  const [outreachMode, setOutreachMode] = useState<"template" | "ai" | "manual">("template");
  const [outreachSource, setOutreachSource] = useState<"template" | "ai" | "manual">("template");
  const [outreachTemplateId, setOutreachTemplateId] = useState<string>("");
  const [outreachTheme, setOutreachTheme] = useState("");
  const [outreachKeywords, setOutreachKeywords] = useState("");
  const [outreachSubject, setOutreachSubject] = useState("");
  const [outreachBody, setOutreachBody] = useState("");
  const [outreachMessage, setOutreachMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/360`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente kundekortet.");
      setData(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente kundekortet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTab("overview");
    setUpdateDefaultTab("update");
    setSalesCoach(null);
    setSalesCoachMeta(null);
    setSalesCoachSourceText("");
    setOutreachOpen(false);
    setOutreachData(null);
    setOutreachMode("template");
    setOutreachSource("template");
    setOutreachTemplateId("");
    setOutreachTheme("");
    setOutreachKeywords("");
    setOutreachSubject("");
    setOutreachBody("");
    setOutreachMessage("");
    void load();
  }, [contactId]);

  useEffect(() => {
    if (tab !== "portal") return;
    let cancelled = false;
    setPortalLoading(true);
    fetch(`/api/crm/portal-admin?contactId=${encodeURIComponent(contactId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Min side-data.");
        if (!cancelled) setPortalData(body);
      })
      .catch((portalError) => {
        if (!cancelled) setPortalData({ error: portalError instanceof Error ? portalError.message : String(portalError) });
      })
      .finally(() => {
        if (!cancelled) setPortalLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, contactId]);

  function openCustomerUpdate() {
    setUpdateDefaultTab("update");
    setTab("update");
  }

  function openContactDetails() {
    setUpdateDefaultTab("details");
    setTab("update");
  }

  async function loadOutreachComposer() {
    setOutreachLoading(true);
    setOutreachMessage("");
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/outreach`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke åpne e-postverktøyet.");
      setOutreachData(body);
      setOutreachOpen(true);
      if (!outreachSubject && body?.templates?.[0]) {
        setOutreachTemplateId(String(body.templates[0].id || ""));
        setOutreachSubject(String(body.templates[0].subject || ""));
        setOutreachBody(String(body.templates[0].body || ""));
        setOutreachSource("template");
      }
    } catch (outreachError) {
      setError(outreachError instanceof Error ? outreachError.message : "Kunne ikke åpne e-postverktøyet.");
    } finally {
      setOutreachLoading(false);
    }
  }

  function applyOutreachTemplate(template: Record<string, any>) {
    setOutreachMode("template");
    setOutreachSource("template");
    setOutreachTemplateId(String(template.id || ""));
    setOutreachSubject(String(template.subject || ""));
    setOutreachBody(String(template.body || ""));
    setOutreachMessage("");
  }

  function startManualOutreach() {
    setOutreachMode("manual");
    setOutreachSource("manual");
    setOutreachTemplateId("");
    setOutreachSubject("");
    setOutreachBody("");
    setOutreachMessage("");
  }

  async function generateOutreachEmail() {
    if (!outreachTheme.trim()) {
      setOutreachMessage("Skriv et tema eller hva du ønsker å oppnå med e-posten.");
      return;
    }
    setOutreachGenerating(true);
    setOutreachMessage("");
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "GENERATE",
          mode: "AI",
          theme: outreachTheme,
          keywords: outreachKeywords,
          tone: "warm",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lage e-postutkast.");
      setOutreachMode("ai");
      setOutreachSource("ai");
      setOutreachTemplateId("");
      setOutreachSubject(String(body?.draft?.subject || ""));
      setOutreachBody(String(body?.draft?.bodyText || ""));
      setOutreachMessage(body?.provider === "deterministic" ? "Utkast laget med sikker fallback." : "AI-utkast klart. Les gjennom og rediger før sending.");
    } catch (outreachError) {
      setError(outreachError instanceof Error ? outreachError.message : "Kunne ikke lage e-postutkast.");
    } finally {
      setOutreachGenerating(false);
    }
  }

  async function sendOutreachEmail() {
    if (!outreachData?.eligibility?.allowed) {
      setOutreachMessage(outreachData?.eligibility?.blockedReason || "Kunden kan ikke kontaktes nå.");
      return;
    }
    if (!outreachSubject.trim() || !outreachBody.trim()) {
      setOutreachMessage("Emne og e-posttekst må fylles ut før sending.");
      return;
    }
    const recipient = outreachData?.recipient?.email || data?.contact?.email || "kunden";
    const confirmed = window.confirm(`Send denne e-posten til ${recipient}?\n\nEmne: ${outreachSubject}\n\nE-posten sendes med en gang fra merkevarens konfigurerte e-postkonto.`);
    if (!confirmed) return;

    setOutreachSending(true);
    setOutreachMessage("");
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SEND",
          subject: outreachSubject,
          bodyText: outreachBody,
          confirmReviewed: true,
          source: outreachSource,
          templateId: outreachTemplateId || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "E-posten kunne ikke sendes.");
      setOutreachMessage(`Sendt til ${body?.recipient || recipient} fra ${body?.sender || "merkevarens e-postkonto"}.`);
      await Promise.all([load(), loadOutreachComposer()]);
    } catch (outreachError) {
      setError(outreachError instanceof Error ? outreachError.message : "E-posten kunne ikke sendes.");
    } finally {
      setOutreachSending(false);
    }
  }

  async function runSalesCoach(mode: "NEXT_STEP" | "DISCOVERY" | "EMAIL" | "OBJECTION" | "MEETING") {
    setSalesCoachBusy(true);
    setSalesCoachMode(mode);
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/sales-coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, sourceText: salesCoachSourceText.trim() || undefined }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke kjøre AI Sales Coach.");
      setSalesCoach(body?.coach || null);
      setSalesCoachMeta({ provider: body?.provider, model: body?.model });
    } catch (coachError) {
      setError(coachError instanceof Error ? coachError.message : "Kunne ikke kjøre AI Sales Coach.");
    } finally {
      setSalesCoachBusy(false);
    }
  }

  async function setManualTakeover(action: "TAKE_OVER" | "RELEASE") {
    const takingOver = action === "TAKE_OVER";
    const confirmed = window.confirm(
      takingOver
        ? "Ta over denne kunden? Dette stopper automatisk kundemail fra RealtyFlow/Nexus, men beholder CRM, historikk og pipeline."
        : "Gi kunden tilbake til RealtyFlow/Nexus? Den manuelle e-postsperren fjernes. Nurture forblir pauset til videre oppfølging aktiveres.",
    );
    if (!confirmed) return;

    setTakeoverBusy(true);
    setTakeoverMessage("");
    setError("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(contactId)}/communication-control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke endre kundedialog-kontrollen.");
      setTakeoverMessage(body?.message || (takingOver ? "Du har tatt over kunden." : "Takeover er fjernet."));
      await load();
    } catch (takeoverError) {
      setError(takeoverError instanceof Error ? takeoverError.message : "Kunne ikke endre kundedialog-kontrollen.");
    } finally {
      setTakeoverBusy(false);
    }
  }

  const groupedCriteria = useMemo(() => {
    const groups: Record<string, Array<Record<string, any>>> = {
      hard_requirement: [],
      preference: [],
      exclusion: [],
      missing_information: [],
    };
    for (const item of data?.criteria || []) (groups[item.criterion_type] ||= []).push(item);
    return groups;
  }, [data?.criteria]);

  const openTasks = (data?.workItems || []).filter((item) => OPEN_TASK_STATUSES.has(String(item.status || "TO_DO").toUpperCase()));
  const latestSentMessage = (data?.communicationDialogue.messages || []).find((message) => String(message.direction || "").toLowerCase() === "outbound") || null;
  const latestReplyMessage = (data?.communicationDialogue.messages || []).find((message) => String(message.direction || "").toLowerCase() === "inbound") || null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/75 p-3 md:p-6" onClick={onClose}>
      <Card className="my-3 w-full max-w-7xl border-slate-600 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="sticky top-0 z-20 border-b border-slate-700 bg-slate-950/95 p-4 backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-200">CRM-kundekort</span>
                {data?.contact && <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1">{STAGE_LABELS[String(data.contact.pipeline_status || "NEW").toUpperCase()] || data.contact.pipeline_status}</span>}
                {data && <span>{BRAND_LABELS[data.brandId] || data.brandId}</span>}
              </div>
              <h2 className="mt-3 truncate text-2xl font-bold text-white md:text-3xl">
                {data?.contact?.name || data?.contact?.email || (loading ? "Henter kundekort …" : "Kunde")}
              </h2>
              {data?.contact && (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
                  {data.contact.email ? <a href={`mailto:${data.contact.email}`} className="inline-flex items-center gap-1.5 hover:text-white"><Mail size={15} />{data.contact.email}</a> : <button type="button" onClick={openContactDetails} className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200"><Mail size={15} />Legg til e-post</button>}
                  {data.contact.phone ? <a href={`tel:${data.contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-white"><Phone size={15} />{data.contact.phone}</a> : <button type="button" onClick={openContactDetails} className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200"><Phone size={15} />Legg til telefon</button>}
                  <span className="inline-flex items-center gap-1.5"><CircleDollarSign size={15} />{money(data.contact.pipeline_value)}</span>
                  <span className="inline-flex items-center gap-1.5"><Building2 size={15} />{data.contact.property_interest || "Boliginteresse ikke satt"}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {data?.contact && !data.communicationDialogue.emailBlocked && (
                <Button
                  size="sm"
                  onClick={() => void setManualTakeover("TAKE_OVER")}
                  disabled={takeoverBusy}
                  className="border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                >
                  {takeoverBusy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <BotOff size={15} className="mr-2" />}
                  Jeg tar over kunden
                </Button>
              )}
              {data?.communicationDialogue.manualTakeover && (
                <Button variant="outline" size="sm" onClick={() => void setManualTakeover("RELEASE")} disabled={takeoverBusy}>
                  {takeoverBusy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <UserCheck size={15} className="mr-2 text-emerald-300" />}
                  Gi tilbake til Nexus
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={openContactDetails} disabled={!data?.contact}>
                <Pencil size={15} className="mr-2" />Rediger kontaktinfo
              </Button>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <RefreshCw size={15} className="mr-2" />}Oppdater
              </Button>
              <Button asChild variant="outline" size="sm"><Link href="/closing"><Target size={15} className="mr-2" />Closing</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/lead-intelligence">Lead Intelligence</Link></Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Lukk kundekort"><X size={20} /></Button>
            </div>
          </div>

          {data?.contact && (
            <div className="mt-4">
              <CustomerPipelineControl
                contactId={contactId}
                currentStatus={data.contact.pipeline_status}
                doNotContact={Boolean(data.contact.do_not_contact)}
                onSaved={() => void load()}
              />
            </div>
          )}

          <nav className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70 p-1">
            {([
              ["overview", "Oversikt"],
              ["dialog", "E-post & svar"],
              ["update", "Detaljer & oppdatering"],
              ["timeline", "Historikk"],
              ["property", "Kjøperprofil, boliger & oppgaver"],
              ["portal", "Min side"],
            ] as Array<[CustomerCardTab, string]>).map(([id, label]) => (
              <button key={id} onClick={() => id === "update" ? openCustomerUpdate() : setTab(id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${tab === id ? "bg-cyan-500/15 text-cyan-100" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </nav>
        </CardHeader>

        <CardContent className="p-4 md:p-6">
          {error && <div className="mb-4 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} />{error}</div>}
          {loading && !data ? (
            <div className="flex min-h-72 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" />Bygger samlet kundekort …</div>
          ) : !data ? null : (
            <>
              {data.warnings.map((warning) => <div key={warning} className="mb-3 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><AlertTriangle size={17} />{warning}</div>)}
              {takeoverMessage && <div className="mb-4 flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"><UserCheck size={18} />{takeoverMessage}</div>}

              {tab === "overview" && (
                <div className="space-y-5">
                  <section className="grid gap-4 xl:grid-cols-[1.55fr_.95fr]">
                    <article className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-emerald-300">Nexus · neste beste handling</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${momentumClasses(data.salesIntelligence.momentum)}`}>{data.salesIntelligence.momentum}</span>
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-200">{data.salesIntelligence.priority} · {data.salesIntelligence.score}/100</span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-white">{data.salesIntelligence.headline}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{data.salesIntelligence.nextBestAction.action}</p>
                      <p className="mt-2 text-xs text-slate-400">Hvorfor: {data.salesIntelligence.nextBestAction.why}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void runSalesCoach("NEXT_STEP")} disabled={salesCoachBusy}>
                          {salesCoachBusy && salesCoachMode === "NEXT_STEP" ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Sparkles size={14} className="mr-2" />}
                          Coach meg på neste steg
                        </Button>
                        <Button size="sm" variant="outline" onClick={openCustomerUpdate}>Registrer neste steg</Button>
                        {data.salesIntelligence.nextBestAction.channel !== "NONE" && <span className="inline-flex items-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400">Anbefalt kanal: {data.salesIntelligence.nextBestAction.channel}</span>}
                      </div>
                    </article>

                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">Salgsmodenhet</p>
                          <strong className="mt-1 block text-3xl text-white">{data.salesIntelligence.scores.overall}%</strong>
                        </div>
                        <ClipboardCheck className="text-cyan-300" size={30} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        {[
                          ["Profil", data.salesIntelligence.scores.profile],
                          ["Engasjement", data.salesIntelligence.scores.engagement],
                          ["Timing", data.salesIntelligence.scores.timing],
                          ["Intensjon", data.salesIntelligence.scores.intent],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                            <span className="text-slate-500">{label}</span>
                            <strong className="mt-1 block text-lg text-white">{Number(value)}%</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  </section>

                  <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Salgsfase & fasevakt</p>
                          <h3 className="mt-1 text-lg font-semibold text-white">
                            {data.salesIntelligence.stageGuidance.current}
                            {data.salesIntelligence.stageGuidance.next ? <> <ArrowRight size={15} className="mx-1 inline" /> {data.salesIntelligence.stageGuidance.next}</> : null}
                          </h3>
                          <p className="mt-1 text-sm text-slate-400">{data.salesIntelligence.stageGuidance.completionPercent}% av fasekriteriene er dokumentert.</p>
                        </div>
                        <span className={data.salesIntelligence.stageGuidance.readyToAdvance
                          ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200"
                          : "rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200"}>
                          {data.salesIntelligence.stageGuidance.readyToAdvance ? "Klar for neste fase" : "Mangler evidens"}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2">
                        {data.salesIntelligence.stageGuidance.criteria.map((criterion) => (
                          <div key={criterion.id} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
                            <CheckCircle2 size={16} className={criterion.met ? "mt-0.5 shrink-0 text-emerald-400" : "mt-0.5 shrink-0 text-slate-600"} />
                            <div>
                              <div className={criterion.met ? "text-slate-200" : "text-slate-400"}>{criterion.label}</div>
                              {criterion.evidence && <div className="mt-1 text-xs text-slate-500">{criterion.evidence}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Hva holder salget igjen?</p>
                      <div className="mt-3 space-y-3">
                        {data.salesIntelligence.risks.length > 0 ? (
                          data.salesIntelligence.risks.map((risk) => (
                            <div key={risk} className="flex gap-2 text-sm leading-5 text-amber-100">
                              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />{risk}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-emerald-300">Ingen tydelige salgsrisikoer er identifisert nå.</div>
                        )}
                      </div>
                      {data.salesIntelligence.missing.length > 0 && (
                        <div className="mt-4 border-t border-slate-800 pt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mangler for neste fase</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {data.salesIntelligence.missing.map((item) => <span key={item} className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">{item}</span>)}
                          </div>
                        </div>
                      )}
                      {data.salesIntelligence.whyNow.length > 0 && (
                        <div className="mt-4 border-t border-slate-800 pt-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Hvorfor nå</p>
                          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
                            {data.salesIntelligence.whyNow.map((item) => <li key={item}>• {item}</li>)}
                          </ul>
                        </div>
                      )}
                    </article>
                  </section>

                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Beslutningsstige</p>
                        <h3 className="mt-1 text-lg font-semibold text-white">Hva har kunden faktisk bekreftet?</h3>
                        <p className="mt-1 text-sm text-slate-400">Skiller dokumentert fremdrift fra antakelser. Neste steg bør flytte én åpen linje mot bekreftet.</p>
                      </div>
                      <span className="text-xs text-slate-500">Behov → kriterier → alternativer → reaksjon → beslutning → forpliktelse</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {data.salesIntelligence.commitmentLadder.map((step) => {
                        const statusClass = step.status === "CONFIRMED"
                          ? "border-emerald-500/25 bg-emerald-500/5"
                          : step.status === "PARTIAL"
                            ? "border-amber-500/25 bg-amber-500/5"
                            : step.status === "OPEN"
                              ? "border-cyan-500/25 bg-cyan-500/5"
                              : "border-slate-800 bg-slate-950/40";
                        const statusLabel = step.status === "CONFIRMED" ? "Bekreftet" : step.status === "PARTIAL" ? "Delvis" : step.status === "OPEN" ? "Åpen" : "Ikke aktuell ennå";
                        return (
                          <article key={step.id} className={`rounded-xl border p-4 ${statusClass}`}>
                            <div className="flex items-center justify-between gap-2">
                              <strong className="text-sm text-white">{step.label}</strong>
                              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{statusLabel}</span>
                            </div>
                            {step.evidence && <p className="mt-2 text-xs leading-5 text-slate-400">{step.evidence}</p>}
                            {step.nextQuestion && <p className="mt-3 text-xs leading-5 text-cyan-200"><b>Neste spørsmål:</b> {step.nextQuestion}</p>}
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-300"><Sparkles size={15} />AI Sales Coach</div>
                        <h3 className="mt-1 text-xl font-semibold text-white">Hjelp meg å dra salget fremover</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Coachen bruker Buyer Profile, siste kundesvar, pipeline, shortlist og salgsfasen. Den foreslår og skriver utkast, men sender aldri noe.</p>
                      </div>
                      {salesCoachMeta?.provider && <span className="text-xs text-slate-500">{salesCoachMeta.provider}{salesCoachMeta.model ? ` · ${salesCoachMeta.model}` : ""}</span>}
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={`sales-coach-source-${contactId}`}>Valgfri kundetekst å analysere</label>
                      <textarea
                        id={`sales-coach-source-${contactId}`}
                        value={salesCoachSourceText}
                        onChange={(event) => setSalesCoachSourceText(event.target.value)}
                        rows={4}
                        className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-200 outline-none focus:border-violet-400"
                        placeholder="Lim inn f.eks. en WhatsApp-melding, e-post eller notat fra telefonsamtale. La stå tomt for å bruke siste registrerte kundesvar."
                      />
                      <p className="mt-2 text-xs text-slate-500">Teksten brukes bare som analysegrunnlag sammen med Buyer Profile og CRM-historikken. Coachen sender ingenting.</p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {([
                        ["NEXT_STEP", "Neste steg"],
                        ["DISCOVERY", "Spørsmål"],
                        ["OBJECTION", "Innvendinger"],
                        ["MEETING", "Samtale/møte"],
                        ["EMAIL", "E-postutkast"],
                      ] as const).map(([mode, label]) => (
                        <Button
                          key={mode}
                          size="sm"
                          variant={salesCoachMode === mode && salesCoach ? "default" : "outline"}
                          onClick={() => void runSalesCoach(mode)}
                          disabled={salesCoachBusy}
                        >
                          {salesCoachBusy && salesCoachMode === mode ? <Loader2 size={14} className="mr-2 animate-spin" /> : mode === "NEXT_STEP" ? <Sparkles size={14} className="mr-2" /> : null}
                          {label}
                        </Button>
                      ))}
                    </div>

                    {!salesCoach && (
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gode neste spørsmål</p>
                          <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-300">
                            {data.salesIntelligence.discoveryQuestions.slice(0, 4).map((question) => <li key={question}>• {question}</li>)}
                          </ul>
                        </div>
                        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coach-prinsipp</p>
                          <p className="mt-3 text-sm leading-6 text-slate-300">Reduser én konkret usikkerhet om gangen. Ikke send flere boliger bare for å skape aktivitet. Få kunden til å uttrykke prioritering, reaksjon eller neste forpliktelse med egne ord.</p>
                        </div>
                      </div>
                    )}

                    {salesCoach && (
                      <div className="mt-5 space-y-4">
                        <div className="rounded-xl border border-violet-500/20 bg-slate-950/50 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-200">{salesCoach.currentPhase}</span>
                            {salesCoach.confidence && <span className="text-xs text-slate-500">Confidence {salesCoach.confidence}</span>}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-200">{salesCoach.summary}</p>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <article className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Neste beste handling</p>
                            <h4 className="mt-2 font-semibold text-white">{salesCoach.nextBestAction?.action}</h4>
                            <p className="mt-2 text-sm leading-5 text-slate-400">{salesCoach.nextBestAction?.why}</p>
                            {salesCoach.nextBestAction?.channel && <span className="mt-3 inline-flex rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400">{salesCoach.nextBestAction.channel}</span>}
                          </article>
                          <article className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Spør kunden</p>
                            <ul className="mt-2 space-y-2 text-sm leading-5 text-slate-300">
                              {(salesCoach.customerSituation?.questions || []).slice(0, 4).map((question: string) => <li key={question}>• {question}</li>)}
                            </ul>
                          </article>
                        </div>

                        {(salesCoach.sellerCoach?.do?.length || salesCoach.sellerCoach?.avoid?.length) > 0 && (
                          <div className="grid gap-4 lg:grid-cols-2">
                            <article className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Gjør</p>
                              <ul className="mt-2 space-y-2 text-sm text-slate-300">{(salesCoach.sellerCoach?.do || []).slice(0, 5).map((item: string) => <li key={item}>• {item}</li>)}</ul>
                            </article>
                            <article className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Unngå</p>
                              <ul className="mt-2 space-y-2 text-sm text-slate-300">{(salesCoach.sellerCoach?.avoid || []).slice(0, 5).map((item: string) => <li key={item}>• {item}</li>)}</ul>
                            </article>
                          </div>
                        )}

                        {salesCoach.emailDraft?.body && (
                          <article className="rounded-xl border border-slate-700 bg-slate-950/60">
                            <div className="border-b border-slate-800 p-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Utkast · sendes ikke automatisk</p>
                              <div className="mt-1 font-semibold text-white">{salesCoach.emailDraft.subject || "E-postutkast"}</div>
                            </div>
                            <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-6 text-slate-300">{salesCoach.emailDraft.body}</pre>
                          </article>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Siste dialog</p>
                        <h3 className="mt-1 text-lg font-semibold text-white">Hva har vi sendt – og har kunden svart?</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          {data.communicationDialogue.awaitingReply
                            ? "Siste registrerte hendelse er en utsendt e-post. Vi venter på kundesvar."
                            : data.communicationDialogue.replyCount
                              ? "Kunden har svart etter siste registrerte utsendelse."
                              : "Ingen kundesvar er registrert ennå."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setTab("dialog")}>
                          <Mail size={15} className="mr-2" />Se hele e-posttråden
                        </Button>
                        {!data.communicationDialogue.emailBlocked && (
                          <Button
                            size="sm"
                            onClick={() => void setManualTakeover("TAKE_OVER")}
                            disabled={takeoverBusy}
                            className="border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                          >
                            <BotOff size={15} className="mr-2" />Jeg tar over kunden
                          </Button>
                        )}
                        {data.communicationDialogue.manualTakeover && (
                          <span className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                            <UserCheck size={15} className="mr-2" />Du har tatt over · auto e-post stoppet
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                          <ArrowUpRight size={14} />Sist sendt
                        </div>
                        {latestSentMessage ? (
                          <>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <strong className="text-sm text-white">{String(latestSentMessage.subject || "E-post uten emne")}</strong>
                              <span className="text-xs text-slate-500">{dateLabel(latestSentMessage.received_at || latestSentMessage.created_at)}</span>
                            </div>
                            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-slate-300">{cleanEmailBody(latestSentMessage) || "Ingen tekstvisning tilgjengelig."}</p>
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Ingen utsendt e-post er registrert på kunden.</p>
                        )}
                      </article>

                      <article className={latestReplyMessage ? "rounded-xl border border-violet-500/25 bg-violet-500/5 p-4" : "rounded-xl border border-slate-700 bg-slate-950/60 p-4"}>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
                          <ArrowDownLeft size={14} />Siste svar fra kunden
                        </div>
                        {latestReplyMessage ? (
                          <>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <strong className="text-sm text-white">{String(latestReplyMessage.subject || "Svar uten emne")}</strong>
                              <span className="text-xs text-slate-500">{dateLabel(latestReplyMessage.received_at || latestReplyMessage.created_at)}</span>
                            </div>
                            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-slate-300">{cleanEmailBody(latestReplyMessage) || "Ingen tekstvisning tilgjengelig."}</p>
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Ingen svar fra kunden er registrert.</p>
                        )}
                      </article>
                    </div>
                  </section>

                  <section className="grid gap-4 xl:grid-cols-3">
                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 xl:col-span-2">
                      <h3 className="text-lg font-semibold text-white">Kundedetaljer</h3>
                      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                        {[
                          ["Navn", data.contact.name],
                          ["E-post", data.contact.email],
                          ["Telefon", data.contact.phone],
                          ["Land", data.contact.country],
                          ["Språk", data.contact.language],
                          ["Ønsket område", data.contact.preferred_location],
                          ["Boliginteresse", data.contact.property_interest],
                          ["Pipeline-verdi", money(data.contact.pipeline_value)],
                        ].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-slate-200">{String(value || "Ikke satt")}</dd></div>)}
                      </dl>
                      <Button className="mt-5" size="sm" onClick={openContactDetails}><Pencil size={14} className="mr-2" />Rediger detaljer</Button>
                    </article>
                    <article className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                      <h3 className="text-lg font-semibold text-white">Kjøperprofil</h3>
                      {data.activeBuyerProfile ? <>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{data.activeBuyerProfile.status}</span><span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{data.activeBuyerProfile.purchase_readiness || "unknown"}</span></div>
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{data.activeBuyerProfile.summary || "Profilen mangler oppsummering."}</p>
                      </> : <p className="mt-3 text-sm text-slate-500">Ingen koblet kjøperprofil.</p>}
                    </article>
                  </section>
                </div>
              )}

              {tab === "dialog" && (
                <div className="space-y-5">
                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Kundedialog</p>
                        <h3 className="mt-1 text-xl font-semibold text-white">Hva er sendt – og hva har kunden svart?</h3>
                        <p className="mt-2 text-sm text-slate-400">Viser både CRM-koblede meldinger og e-post som er funnet via kundens e-postadresse.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {data.communicationDialogue.manualTakeover ? (
                          <>
                            <span className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100">
                              <UserCheck size={16} className="mr-2" />Du har tatt over · auto e-post stoppet
                            </span>
                            <Button variant="outline" size="sm" onClick={() => void setManualTakeover("RELEASE")} disabled={takeoverBusy}>Gi tilbake til Nexus</Button>
                          </>
                        ) : data.communicationDialogue.emailBlocked ? (
                          <span className="inline-flex items-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100">
                            <BotOff size={16} className="mr-2" />E-post blokkert · {data.communicationDialogue.blockedReason || "CRM-sperre"}
                          </span>
                        ) : (
                          <Button onClick={() => void setManualTakeover("TAKE_OVER")} disabled={takeoverBusy} className="border border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25">
                            <BotOff size={16} className="mr-2" />Jeg tar over kunden
                          </Button>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <article className={`rounded-xl border p-4 ${data.communicationDialogue.manualTakeover || data.communicationDialogue.emailBlocked ? "border-red-500/30 bg-red-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Auto e-post</p>
                      <strong className="mt-2 block text-xl text-white">{communicationStatusLabel(data)}</strong>
                      <p className="mt-1 text-xs text-slate-400">{data.communicationDialogue.manualTakeover ? "Ingen systemmail sendes mens du har takeover." : "CRM-sperrer kontrolleres før utsendelse."}</p>
                    </article>
                    <article className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Sendt til kunden</p>
                      <strong className="mt-2 block text-2xl text-white">{data.communicationDialogue.sentCount}</strong>
                      <p className="mt-1 text-xs text-slate-400">Sist: {dateLabel(data.communicationDialogue.lastSentAt)}</p>
                    </article>
                    <article className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Svar fra kunden</p>
                      <strong className="mt-2 block text-2xl text-white">{data.communicationDialogue.replyCount}</strong>
                      <p className="mt-1 text-xs text-slate-400">Sist: {dateLabel(data.communicationDialogue.lastReplyAt)}</p>
                    </article>
                    <article className={`rounded-xl border p-4 ${data.communicationDialogue.awaitingReply ? "border-amber-500/30 bg-amber-500/10" : "border-slate-700 bg-slate-900/60"}`}>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Dialogstatus</p>
                      <strong className="mt-2 block text-xl text-white">{data.communicationDialogue.awaitingReply ? "Venter på svar" : data.communicationDialogue.replyCount ? "Kunden har svart" : "Ingen svar registrert"}</strong>
                      <p className="mt-1 text-xs text-slate-400">{data.communicationDialogue.awaitingReply ? "Siste hendelse er en utsendt e-post." : "Se tråden under for siste dialog."}</p>
                    </article>
                  </section>

                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-white">E-posttråd</h3>
                        <p className="mt-1 text-sm text-slate-500">Nyeste først. SENDT = fra RealtyFlow/merkevaren. SVAR = fra kunden.</p>
                      </div>
                      <Mail className="text-cyan-300" />
                    </div>
                    {data.communicationDialogue.messages.length === 0 ? (
                      <p className="mt-5 text-sm text-slate-500">Ingen e-post er koblet til denne kunden ennå.</p>
                    ) : (
                      <div className="mt-5 space-y-3">
                        {data.communicationDialogue.messages.slice(0, 100).map((message) => {
                          const outbound = String(message.direction || "").toLowerCase() === "outbound";
                          const body = cleanEmailBody(message);
                          return (
                            <article key={String(message.id)} className={`rounded-xl border p-4 ${outbound ? "border-cyan-500/25 bg-cyan-500/5" : "border-violet-500/25 bg-violet-500/5"}`}>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black tracking-wide ${outbound ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-violet-400/40 bg-violet-500/15 text-violet-100"}`}>
                                      {outbound ? <ArrowUpRight size={13} className="mr-1" /> : <ArrowDownLeft size={13} className="mr-1" />}
                                      {outbound ? "SENDT" : "SVAR"}
                                    </span>
                                    <strong className="truncate text-sm text-white">{message.subject || "(uten emne)"}</strong>
                                  </div>
                                  <p className="mt-2 text-xs text-slate-500">
                                    {outbound ? `Til: ${Array.isArray(message.to_addresses) ? message.to_addresses.join(", ") : data.contact.email || "kunden"}` : `Fra: ${message.from_name || message.from_address || data.contact.email || "kunden"}`}
                                  </p>
                                </div>
                                <span className="shrink-0 text-xs text-slate-500">{dateLabel(message.received_at || message.created_at)}</span>
                              </div>
                              {body ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{body}</p> : <p className="mt-3 text-sm italic text-slate-500">Ingen tekstinnhold lagret.</p>}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {tab === "update" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <h3 className="font-semibold text-white">Samme kundekort – ingen separat Customer 360-side</h3>
                    <p className="mt-1 text-sm text-slate-400">Rediger kundedata eller registrer samtale, WhatsApp, e-post, møte, visning, tilbud, økonomi eller closing direkte her.</p>
                  </div>
                  <CustomerSalesAssistantNote contactId={contactId} onSaved={() => void load()} />
                  <CustomerUpdatePanel contactId={contactId} defaultExpanded defaultTab={updateDefaultTab} onSaved={() => void load()} />
                </div>
              )}

              {tab === "portal" && (
                <div className="space-y-4">
                  <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Min side</p>
                        <h3 className="mt-1 text-xl font-semibold text-white">Kundeportal for {data.contact.name || data.contact.email}</h3>
                        <p className="mt-2 text-sm text-slate-400">Portalstatus, dialog, dokumenter og aktuelle bolig-/tomteforslag samlet på kundekortet.</p>
                      </div>
                      <Button asChild variant="outline" size="sm"><Link href="/nexus-os/portal-engagement">Se all Min side-aktivitet</Link></Button>
                    </div>
                  </section>

                  {portalLoading ? (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-slate-400"><Loader2 size={18} className="animate-spin" />Henter Min side …</div>
                  ) : portalData?.error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{portalData.error}</div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                        <h3 className="font-semibold text-white">Portalstatus</h3>
                        <p className="mt-2 text-sm text-slate-400">
                          {portalData?.portalUser
                            ? `Status: ${portalData.portalUser.status || "aktiv"} · ${portalData.portalUser.email || data.contact.email}`
                            : "Min side er ikke aktivert for denne kunden ennå."}
                        </p>
                        <div className="mt-4 flex gap-2">
                          <Button asChild size="sm" variant="outline"><Link href="/nexus-os/portal-engagement">Portalaktivitet</Link></Button>
                        </div>
                      </section>

                      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                        <h3 className="font-semibold text-white">Meldinger</h3>
                        <p className="mt-2 text-3xl font-bold text-white">{Array.isArray(portalData?.messages) ? portalData.messages.length : 0}</p>
                        <p className="text-sm text-slate-500">meldinger i Min side-dialogen</p>
                        {Array.isArray(portalData?.messages) && portalData.messages.slice(0, 3).map((message: any) => (
                          <div key={message.id} className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
                            <strong>{message.sender_type === "customer" ? "Kunden" : message.sender_name || "Zen Eco Homes"}</strong>
                            <p className="mt-1 line-clamp-3 text-slate-400">{message.body}</p>
                          </div>
                        ))}
                      </section>

                      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                        <h3 className="font-semibold text-white">Dokumenter</h3>
                        <p className="mt-2 text-3xl font-bold text-white">{Array.isArray(portalData?.documents) ? portalData.documents.length : 0}</p>
                        <p className="text-sm text-slate-500">publisert til kunden</p>
                        {Array.isArray(portalData?.documents) && portalData.documents.slice(0, 4).map((doc: any) => (
                          <div key={doc.id} className="mt-3 flex items-start gap-2 text-sm text-slate-300"><FileText size={15} className="mt-0.5 text-cyan-300" /><span>{doc.title}</span></div>
                        ))}
                      </section>

                      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                        <h3 className="font-semibold text-white">Aktuelle matcher</h3>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><p className="text-2xl font-bold text-white">{Array.isArray(portalData?.properties) ? portalData.properties.length : 0}</p><p className="text-xs text-slate-500">boliger</p></div>
                          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><p className="text-2xl font-bold text-white">{Array.isArray(portalData?.plots) ? portalData.plots.length : 0}</p><p className="text-xs text-slate-500">tomter</p></div>
                        </div>
                        {Array.isArray(portalData?.properties) && portalData.properties.slice(0, 4).map((property: any) => (
                          <div key={property.id} className="mt-3 flex items-start gap-2 text-sm text-slate-300"><Home size={15} className="mt-0.5 text-cyan-300" /><span>{property.title_no || property.title || property.ref || property.id} {property.price ? `· ${money(property.price)}` : ""}</span></div>
                        ))}
                      </section>
                    </div>
                  )}
                </div>
              )}

              {tab === "timeline" && (
                <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                  <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-white">Samlet kundehistorikk</h3><p className="text-sm text-slate-500">CRM-oppdateringer, visninger, meldinger, profiler, oppgaver og revenue-hendelser.</p></div><MessageSquare className="text-cyan-300" /></div>
                  {data.timeline.length === 0 ? <p className="mt-5 text-sm text-slate-500">Ingen aktiviteter er registrert.</p> : <div className="mt-5 space-y-4">{data.timeline.slice(0, 150).map((item) => { const Icon = timelineIcon(item.kind); return <div key={`${item.kind}-${item.id}`} className="flex gap-3"><div className="mt-0.5 rounded-full border border-slate-700 bg-slate-800 p-2"><Icon size={15} className="text-slate-300" /></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><strong className="text-sm text-slate-200">{item.title}</strong><span className="text-xs text-slate-600">{dateLabel(item.occurredAt)}</span></div>{item.detail && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-400">{item.detail}</p>}</div></div>; })}</div>}
                </section>
              )}

              {tab === "property" && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                    <h3 className="text-lg font-semibold text-white">Kriterier</h3>
                    {data.criteria.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen strukturerte kriterier.</p> : <div className="mt-4 space-y-4">{Object.entries(groupedCriteria).map(([type, items]) => items.length > 0 && <div key={type}><p className="text-xs uppercase tracking-wide text-slate-500">{type.replaceAll("_", " ")}</p><div className="mt-2 flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300"><strong className="text-slate-100">{CRITERION_LABELS[item.key] || item.other_key || item.key}</strong>: {criterionValue(item.value)}</span>)}</div></div>)}</div>}
                  </section>

                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                    <h3 className="text-lg font-semibold text-white">Åpne oppgaver</h3>
                    {openTasks.length === 0 ? <p className="mt-3 text-sm text-slate-500">Ingen åpne kundeoppgaver.</p> : <div className="mt-4 space-y-3">{openTasks.slice(0, 20).map((item) => <article key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3"><div className="flex items-start justify-between gap-3"><strong className="text-sm text-slate-200">{item.title}</strong><span className="text-[11px] text-slate-500">{item.priority}</span></div><p className="mt-1 text-xs text-slate-400">{item.next_action || item.description || "Neste handling ikke satt"}</p></article>)}</div>}
                    <Button asChild variant="outline" size="sm" className="mt-4"><Link href="/execution">Åpne Execution</Link></Button>
                  </section>

                  <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 xl:col-span-2">
                    <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-white">Shortlists og presentasjoner</h3><p className="text-sm text-slate-500">Alt som er koblet til kunden i Lead Intelligence.</p></div><Home className="text-cyan-300" /></div>
                    {data.shortlists.length === 0 ? <p className="mt-4 text-sm text-slate-500">Ingen shortlist er lagret.</p> : <div className="mt-4 grid gap-4 lg:grid-cols-2">{data.shortlists.map((shortlist) => <article key={shortlist.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-4"><div className="flex items-start justify-between gap-3"><strong className="text-white">{shortlist.title || "Boligshortlist"}</strong><span className="text-xs text-slate-500">{shortlist.status}</span></div><div className="mt-3 space-y-2">{shortlist.items.slice(0, 10).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-300">{item.rank}. {item.property_title || item.property_reference || "Bolig"}</span><span className="shrink-0 text-slate-500">{item.property_price ? money(item.property_price) : `${item.score || 0}/100`}</span></div>)}</div></article>)}</div>}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{data.presentations.length} presentasjoner</span><span>·</span><span>{data.messageDrafts.length} meldingsutkast</span><Button asChild variant="ghost" size="sm"><Link href="/lead-intelligence">Administrer i Lead Intelligence <ArrowRight size={13} className="ml-1" /></Link></Button></div>
                  </section>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
