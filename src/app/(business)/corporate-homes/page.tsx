"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CircleDollarSign,
  ExternalLink,
  Handshake,
  Loader2,
  RefreshCw,
  Search,
  Target,
  Users,
} from "lucide-react";
import {
  CORPORATE_GOOGLE_SEARCH,
  CORPORATE_HOMES_LANDING_URL,
  CORPORATE_LINKEDIN,
  CORPORATE_META,
  CORPORATE_OUTBOUND,
  CORPORATE_PAID_LAUNCH_PACK,
  CORPORATE_SUCCESS_METRICS,
} from "@/lib/corporate-homes-growth";
import { corporateGrowthCandidateId } from "@/lib/corporate-growth-improvement";

type Contact = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  stage: string;
  pipelineValue: number;
  propertyInterest?: string | null;
  nextFollowup?: string | null;
  lastContact?: string | null;
  updatedAt?: string | null;
  source?: string | null;
};

type Overview = {
  generatedAt: string;
  summary: {
    totalLeads: number;
    activeLeads: number;
    new30d: number;
    dueNow: number;
    openWorkItems: number;
    pipelineValue: number;
  };
  revenueFunnel: {
    documentedOnly: boolean;
    totalProspects: number;
    promotedToCrm: number;
    contacted: number;
    engaged: number;
    meetings: number;
    opportunities: number;
    viewingCompanies: number;
    offerCompanies: number;
    rates: {
      prospectToContacted: number;
      contactedToMeeting: number;
      meetingToOpportunity: number;
      opportunityToViewing: number;
      viewingToOffer: number;
    };
    latestConfirmedOutcomeAt?: string | null;
    revenueEventsReady: boolean;
  };
  growthReview?: {
    status: string;
    at?: string | null;
    comparison?: {
      previousBottleneckStage?: string | null;
      previousRatePct?: number | null;
      rateDeltaPctPoints?: number | null;
      sameBottleneckStreak: number;
      continuousImprovementCandidate: boolean;
      note: string;
    } | null;
    improvement?: {
      id: string;
      candidateId: string;
      status: string;
      ownerEmail?: string | null;
      dueAt?: string | null;
      overdue: boolean;
      closed: boolean;
      closedAt?: string | null;
      rootCauseCategory: string;
      actionType: string;
      updatedAt?: string | null;
      effect?: {
        trend: "NOT_ENOUGH_DATA" | "IMPROVING" | "UNCHANGED" | "WORSENING";
        baselineRatePct?: number | null;
        latestRatePct?: number | null;
        deltaPctPoints?: number | null;
        postSnapshots: number;
        latestSnapshotAt?: string | null;
        evidenceNote: string;
      } | null;
    } | null;
    review?: {
      status: "READY" | "LEARNING" | "DATA_GAP";
      minimumDenominator: number;
      bottleneck?: {
        stage: string;
        label: string;
        numerator: number;
        denominator: number;
        ratePct: number;
        confidence: "LOW" | "MEDIUM" | "HIGH";
      } | null;
      nextFocus: string;
      evidenceNote: string;
      guardrails: {
        readOnly: boolean;
        automaticBudgetChanges: boolean;
        automaticOutreach: boolean;
        inferredOutcomes: boolean;
      };
    } | null;
  } | null;
  acquisition: {
    periodDays: number;
    attributionRule: string;
    channels: Array<{
      key: string;
      label: string;
      leads: number;
      new30d: number;
      active: number;
      qualified: number;
      pipelineValue: number;
      leadToQualifiedRate: number;
      viewingCompanies: number;
      offerCompanies: number;
      leadToViewingRate: number;
      viewingToOfferRate: number;
      topCampaigns: Array<{ campaign: string; leads: number }>;
    }>;
  };
  partners: {
    total: number;
    target: number;
    progressPercent: number;
    aTier: number;
    bTier: number;
    engaged: number;
    personalEnrichmentStarted: boolean;
    automaticOutreach: boolean;
    focusPartners: Array<{
      id: string;
      companyName: string;
      organizationNumber?: string | null;
      domain?: string | null;
      partnerType: string;
      city?: string | null;
      industry?: string | null;
      employeeCount?: number | null;
      status: string;
      fitTier: string;
      fitScore: number;
      fitReasons: string[];
      evidenceGaps: string[];
      referralAngle?: string | null;
      sourceUrl?: string | null;
      nextAction?: string | null;
    }>;
    lastDiscovery?: {
      status?: string | null;
      details?: Record<string, any> | null;
      created_at?: string | null;
    } | null;
  };
  genericContacts: {
    researched: number;
    genericEmails: number;
    contactPages: number;
    dailyBatch: number;
    companyLevelOnly: boolean;
    personalDataCollected: boolean;
    automaticOutreach: boolean;
    lastRun?: {
      status?: string | null;
      details?: Record<string, any> | null;
      created_at?: string | null;
    } | null;
  };
  prospects: {
    total: number;
    target: number;
    progressPercent: number;
    aTier: number;
    bTier: number;
    qualified: number;
    promoted: number;
    signalsResearched: number;
    signalBacked: number;
    signalBackedATier: number;
    lastSignalResearch?: {
      status?: string | null;
      details?: Record<string, any> | null;
      created_at?: string | null;
    } | null;
    focusRule: string;
    focusProspects: Array<{
      id: string;
      companyName: string;
      organizationNumber?: string | null;
      domain?: string | null;
      industry?: string | null;
      size: string;
      status: string;
      fitTier: string;
      fitScore: number;
      fitReasons: string[];
      evidenceGaps: string[];
      nextAction?: string | null;
      sourceUrl?: string | null;
      readiness: {
        score: number;
        label: string;
        qualificationReady: boolean;
        manualContactReady: boolean;
        suggestedStage: string;
        genericCompanyChannel: {
          email?: string | null;
          contactPageUrl?: string | null;
        };
        reasons: string[];
        missing: string[];
      };
    }>;
    statusCounts: Record<string, number>;
    tierCounts: Record<string, number>;
    discovery: {
      enabled: boolean | null;
      riskLevel?: string | null;
      config?: Record<string, any> | null;
      lastRun?: {
        status?: string | null;
        details?: Record<string, any> | null;
        created_at?: string | null;
      } | null;
    };
  };
  contentEngine: {
    cadence: string;
    draftsPerWeek: number;
    platforms: string[];
    externalPublishing: boolean;
    nextTopics: Array<{
      slug: string;
      title: string;
      hook: string;
      teaser: string;
      url: string;
    }>;
    lastRun?: {
      status?: string | null;
      details?: Record<string, any> | null;
      created_at?: string | null;
    } | null;
  };
  stages: Record<string, number>;
  contacts: Contact[];
  workItems: Array<Record<string, unknown>>;
};

const stageLabel: Record<string, string> = {
  NEW: "Ny",
  CONTACT: "Kontakt",
  QUALIFIED: "Kvalifisert",
  MATCHING: "Boligmatching",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  RESERVED: "Reservert",
  WON: "Gjennomført",
  ON_HOLD: "På vent",
  LOST: "Tapt",
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value || 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ikke satt";
  return date.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CorporateHomesGrowthPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [contentBusy, setContentBusy] = useState(false);
  const [contentNotice, setContentNotice] = useState("");
  const [partnerBusy, setPartnerBusy] = useState(false);
  const [partnerNotice, setPartnerNotice] = useState("");
  const [signalBusy, setSignalBusy] = useState(false);
  const [signalNotice, setSignalNotice] = useState("");
  const [genericContactBusy, setGenericContactBusy] = useState(false);
  const [genericContactNotice, setGenericContactNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/overview", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente Corporate Homes-data.");
      setData(body?.corporateHomes || null);
      setWarnings(body?.warnings || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente Corporate Homes-data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.contacts || [];
    return (data?.contacts || []).filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.stage, contact.propertyInterest]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [data?.contacts, query]);

  async function runPartnerDiscovery() {
    setPartnerBusy(true);
    setPartnerNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/partners/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke kjøre partnerdiscovery.");
      const result = body?.result || {};
      setPartnerNotice(result?.reason === "target_reached"
        ? "Partnermålet på 100 virksomheter er nådd."
        : `${Number(result?.created || 0)} nye partnerbedrifter lagt til.`);
      await load();
    } catch (partnerError) {
      setError(partnerError instanceof Error ? partnerError.message : "Kunne ikke kjøre partnerdiscovery.");
    } finally {
      setPartnerBusy(false);
    }
  }

  async function runCompanySignalResearch() {
    setSignalBusy(true);
    setSignalNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/signals/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke kjøre selskaps-signalresearch.");
      const result = body?.result || {};
      setSignalNotice(
        `${Number(result?.researched || 0)} selskaper undersøkt · ${Number(result?.signals_found || 0)} signaler funnet · ${Number(result?.changed_to_a_fit || 0)} nye A-fit.`
      );
      await load();
    } catch (signalError) {
      setError(signalError instanceof Error ? signalError.message : "Kunne ikke kjøre selskaps-signalresearch.");
    } finally {
      setSignalBusy(false);
    }
  }

  async function runGenericContactResearch() {
    setGenericContactBusy(true);
    setGenericContactNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/generic-contacts/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke kjøre selskapskontakt-research.");
      const result = body?.result || {};
      setGenericContactNotice(
        Number(result?.researched || 0) +
        " selskaper undersøkt · " +
        Number(result?.generic_emails_found || 0) +
        " generelle adresser · " +
        Number(result?.contact_pages_found || 0) +
        " kontaktsider."
      );
      await load();
    } catch (contactError) {
      setError(contactError instanceof Error ? contactError.message : "Kunne ikke kjøre selskapskontakt-research.");
    } finally {
      setGenericContactBusy(false);
    }
  }

  async function createCorporateContentDrafts() {
    setContentBusy(true);
    setContentNotice("");
    setError("");
    try {
      const response = await fetch("/api/corporate-homes/content/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lage Corporate Homes-utkast.");
      const created = Number(body?.result?.created || 0);
      const skipped = Number(body?.result?.skipped || 0);
      setContentNotice(created
        ? `${created} nye Corporate Homes-utkast er lagt i Content Hub.`
        : skipped
          ? "Ukens Corporate Homes-utkast finnes allerede i Content Hub."
          : "Ingen nye utkast ble opprettet.");
      await load();
    } catch (contentError) {
      setError(contentError instanceof Error ? contentError.message : "Kunne ikke lage Corporate Homes-utkast.");
    } finally {
      setContentBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1650px] space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-[0.13em] text-teal-800">
              <BriefcaseBusiness size={18} /> Zen Corporate Homes
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">B2B Growth & Pipeline</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Ett arbeidsområde for bedrifter, foreninger og medlemsorganisasjoner som vurderer bolig i Spania.
              Leads fra Corporate Homes-siden merkes som høyprioritert B2B og beholdes i den ordinære Zen Eco Homes-pipelinen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/corporate-homes/prospects"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"
            >
              Prospektmotor <Target size={15} />
            </Link>
            <a
              href={CORPORATE_HOMES_LANDING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              Åpne landingssiden <ExternalLink size={15} />
            </a>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Oppdater
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
      {warnings.map((warning) => (
        <div key={warning} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{warning}</div>
      ))}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={<Users size={18} />} label="Corporate leads" value={data?.summary.totalLeads ?? "—"} />
        <Metric icon={<Target size={18} />} label="Aktive" value={data?.summary.activeLeads ?? "—"} />
        <Metric icon={<CalendarClock size={18} />} label="Nye 30 dager" value={data?.summary.new30d ?? "—"} />
        <Metric icon={<RefreshCw size={18} />} label="Må følges opp" value={data?.summary.dueNow ?? "—"} />
        <Metric icon={<BriefcaseBusiness size={18} />} label="Åpne oppgaver" value={data?.summary.openWorkItems ?? "—"} />
        <Metric icon={<CircleDollarSign size={18} />} label="Aktiv pipeline" value={data ? money(data.summary.pipelineValue) : "—"} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Marketing → Revenue</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">Dokumentert Corporate-funnel helt til visning og tilbud</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              De siste stegene teller bare kanoniske Revenue OS-events som et menneske har bekreftet faktisk har skjedd.
              CRM-status alene brukes ikke som bevis på fullført visning eller gitt tilbud.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">Dokumenterte utfall</span>
            <span className={`rounded-full px-3 py-1.5 ${data?.revenueFunnel.revenueEventsReady ? "bg-cyan-50 text-cyan-800" : "bg-amber-50 text-amber-800"}`}>
              Revenue Events {data?.revenueFunnel.revenueEventsReady ? "klar" : "ikke tilgjengelig"}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            ["Prospekter", data?.revenueFunnel.totalProspects ?? "—"],
            ["I CRM", data?.revenueFunnel.promotedToCrm ?? "—"],
            ["Kontaktet", data?.revenueFunnel.contacted ?? "—"],
            ["Svar / engaged", data?.revenueFunnel.engaged ?? "—"],
            ["Møte", data?.revenueFunnel.meetings ?? "—"],
            ["Opportunity", data?.revenueFunnel.opportunities ?? "—"],
            ["Faktisk visning", data?.revenueFunnel.viewingCompanies ?? "—"],
            ["Faktisk tilbud", data?.revenueFunnel.offerCompanies ?? "—"],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Prospekt → kontakt", data?.revenueFunnel.rates.prospectToContacted ?? 0],
            ["Kontakt → møte", data?.revenueFunnel.rates.contactedToMeeting ?? 0],
            ["Møte → opportunity", data?.revenueFunnel.rates.meetingToOpportunity ?? 0],
            ["Opportunity → visning", data?.revenueFunnel.rates.opportunityToViewing ?? 0],
            ["Visning → tilbud", data?.revenueFunnel.rates.viewingToOffer ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-600">{label}</div>
              <div className="mt-1 text-lg font-black text-teal-900">{value}%</div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          {data?.revenueFunnel.latestConfirmedOutcomeAt
            ? `Siste bekreftede kommersielle outcome: ${new Date(data.revenueFunnel.latestConfirmedOutcomeAt).toLocaleString("nb-NO")}.`
            : "Ingen bekreftet Corporate-visning eller Corporate-tilbud er registrert ennå."}
          {" "}Tallene er observasjoner, ikke prognoser.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Ukentlig Growth Review</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">Hvor lekker Corporate-funnelen nå?</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Mandagsreviewen bruker bare dokumenterte Corporate-statusdata og bekreftede Revenue OS-utfall.
              Den peker på målt flaskehals og neste analysefokus, men endrer aldri annonsebudsjett eller kontakter kunder automatisk.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">Mandag 07:30 UTC</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">Read-only</span>
          </div>
        </div>

        {data?.growthReview?.review ? (
          <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.6fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Målt flaskehals</div>
              {data.growthReview.review.bottleneck ? (
                <>
                  <div className="mt-2 text-lg font-black text-slate-950">{data.growthReview.review.bottleneck.label}</div>
                  <div className="mt-1 text-3xl font-black text-teal-900">{data.growthReview.review.bottleneck.ratePct}%</div>
                  <div className="mt-2 text-xs text-slate-600">
                    {data.growthReview.review.bottleneck.numerator} av {data.growthReview.review.bottleneck.denominator} ·
                    {" "}evidens {data.growthReview.review.bottleneck.confidence.toLowerCase()}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm font-bold text-slate-700">
                  {data.growthReview.review.status === "DATA_GAP"
                    ? "Revenue OS-data mangler."
                    : "For lite datagrunnlag til å velge flaskehals."}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Neste analysefokus</div>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-900">{data.growthReview.review.nextFocus}</p>
              <p className="mt-3 text-xs leading-5 text-slate-500">{data.growthReview.review.evidenceNote}</p>
              <div className="mt-3 text-xs font-semibold text-emerald-800">
                Ingen automatisk spend-endring · ingen automatisk outreach · ingen antatte kommersielle utfall
              </div>
            </div>
          </div>

          {data.growthReview.comparison && (
            <div className={`mt-4 rounded-2xl border p-4 ${
              data.growthReview.comparison.continuousImprovementCandidate
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-slate-50"
            }`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">Uketrend</div>
                  <div className="mt-1 text-sm font-black text-slate-950">
                    Samme flaskehals i {data.growthReview.comparison.sameBottleneckStreak} ukentlige snapshot
                    {data.growthReview.comparison.sameBottleneckStreak === 1 ? "" : "s"} på rad
                  </div>
                  {data.growthReview.comparison.rateDeltaPctPoints !== null &&
                    data.growthReview.comparison.rateDeltaPctPoints !== undefined && (
                      <p className="mt-1 text-sm text-slate-700">
                        Endring siden forrige snapshot:{" "}
                        <span className="font-black">
                          {data.growthReview.comparison.rateDeltaPctPoints > 0 ? "+" : ""}
                          {data.growthReview.comparison.rateDeltaPctPoints} prosentpoeng
                        </span>
                      </p>
                    )}
                  <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-600">{data.growthReview.comparison.note}</p>

                  {data.growthReview.improvement && (
                    <div className={`mt-3 grid gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2 xl:grid-cols-4 ${
                      data.growthReview.improvement.overdue
                        ? "border-rose-300 bg-rose-50"
                        : data.growthReview.improvement.closed
                          ? "border-slate-300 bg-slate-100"
                          : "border-emerald-300 bg-emerald-50"
                    }`}>
                      <div>
                        <div className="font-black uppercase tracking-wide text-slate-500">Tiltaksstatus</div>
                        <div className="mt-1 font-black text-slate-950">
                          {data.growthReview.improvement.status.replaceAll("_", " ")}
                          {data.growthReview.improvement.closed ? " · lukket" : ""}
                        </div>
                      </div>
                      <div>
                        <div className="font-black uppercase tracking-wide text-slate-500">Ansvarlig</div>
                        <div className="mt-1 font-bold text-slate-900">
                          {data.growthReview.improvement.ownerEmail || "Ikke satt"}
                        </div>
                      </div>
                      <div>
                        <div className="font-black uppercase tracking-wide text-slate-500">Frist</div>
                        <div className="mt-1 font-bold text-slate-900">
                          {data.growthReview.improvement.dueAt || "Ikke satt"}
                          {data.growthReview.improvement.overdue ? " · forfalt" : ""}
                        </div>
                      </div>
                      <div>
                        <div className="font-black uppercase tracking-wide text-slate-500">Tiltak / rotårsak</div>
                        <div className="mt-1 font-bold text-slate-900">
                          {data.growthReview.improvement.actionType !== "UNSET"
                            ? data.growthReview.improvement.actionType.replaceAll("_", " ")
                            : data.growthReview.improvement.rootCauseCategory !== "UNKNOWN"
                              ? data.growthReview.improvement.rootCauseCategory.replaceAll("_", " ")
                              : "Ikke dokumentert ennå"}
                        </div>
                      </div>
                    </div>
                  )}

                    {data.growthReview.improvement.effect && (
                      <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-wide text-cyan-800">Corporate effekt siden tiltak</div>
                            <div className="mt-1 text-sm font-black text-slate-950">
                              {data.growthReview.improvement.effect.trend.replaceAll("_", " ")}
                            </div>
                          </div>
                          <div className="text-xs font-bold text-slate-700">
                            {data.growthReview.improvement.effect.baselineRatePct !== null &&
                            data.growthReview.improvement.effect.baselineRatePct !== undefined
                              ? `Baseline ${data.growthReview.improvement.effect.baselineRatePct}%`
                              : "Baseline mangler"}
                            {" · "}
                            {data.growthReview.improvement.effect.latestRatePct !== null &&
                            data.growthReview.improvement.effect.latestRatePct !== undefined
                              ? `Siste ${data.growthReview.improvement.effect.latestRatePct}%`
                              : "Siste rate mangler"}
                            {data.growthReview.improvement.effect.deltaPctPoints !== null &&
                            data.growthReview.improvement.effect.deltaPctPoints !== undefined && (
                              <>
                                {" · "}
                                {data.growthReview.improvement.effect.deltaPctPoints > 0 ? "+" : ""}
                                {data.growthReview.improvement.effect.deltaPctPoints} pp
                              </>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600">
                          {data.growthReview.improvement.effect.evidenceNote}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-cyan-900">
                          {data.growthReview.improvement.effect.postSnapshots} kvalifiserte snapshot etter tiltaket
                        </p>
                      </div>
                    )}
                </div>
                {data.growthReview.comparison.continuousImprovementCandidate && (
                  <Link
                    href={`/continuous-improvement?candidate=${encodeURIComponent(
                      corporateGrowthCandidateId(data.growthReview.review?.bottleneck?.stage || "unknown"),
                    )}`}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white ${
                      data.growthReview.improvement
                        ? "bg-emerald-800 hover:bg-emerald-700"
                        : "bg-amber-900 hover:bg-amber-800"
                    }`}
                  >
                    {data.growthReview.improvement ? "Åpne forbedringstiltak" : "Vurder i Kontinuerlig forbedring"}
                    <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            Første ukentlige Corporate Growth Review er ikke lagret ennå. Reviewen opprettes automatisk når cron-jobben kjører.
          </div>
        )}

        {data?.growthReview?.at && (
          <p className="mt-4 text-xs text-slate-500">
            Sist lagret: {new Date(data.growthReview.at).toLocaleString("nb-NO")}.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Kanalresultater</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Mål Corporate-kanalene helt til faktisk visning og tilbud</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Google, LinkedIn, Meta, outbound og organisk/direct sammenlignes på faktiske Corporate-leads,
            kvalifisering, pipelineverdi og dokumenterte kommersielle utfall. Visning og tilbud kommer kun fra bekreftede Revenue OS-events.
            Dette er styringsgrunnlaget før annonsebudsjett skaleres; RealtyFlow endrer ikke spend automatisk.
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-500">{data?.acquisition.attributionRule || ""}</p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Kanal</th>
                <th className="px-3 py-3">Leads</th>
                <th className="px-3 py-3">Nye 30d</th>
                <th className="px-3 py-3">Aktive</th>
                <th className="px-3 py-3">Kvalifisert+</th>
                <th className="px-3 py-3">Lead → kval.</th>
                <th className="px-3 py-3">Faktisk visning</th>
                <th className="px-3 py-3">Faktisk tilbud</th>
                <th className="px-3 py-3">Lead → visning</th>
                <th className="px-3 py-3">Aktiv pipeline</th>
                <th className="px-3 py-3">Kampanjer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.acquisition.channels || []).map((channel) => (
                <tr key={channel.key} className="hover:bg-slate-50">
                  <td className="px-3 py-4 font-black text-slate-950">{channel.label}</td>
                  <td className="px-3 py-4 font-bold text-slate-800">{channel.leads}</td>
                  <td className="px-3 py-4 text-slate-700">{channel.new30d}</td>
                  <td className="px-3 py-4 text-slate-700">{channel.active}</td>
                  <td className="px-3 py-4 text-slate-700">{channel.qualified}</td>
                  <td className="px-3 py-4">
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-black text-teal-900">
                      {channel.leadToQualifiedRate}%
                    </span>
                  </td>
                  <td className="px-3 py-4 font-bold text-slate-800">{channel.viewingCompanies}</td>
                  <td className="px-3 py-4 font-bold text-slate-800">{channel.offerCompanies}</td>
                  <td className="px-3 py-4">
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-900">
                      {channel.leadToViewingRate}%
                    </span>
                  </td>
                  <td className="px-3 py-4 font-bold text-slate-800">{money(channel.pipelineValue)}</td>
                  <td className="max-w-[280px] px-3 py-4 text-xs text-slate-500">
                    {channel.topCampaigns.length
                      ? channel.topCampaigns.map((item) => `${item.campaign} (${item.leads})`).join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
              {!loading && (data?.acquisition.channels || []).length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-500">Ingen attribuerte Corporate-leads ennå.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Prospektmotor</p>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${data?.prospects.discovery.enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                Discovery {data?.prospects.discovery.enabled ? "på" : "av"}
              </span>
            </div>
            <div className="mt-2 flex items-end gap-3">
              <h2 className="text-2xl font-black text-slate-950">
                {data?.prospects.total ?? "—"} / {data?.prospects.target ?? 250}
              </h2>
              <span className="pb-0.5 text-sm font-semibold text-slate-500">norske selskapsprospekter</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${data?.prospects.progressPercent || 0}%` }} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MiniStat label="A-fit" value={data?.prospects.aTier ?? "—"} />
              <MiniStat label="B-fit" value={data?.prospects.bTier ?? "—"} />
              <MiniStat label="Signalresearch" value={data?.prospects.signalsResearched ?? "—"} />
              <MiniStat label="Med signal" value={data?.prospects.signalBacked ?? "—"} />
              <MiniStat label="Kvalifisert" value={data?.prospects.qualified ?? "—"} />
              <MiniStat label="Promotert til CRM" value={data?.prospects.promoted ?? "—"} />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {data?.prospects.discovery.lastRun?.created_at
                ? `Siste discovery: ${new Date(data.prospects.discovery.lastRun.created_at).toLocaleString("nb-NO")} · ${data.prospects.discovery.lastRun.details?.imported ?? 0} importert`
                : "Ingen discovery-kjøring registrert ennå."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void runCompanySignalResearch()}
              disabled={signalBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-800 px-4 py-3 text-sm font-black text-teal-900 hover:bg-teal-50 disabled:opacity-50"
            >
              {signalBusy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Undersøk selskaps-signaler
            </button>
            <Link
              href="/corporate-homes/prospects"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white hover:bg-teal-700"
            >
              Åpne prospektmotor <ArrowRight size={15} />
            </Link>
          </div>
        </div>
        {signalNotice && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{signalNotice}</div>
        )}
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Signalresearch leser maks fire offentlige sider per selskap og lagrer kun bedriftsnivå-signaler og kilde-URL.
          Ingen personnavn, e-post eller telefon samles inn.
          {data?.prospects.lastSignalResearch?.created_at
            ? ` Siste kjøring: ${new Date(data.prospects.lastSignalResearch.created_at).toLocaleString("nb-NO")}.`
            : ""}
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              <Handshake size={16} /> Partnerkanal
            </div>
            <div className="mt-2 flex items-end gap-3">
              <h2 className="text-2xl font-black text-slate-950">
                {data?.partners.total ?? "—"} / {data?.partners.target ?? 100}
              </h2>
              <span className="pb-0.5 text-sm font-semibold text-slate-500">mulige henvisningspartnere</span>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Regnskap, juss, bedriftsrådgivning, HR/rekruttering, medlemsorganisasjoner og relaterte rådgivermiljøer.
              Discovery bruker kun offentlig virksomhetsdata. Ingen personer hentes inn og ingen kontakt sendes automatisk.
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${data?.partners.progressPercent || 0}%` }} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniStat label="A-fit" value={data?.partners.aTier ?? "—"} />
              <MiniStat label="B-fit" value={data?.partners.bTier ?? "—"} />
              <MiniStat label="Engasjert / partner" value={data?.partners.engaged ?? "—"} />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              {data?.partners.lastDiscovery?.created_at
                ? `Siste partnerdiscovery: ${new Date(data.partners.lastDiscovery.created_at).toLocaleString("nb-NO")} · ${data.partners.lastDiscovery.details?.created ?? 0} nye`
                : "Ingen partnerdiscovery registrert ennå."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/corporate-homes/partners"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              Åpne partnerkø <ArrowRight size={15} />
            </Link>
            <button
              onClick={() => void runPartnerDiscovery()}
              disabled={partnerBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
            >
              {partnerBusy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Finn flere partnerbedrifter
            </button>
          </div>
        </div>

        {partnerNotice && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{partnerNotice}</div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(data?.partners.focusPartners || []).slice(0, 8).map((partner) => (
            <article key={partner.id} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black text-slate-950">{partner.companyName}</div>
                  <div className="mt-1 text-xs text-slate-500">{partner.industry || partner.partnerType}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${partner.fitTier === "A" ? "bg-emerald-100 text-emerald-900" : "bg-cyan-100 text-cyan-900"}`}>
                  {partner.fitTier} · {partner.fitScore}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">{partner.referralAngle || "Henvisningsvinkel må vurderes."}</p>
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {partner.fitReasons.slice(0, 2).map((reason) => <div key={reason}>✓ {reason}</div>)}
              </div>
              <div className="mt-auto flex flex-wrap gap-3 pt-4">
                {partner.domain && (
                  <a href={partner.domain} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
                    Nettside <ExternalLink size={12} />
                  </a>
                )}
                {partner.sourceUrl && (
                  <a href={partner.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-slate-600 hover:underline">
                    Kilde <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
          Neste personsteg er bevisst sperret: identifisering eller berikelse av konkrete kontaktpersoner krever eksplisitt godkjenning.
        </div>
      </section>

      <section className="rounded-3xl border border-cyan-200 bg-cyan-50/50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-900">Selskapskontakt · uten personberikelse</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">Offisielle kontaktkanaler på selskapsnivå</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              RealtyFlow kan finne generelle bedriftsadresser og offisielle kontaktsider fra selskapenes egne nettsteder.
              Personlige adresser filtreres bort, og denne motoren sender aldri noe automatisk.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <MiniStat label="Undersøkt" value={data?.genericContacts.researched ?? "—"} />
              <MiniStat label="Generell adresse" value={data?.genericContacts.genericEmails ?? "—"} />
              <MiniStat label="Kontaktside" value={data?.genericContacts.contactPages ?? "—"} />
              <MiniStat label="Maks per dag" value={data?.genericContacts.dailyBatch ?? 10} />
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Kun selskapsnivå · ingen personnavn · ingen personlige adresser · ingen telefon · ingen utsendelse.
              {data?.genericContacts.lastRun?.created_at
                ? " Siste kjøring: " + new Date(data.genericContacts.lastRun.created_at).toLocaleString("nb-NO") + "."
                : ""}
            </p>
          </div>
          <button
            onClick={() => void runGenericContactResearch()}
            disabled={genericContactBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {genericContactBusy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Oppdater selskapskontakt
          </button>
        </div>
        {genericContactNotice && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{genericContactNotice}</div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Fokus nå</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">Prospekter som er nærmest menneskelig kvalifisering</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Dette er ikke en automatisk salgsbeslutning. Listen sorteres etter dokumentert readiness og Corporate Homes-fit,
              og viser neste konto å undersøke — ikke hvem systemet skal kontakte automatisk.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{data?.prospects.focusRule || ""}</p>
          </div>
          <Link href="/corporate-homes/prospects" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">
            Se hele køen <ArrowRight size={15} />
          </Link>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
          {(data?.prospects.focusProspects || []).map((prospect) => (
            <article key={prospect.id} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/corporate-homes/prospects/${encodeURIComponent(prospect.id)}`} className="font-black text-slate-950 hover:text-cyan-800 hover:underline">
                    {prospect.companyName}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">{prospect.industry || "Bransje ikke kartlagt"} · {prospect.size}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${prospect.fitTier === "A" ? "bg-emerald-100 text-emerald-900" : "bg-cyan-100 text-cyan-900"}`}>
                  {prospect.fitTier} · {prospect.fitScore}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-black ${prospect.readiness.manualContactReady ? "bg-emerald-100 text-emerald-900" : prospect.readiness.qualificationReady ? "bg-cyan-100 text-cyan-900" : "bg-white text-slate-700"}`}>
                  Klarhet {prospect.readiness.score}/100
                </span>
                {prospect.readiness.manualContactReady && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-black text-emerald-900">Manuell kontakt klar</span>
                )}
                <span className="font-semibold text-slate-500">{prospect.status}</span>
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-600">{prospect.readiness.label}</div>
              {prospect.readiness.genericCompanyChannel?.email && (
                <div className="mt-1 text-xs font-semibold text-cyan-800">{prospect.readiness.genericCompanyChannel.email}</div>
              )}
              <div className="mt-3 space-y-1 text-xs leading-5 text-slate-600">
                {prospect.fitReasons.slice(0, 2).map((reason) => <div key={reason}>✓ {reason}</div>)}
                {prospect.evidenceGaps.slice(0, 1).map((gap) => <div key={gap} className="text-amber-800">Mangler: {gap}</div>)}
              </div>
              <div className="mt-auto pt-4">
                <Link href={`/corporate-homes/prospects/${encodeURIComponent(prospect.id)}`} className="inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
                  Åpne dossier <ArrowRight size={13} />
                </Link>
              </div>
            </article>
          ))}
          {!loading && (data?.prospects.focusProspects || []).length === 0 && (
            <div className="text-sm text-slate-500">Ingen A/B-prospekter er klare for fokuslisten ennå.</div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Corporate Content Engine</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">Tre norske B2B-poster per uke</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              RealtyFlow roterer gjennom de 23 Corporate-guidene og lager ferdige norske utkast med artikkellenke og bedriftsvurdering som CTA.
              Utkastene legges i Content Hub for LinkedIn og Facebook. Ingenting publiseres eksternt av denne motoren.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              <span className="rounded-full bg-slate-100 px-2.5 py-1">{data?.contentEngine.cadence || "Mandag 06:40 UTC"}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1">{data?.contentEngine.draftsPerWeek ?? 3} utkast / uke</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1">LinkedIn + Facebook</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Draft-first</span>
            </div>
          </div>
          <button
            onClick={() => void createCorporateContentDrafts()}
            disabled={contentBusy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {contentBusy ? <Loader2 size={16} className="animate-spin" /> : <BriefcaseBusiness size={16} />}
            Lag ukens 3 utkast
          </button>
        </div>

        {contentNotice && <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{contentNotice}</div>}

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {(data?.contentEngine.nextTopics || []).map((topic, index) => (
            <article key={topic.slug} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-amber-700">Post {index + 1}</div>
              <h3 className="mt-2 font-black text-slate-950">{topic.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{topic.hook}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{topic.teaser}</p>
              <a href={topic.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
                Åpne artikkel <ExternalLink size={13} />
              </a>
            </article>
          ))}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          {data?.contentEngine.lastRun?.created_at
            ? `Siste draft-kjøring: ${new Date(data.contentEngine.lastRun.created_at).toLocaleString("nb-NO")} · ${data.contentEngine.lastRun.details?.created ?? 0} opprettet`
            : "Ingen Corporate Content Engine-kjøring registrert ennå."}
        </p>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">Corporate pipeline</h2>
              <p className="mt-1 text-sm text-slate-500">Samme CRM-kontakter, men filtrert til Corporate Homes.</p>
            </div>
            <label className="relative block min-w-[250px]">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Søk navn, e-post, fase ..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900"
              />
            </label>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(data?.stages || {}).map(([stage, count]) => (
              <span key={stage} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                {stageLabel[stage] || stage}: {count}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Kontakt</th>
                  <th className="px-3 py-3">Fase</th>
                  <th className="px-3 py-3">Pipeline</th>
                  <th className="px-3 py-3">Neste oppfølging</th>
                  <th className="px-3 py-3">Interesse</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-50">
                    <td className="px-3 py-4">
                      <div className="font-bold text-slate-900">{contact.name || "Ukjent"}</div>
                      <div className="text-xs text-slate-500">{contact.email || "Ingen e-post"}</div>
                    </td>
                    <td className="px-3 py-4">
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                        {stageLabel[contact.stage] || contact.stage}
                      </span>
                    </td>
                    <td className="px-3 py-4 font-bold text-slate-800">{money(contact.pipelineValue)}</td>
                    <td className="px-3 py-4 text-slate-600">{dateLabel(contact.nextFollowup)}</td>
                    <td className="max-w-[260px] px-3 py-4 text-slate-600">{contact.propertyInterest || "Corporate Homes"}</td>
                    <td className="px-3 py-4 text-right">
                      <Link href={`/customers?contactId=${encodeURIComponent(contact.id)}&tab=all`} className="inline-flex items-center gap-1 font-bold text-cyan-800 hover:underline">
                        Customer 360 <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && visibleContacts.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">Ingen Corporate Homes-leads ennå.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">Sales motion</p>
          <h2 className="mt-2 text-2xl font-black">Kvalifiser før boligmatch</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Corporate leads skal ikke behandles som en vanlig privat kjøper. Første mål er å forstå beslutningsprosessen og bygge et styre-/ledelsesklart case.
          </p>
          <ol className="mt-6 space-y-4 text-sm">
            {CORPORATE_OUTBOUND.qualificationQuestions.map((question, index) => (
              <li key={question} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-300 font-black text-slate-950">{index + 1}</span>
                <span className="pt-1 text-slate-200">{question}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <CampaignCard
          title={CORPORATE_GOOGLE_SEARCH.name}
          eyebrow="Google Search · klargjort"
          objective={CORPORATE_GOOGLE_SEARCH.objective}
          bullets={[
            `Marked: ${CORPORATE_GOOGLE_SEARCH.market}`,
            `${CORPORATE_GOOGLE_SEARCH.keywords.length} high-intent søkeord`,
            `${CORPORATE_GOOGLE_SEARCH.adGroups.length} annonsegrupper`,
            `Landing: /bedriftshytte-spania`,
          ]}
        >
          <div className="mt-4 flex flex-wrap gap-2">
            {CORPORATE_GOOGLE_SEARCH.keywords.map((keyword) => (
              <span key={keyword} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{keyword}</span>
            ))}
          </div>
        </CampaignCard>

        <CampaignCard
          title={CORPORATE_LINKEDIN.name}
          eyebrow="LinkedIn · klargjort"
          objective={CORPORATE_LINKEDIN.objective}
          bullets={[
            `Marked: ${CORPORATE_LINKEDIN.market}`,
            `Company size: ${CORPORATE_LINKEDIN.companySizes.join(", ")}`,
            `${CORPORATE_LINKEDIN.roles.length} beslutningstaker-roller`,
            `${CORPORATE_LINKEDIN.creativeAngles.length} kreative vinkler`,
          ]}
        >
          <div className="mt-4 space-y-3">
            {CORPORATE_LINKEDIN.creativeAngles.map((angle) => (
              <div key={angle.headline} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-bold text-slate-900">{angle.headline}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{angle.body}</p>
              </div>
            ))}
          </div>
        </CampaignCard>

        <CampaignCard
          title={CORPORATE_META.name}
          eyebrow="Meta · klargjort"
          objective={CORPORATE_META.objective}
          bullets={[
            `Marked: ${CORPORATE_META.market}`,
            `${CORPORATE_META.audiences.length} B2B-målgrupper`,
            `${CORPORATE_META.creatives.length} norske kreative vinkler`,
            "Landing: /bedriftshytte-spania",
          ]}
        >
          <div className="mt-4 space-y-3">
            {CORPORATE_META.creatives.map((angle) => (
              <div key={angle.headline} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-bold text-slate-900">{angle.headline}</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{angle.body}</p>
              </div>
            ))}
          </div>
        </CampaignCard>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">Paid launch pack</p>
            <h2 className="mt-2 text-xl font-black">Klar for kontrollert pilot — ikke automatisk annonsering</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              Hver kanal har sin egen sporbare landingslenke. Start én kanal av gangen eller med et lite pilotbudsjett,
              og bruk kanalresultatene over til å avgjøre hva som fortjener mer investering.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-emerald-200">{CORPORATE_PAID_LAUNCH_PACK.status}</span>
            <span className="rounded-full bg-rose-400/15 px-3 py-1.5 text-rose-200">Ingen automatisk spend</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {Object.values(CORPORATE_PAID_LAUNCH_PACK.channels).map((channel) => (
            <article key={channel.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="font-black text-white">{channel.label}</div>
              <div className="mt-1 text-xs text-slate-400">{channel.objective}</div>
              <a
                href={channel.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-xs font-black text-amber-300 hover:underline"
              >
                Test sporingslenke <ExternalLink size={13} />
              </a>
              <div className="mt-3 break-all rounded-xl bg-black/20 p-3 text-[11px] leading-5 text-slate-400">
                {channel.trackingUrl}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Før pilot</div>
          <ol className="mt-3 grid gap-2 lg:grid-cols-5">
            {CORPORATE_PAID_LAUNCH_PACK.launchChecklist.map((item, index) => (
              <li key={item} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">
                <span className="mr-2 font-black text-amber-300">0{index + 1}</span>{item}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Outbound</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">{CORPORATE_OUTBOUND.weeklyTarget} nye prospekter per uke</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Start smalt og personlig. Målet er ikke masseutsendelse, men kvalifiserte samtaler.</p>
          <div className="mt-5 space-y-2">
            {CORPORATE_OUTBOUND.initialSegments.map((segment) => (
              <div key={segment} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{segment}</div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Hva vi måler</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Optimaliser mot salgssignaler — ikke klikk</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CORPORATE_SUCCESS_METRICS.map((metric, index) => (
              <div key={metric} className="rounded-2xl border border-slate-200 p-4">
                <span className="text-xs font-black text-amber-700">0{index + 1}</span>
                <div className="mt-1 font-bold text-slate-900">{metric}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/ad-campaigns/new" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
              Åpne Ad Campaigns <ArrowRight size={15} />
            </Link>
            <Link href="/attribution" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-800">
              Attribution
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Kampanjene er klargjort som strategi og copy. Dette dashboardet kjøper ikke annonser eller flytter annonsebudsjett automatisk.
          </p>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-3 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function CampaignCard({
  title,
  eyebrow,
  objective,
  bullets,
  children,
}: {
  title: string;
  eyebrow: string;
  objective: string;
  bullets: string[];
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">{eyebrow}</p>
      <div className="mt-2 flex items-start gap-3">
        <Building2 size={22} className="mt-1 text-amber-700" />
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">Mål: {objective}</p>
        </div>
      </div>
      <ul className="mt-5 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        {bullets.map((item) => <li key={item} className="rounded-xl bg-slate-50 px-3 py-2.5 font-semibold">{item}</li>)}
      </ul>
      {children}
    </article>
  );
}
