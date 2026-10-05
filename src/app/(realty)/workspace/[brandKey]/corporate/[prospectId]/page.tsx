"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  TrendingUp,
  Target,
  UserRound,
  Users,
} from "lucide-react";

type Contact = {
  id: string;
  name: string;
  title?: string | null;
  buying_role?: string | null;
  seniority?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  source_url?: string | null;
  confidence?: string | null;
  status: string;
  is_primary: boolean;
  relationship_status: string;
  influence_level: string;
  professional_relevance?: string | null;
  professional_topics?: string[];
  linkedin_following: boolean;
  linkedin_last_touched_at?: string | null;
};

type Touchpoint = {
  id: string;
  contact_id?: string | null;
  channel: string;
  activity_type: string;
  status: string;
  direction: string;
  owner_email?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  summary?: string | null;
};

type ProfileField = {
  value: string;
  label?: string;
  sources: string[];
  verified: boolean;
  main?: boolean;
};

type PublicRole = {
  name: string;
  title: string;
  sources: string[];
  verified: boolean;
  sourceUrl?: string | null;
};

type CompanyProfile = {
  legalName?: string | null;
  organizationNumber?: string | null;
  address?: ProfileField | null;
  phones: ProfileField[];
  emails: ProfileField[];
  websites: ProfileField[];
  employees?: { value: number; sources: string[]; verified: boolean } | null;
  publicRoles: PublicRole[];
  providerStatus: {
    api1881: { fetchedAt?: string | null; available: boolean };
    brreg: { fetchedAt?: string | null; available: boolean };
  };
};

type SalesCoachOutput = {
  summary: string;
  currentPhase: "DISCOVER_PROBLEM"|"CONFIRM_PROBLEM"|"PRESENT_SOLUTION"|"CONFIRM_SOLUTION"|"NEXT_COMMITMENT";
  problem: { hypothesis: string; evidence: string[]; questions: string[]; acceptanceSignals: string[] };
  solution: { positioning: string; arguments: string[]; proofNeeded: string[]; acceptanceQuestions: string[] };
  stakeholders: Array<{ role: string; objective: string; risk: string }>;
  objections: Array<{ objection: string; response: string; followUpQuestion: string }>;
  nextBestAction: { action: string; why: string; channel: string };
  emailDraft: { subject: string; body: string };
  sellerCoach: { do: string[]; avoid: string[]; callOpening: string };
  evidenceGaps: string[];
  confidence: "LOW"|"MEDIUM"|"HIGH";
};

type IntelligenceFinding = {
  id: string;
  scope: "ACCOUNT"|"MARKET"|"REGULATORY";
  signal_type: string;
  title: string;
  summary: string;
  why_it_matters?: string | null;
  source_url: string;
  source_title?: string | null;
  source_kind: string;
  source_published_at?: string | null;
  first_seen_at?: string | null;
  last_seen_at: string;
  change_status: "NEW"|"CHANGED"|"UNCHANGED";
  direction: "POSITIVE"|"NEUTRAL"|"NEGATIVE";
  relevance: number;
  strength?: number;
  freshness?: number;
  source_authority?: number;
  confidence: number;
  fit_delta?: number;
  timing_delta?: number;
  intent_delta?: number;
  financial_capacity_delta?: number;
  evidence?: {
    event_year?: number | null;
    event_date_precision?: string | null;
    historical?: boolean;
    temporal_confidence?: string;
  };
};

type AccountData = {
  prospect: {
    id: string;
    company_name: string;
    organization_number?: string | null;
    organization_type?: string | null;
    city?: string | null;
    industry?: string | null;
    employee_count?: number | null;
    member_count?: number | null;
    website_url?: string | null;
    linkedin_company_url?: string | null;
    status: string;
    fit_score: number;
    fit_tier: string;
    fit_reasons?: string[];
    evidence_gaps?: string[];
    next_action?: string | null;
  };
  strategy: Record<string, any> | null;
  assignmentOptions: {
    users: Array<{ email: string; displayName: string; role: "OWNER" | "MEMBER" }>;
    defaultOwnerEmail?: string | null;
    degraded?: boolean;
  };
  companyProfile: CompanyProfile;
  contacts: Contact[];
  touchpoints: Touchpoint[];
  advisor: {
    priority: "P1"|"P2"|"P3"; score: number; stage: string; headline: string;
    recommendedModels: string[]; recommendedEntryRole: string; whyNow: string[];
    missing: string[]; nextAction: string;
    channelSequence: Array<{order:number;channel:string;action:string}>;
    guardrail: string;
    accountRole: string;
    primaryModel: string;
    secondaryModel: string | null;
    scores: { fit: number; timing: number; access: number; intent: number; overall: number };
    businessCaseCompleteness: number;
    stageGuidance: { current: string; exitCriteria: string[]; next: string | null };
  };
  stageGate: {
    currentStage: string;
    nextStage: string | null;
    readyToAdvance: boolean;
    completionPercent: number;
    criteria: Array<{ id: string; label: string; met: boolean; evidence?: string | null }>;
  };
  coachRuns: Array<{
    id: string;
    mode: string;
    source_text?: string | null;
    seller_context?: string | null;
    output: SalesCoachOutput;
    provider?: string | null;
    model?: string | null;
    created_at: string;
    applied_at?: string | null;
    applied_by_email?: string | null;
    applied_fields?: string[];
  }>;
  intelligence: {
    account: IntelligenceFinding[];
    summary: {
      total: number;
      materialChanges: number;
      negativeSignals: number;
      deltas: { fit: number; timing: number; intent: number; financialCapacity: number };
      topChanges: IntelligenceFinding[];
    };
    market: IntelligenceFinding[];
    regulatory: IntelligenceFinding[];
    latestRun: {
      id: string;
      status: "RUNNING"|"SUCCESS"|"ERROR";
      provider?: string | null;
      started_at: string;
      completed_at?: string | null;
      source_count: number;
      finding_count: number;
      new_count: number;
      changed_count: number;
      warnings: string[];
      summary?: Record<string, unknown>;
    } | null;
  };
  enrichmentCapabilities: {
    brreg: { available: boolean };
    api1881: { available: boolean; configured: boolean };
    linkedin: { available: boolean; mode: string; scraping: boolean };
  };
};

const MODELS = [
  "Ansattfordel",
  "Ledelse & team / Management retreat",
  "Firmabolig / Corporate base",
  "Medlemsfordel",
  "Relokasjon",
  "Kunde-/partnerfordel",
  "Eiendomsinvestering",
  "Delt Corporate Home",
];

const ACCOUNT_ROLES = [
  ["END_CUSTOMER", "Sluttkunde"],
  ["PARTNER", "Partner"],
  ["MEMBER_ORGANIZATION", "Medlemsorganisasjon"],
  ["ADVISOR", "Rådgiver"],
  ["REFERRAL_PARTNER", "Referral partner"],
] as const;

const ENTRY_ROLES = [
  "HR / People",
  "CEO / daglig leder",
  "CFO / økonomi",
  "Styreleder",
  "Partnerskap / medlemsansvarlig",
  "Innkjøp",
  "Office / Workplace",
  "Eier",
];

const STAGES = ["TARGET","RESEARCH","STRATEGY_READY","OUTREACH","ENGAGED","MEETING","BUSINESS_CASE","SHORTLIST","DECISION","NEGOTIATION","WON","LOST"];

function localDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function CorporateAccountWorkspacePage() {
  const params = useParams<{ brandKey: string; prospectId: string }>();
  const brandKey = typeof params?.brandKey === "string" ? params.brandKey : "";
  const prospectId = typeof params?.prospectId === "string" ? params.prospectId : "";
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [strategy, setStrategy] = useState({
    stage: "TARGET",
    priority: "P2",
    accountRole: "END_CUSTOMER",
    accountModels: [] as string[],
    primaryModel: "",
    secondaryModel: "",
    expansionModel: "",
    objective: "",
    entryAngle: "",
    firstOffer: "",
    recommendedEntryRole: "",
    championHypothesis: "",
    problemHypothesis: "",
    problemAcceptanceGoal: "",
    problemAcceptanceStatus: "UNKNOWN",
    problemAcceptanceEvidence: "",
    solutionHypothesis: "",
    solutionAcceptanceGoal: "",
    solutionAcceptanceStatus: "UNKNOWN",
    solutionAcceptanceEvidence: "",
    coreMessage: "",
    avoidMessage: "",
    nextBestAction: "",
    nextActionReason: "",
    businessCase: {} as Record<string, unknown>,
    accountOwnerEmail: "",
    strategicOwnerEmail: "",
    estimatedValueEur: "",
    targetDate: "",
    nextReviewAt: "",
    stageOverrideReason: "",
    notes: "",
    linkedinMotion: "MANUAL_APPROVAL",
  });

  const [coachMode, setCoachMode] = useState("NEXT_STEP");
  const [coachSource, setCoachSource] = useState("");
  const [coachContext, setCoachContext] = useState("");
  const [coachOutput, setCoachOutput] = useState<SalesCoachOutput | null>(null);
  const [coachRunId, setCoachRunId] = useState("");

  const [contactForm, setContactForm] = useState({
    name: "",
    title: "",
    buyingRole: "",
    seniority: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    sourceUrl: "",
    status: "IDENTIFIED",
    confidence: "MEDIUM",
    relationshipStatus: "NOT_CONTACTED",
    influenceLevel: "UNKNOWN",
    professionalRelevance: "",
    professionalTopics: "",
    isPrimary: false,
    linkedinFollowing: false,
  });

  const [touchpoint, setTouchpoint] = useState({
    contactId: "",
    channel: "LINKEDIN",
    activityType: "FOLLOW_COMPANY",
    ownerEmail: "",
    dueAt: "",
    summary: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(brandKey)}/corporate/${encodeURIComponent(prospectId)}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Kunne ikke hente Corporate-kontoen.");
      setData(body);
      const saved = body.strategy || {};
      const latestCoach = Array.isArray(body.coachRuns) && body.coachRuns[0]?.output ? body.coachRuns[0].output : null;
      setCoachOutput(latestCoach);
      setCoachRunId(Array.isArray(body.coachRuns) && body.coachRuns[0]?.id ? String(body.coachRuns[0].id) : "");
      const defaultOwnerEmail = String(body.assignmentOptions?.defaultOwnerEmail || "");
      setStrategy({
        stage: String(saved.stage || "TARGET"),
        priority: String(saved.priority || "P2"),
        accountRole: String(saved.account_role || "END_CUSTOMER"),
        accountModels: Array.isArray(saved.account_models) ? saved.account_models : [],
        primaryModel: String(saved.primary_model || ""),
        secondaryModel: String(saved.secondary_model || ""),
        expansionModel: String(saved.expansion_model || ""),
        objective: String(saved.objective || ""),
        entryAngle: String(saved.entry_angle || ""),
        firstOffer: String(saved.first_offer || ""),
        recommendedEntryRole: String(saved.recommended_entry_role || ""),
        championHypothesis: String(saved.champion_hypothesis || ""),
        problemHypothesis: String(saved.problem_hypothesis || ""),
        problemAcceptanceGoal: String(saved.problem_acceptance_goal || ""),
        problemAcceptanceStatus: String(saved.problem_acceptance_status || "UNKNOWN"),
        problemAcceptanceEvidence: String(saved.problem_acceptance_evidence || ""),
        solutionHypothesis: String(saved.solution_hypothesis || ""),
        solutionAcceptanceGoal: String(saved.solution_acceptance_goal || ""),
        solutionAcceptanceStatus: String(saved.solution_acceptance_status || "UNKNOWN"),
        solutionAcceptanceEvidence: String(saved.solution_acceptance_evidence || ""),
        coreMessage: String(saved.core_message || ""),
        avoidMessage: String(saved.avoid_message || ""),
        nextBestAction: String(saved.next_best_action || ""),
        nextActionReason: String(saved.next_action_reason || ""),
        businessCase: saved.business_case && typeof saved.business_case === "object" ? saved.business_case : {},
        accountOwnerEmail: String(saved.account_owner_email || defaultOwnerEmail),
        strategicOwnerEmail: String(saved.strategic_owner_email || defaultOwnerEmail),
        estimatedValueEur: saved.estimated_value_eur == null ? "" : String(saved.estimated_value_eur),
        targetDate: String(saved.target_date || ""),
        nextReviewAt: localDateTime(saved.next_review_at),
        stageOverrideReason: "",
        notes: String(saved.notes || ""),
        linkedinMotion: String(saved.linkedin_motion || "MANUAL_APPROVAL"),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke hente Corporate-kontoen.");
    } finally {
      setLoading(false);
    }
  }, [brandKey, prospectId]);

  useEffect(() => { void load(); }, [load]);

  const upcomingTouchpoints = useMemo(
    () => (data?.touchpoints || []).filter(item => item.status === "PLANNED"),
    [data?.touchpoints],
  );

  async function post(payload: Record<string, unknown>) {
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(brandKey)}/corporate/${encodeURIComponent(prospectId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "Handlingen feilet.");
    return body;
  }

  async function run1881Enrichment() {
    setBusy("1881"); setError(""); setNotice("");
    try {
      await post({ action: "enrich_1881" });
      setNotice("1881-data er hentet og vises nå i bedriftsprofilen. Ingen personer eller meldinger ble opprettet automatisk.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "1881-oppslaget feilet.");
    } finally {
      setBusy("");
    }
  }

  async function runCorporateIntelligence() {
    setBusy("intelligence"); setError(""); setNotice("");
    try {
      const result = await post({ action: "run_intelligence" });
      const count = Number(result?.result?.findingCount || 0);
      const changed = Number(result?.result?.changedCount || 0);
      const fresh = Number(result?.result?.newCount || 0);
      const warnings = Array.isArray(result?.result?.warnings) ? result.result.warnings.filter(Boolean) : [];
      setNotice(
        "Corporate Intelligence er oppdatert: " + count + " funn, " + fresh + " nye i RealtyFlow og " + changed + " endrede." +
        (warnings.length ? " Research-status: DEGRADED – " + warnings[0] : " Research-status: FULL.") +
        " Ingen kontakt eller pipelinebevegelse er utført.",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Corporate Intelligence feilet.");
    } finally {
      setBusy("");
    }
  }

  async function runBrregEnrichment() {
    setBusy("brreg"); setError(""); setNotice("");
    try {
      await post({ action: "enrich_brreg" });
      setNotice("Brønnøysund-data og offentlige roller er oppdatert. Oppslaget er gratis og starter ingen kontakt.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Brønnøysund-oppslaget feilet.");
    } finally {
      setBusy("");
    }
  }

  async function addPublicRole(role: PublicRole) {
    const titleLower = role.title.toLowerCase();
    const decisionMaker = titleLower.includes("daglig leder") ||
      titleLower.includes("styrets leder") ||
      titleLower.includes("styreleder");
    setBusy(`role:${role.name}:${role.title}`); setError(""); setNotice("");
    try {
      await post({
        action: "save_contact",
        name: role.name,
        title: role.title,
        buyingRole: titleLower.includes("daglig leder") ? "CEO / Daglig leder" :
          titleLower.includes("kontaktperson") ? "Kontaktperson" :
          titleLower.includes("styre") ? "Styre" : role.title,
        seniority: decisionMaker ? "Executive" : "",
        email: "",
        phone: "",
        linkedinUrl: "",
        sourceUrl: role.sourceUrl || "",
        status: role.sourceUrl ? "VERIFIED" : "IDENTIFIED",
        confidence: role.verified ? "HIGH" : "MEDIUM",
        relationshipStatus: "NOT_CONTACTED",
        influenceLevel: decisionMaker ? "DECISION_MAKER" : "UNKNOWN",
        professionalRelevance: `Offentlig registrert rolle: ${role.title}. Kilder: ${role.sources.join(" + ")}.`,
        professionalTopics: [],
        isPrimary: titleLower.includes("daglig leder"),
        linkedinFollowing: false,
      });
      setNotice(`${role.name} er lagt til i Decision Unit fra offentlig rollekilde.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke legge rollen til i Decision Unit.");
    } finally {
      setBusy("");
    }
  }

  async function saveStrategy() {
    setBusy("strategy"); setError(""); setNotice("");
    try {
      await post({
        action: "save_strategy",
        ...strategy,
        estimatedValueEur: strategy.estimatedValueEur || null,
        nextReviewAt: strategy.nextReviewAt ? new Date(strategy.nextReviewAt).toISOString() : null,
      });
      setNotice("Kontostrategien er lagret.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre strategien.");
    } finally {
      setBusy("");
    }
  }

  async function runSalesCoach() {
    setBusy("coach"); setError(""); setNotice("");
    try {
      const result = await post({
        action: "sales_coach",
        mode: coachMode,
        sourceText: coachSource,
        sellerContext: coachContext,
      });
      setCoachOutput(result.output as SalesCoachOutput);
      setCoachRunId(String(result.coachRun?.id || ""));
      setNotice("Nexus Sales Coach har analysert kontoen. Ingen melding er sendt.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sales Coach feilet.");
    } finally {
      setBusy("");
    }
  }

  async function saveCoachEmailDraft() {
    if (!coachOutput?.emailDraft?.subject?.trim() || !coachOutput?.emailDraft?.body?.trim()) {
      setError("Coachen har ikke et ferdig e-postutkast å lagre.");
      return;
    }
    setBusy("coach-email"); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(brandKey)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          targetType: "corporate",
          targetId: prospectId,
          subject: coachOutput.emailDraft.subject,
          bodyText: coachOutput.emailDraft.body,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body?.error?.code || "";
        const message = body?.error?.message ||
          (response.status === 403 ? "Du mangler tilgang til å lage e-postutkast i dette arbeidsområdet." :
           code === "EMAIL_DRAFT_SAVE_FAILED" ? "Kontoen har ikke en godkjent e-postmottaker i E-post / Reach ennå." :
           "Kunne ikke lagre e-postutkastet.");
        throw new Error(message);
      }
      setNotice("Coach-utkastet er lagret i E-post / Reach. Ingenting er sendt.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre coach-utkastet.");
    } finally {
      setBusy("");
    }
  }

  async function applyCoachRecommendation() {
    if (!coachOutput || !coachRunId) {
      setError("Kjør Sales Coach først.");
      return;
    }
    setBusy("coach-apply"); setError(""); setNotice("");
    try {
      const result = await post({
        action: "apply_coach_strategy",
        coachRunId,
        fields: [
          "problemHypothesis",
          "problemAcceptanceGoal",
          "solutionHypothesis",
          "solutionAcceptanceGoal",
          "nextBestAction",
          "nextActionReason",
        ],
      });
      setNotice(`Coach-funn er godkjent inn i kontostrategien (${result.appliedFields?.length || 0} felt). Ingen ekstern handling er utført.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke bruke coach-funn i strategien.");
    } finally {
      setBusy("");
    }
  }

  async function saveContact() {
    if (!contactForm.name.trim()) {
      setError("Navn på personen mangler.");
      return;
    }
    setBusy("contact"); setError(""); setNotice("");
    try {
      await post({
        action: "save_contact",
        ...contactForm,
        professionalTopics: contactForm.professionalTopics.split(",").map(item => item.trim()).filter(Boolean),
      });
      setNotice("Personen er lagt til i beslutningsgruppen.");
      setContactForm(current => ({
        ...current,
        name: "", title: "", buyingRole: "", seniority: "", email: "", phone: "",
        linkedinUrl: "", sourceUrl: "", professionalRelevance: "", professionalTopics: "",
        isPrimary: false, linkedinFollowing: false, status: "IDENTIFIED",
        relationshipStatus: "NOT_CONTACTED", influenceLevel: "UNKNOWN",
      }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre personen.");
    } finally {
      setBusy("");
    }
  }

  async function addTouchpoint() {
    setBusy("touchpoint"); setError(""); setNotice("");
    try {
      await post({
        action: "add_touchpoint",
        ...touchpoint,
        dueAt: touchpoint.dueAt ? new Date(touchpoint.dueAt).toISOString() : null,
      });
      setNotice("Kontaktaktiviteten er lagt i planen. Ingenting er sendt automatisk.");
      setTouchpoint(current => ({ ...current, dueAt: "", summary: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre aktiviteten.");
    } finally {
      setBusy("");
    }
  }

  async function completeTouchpoint(item: Touchpoint) {
    setBusy(item.id); setError(""); setNotice("");
    try {
      await post({ action: "complete_touchpoint", touchpointId: item.id, summary: item.summary || null });
      setNotice("Aktiviteten er markert utført.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke oppdatere aktiviteten.");
    } finally {
      setBusy("");
    }
  }

  if (loading || !data) {
    return <div className="mx-auto max-w-7xl p-6">
      {error
        ? <div className="rounded-2xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>
        : <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={16} className="animate-spin"/> Henter Corporate Account Workspace…</div>}
    </div>;
  }

  const { prospect } = data;
  const intelligenceDegraded = Boolean(
    data.intelligence.latestRun &&
    (
      data.intelligence.latestRun.provider === "company_crawl" ||
      (data.intelligence.latestRun.warnings || []).length > 0 ||
      data.intelligence.latestRun.summary?.degraded_research === true
    ),
  );
  const currentStageIndex = STAGES.indexOf(data.stageGate.currentStage);
  const selectedStageIndex = STAGES.indexOf(strategy.stage);
  const stageSkipRequested = strategy.stage !== "LOST" &&
    currentStageIndex >= 0 &&
    selectedStageIndex > currentStageIndex + 1;

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="rounded-3xl border border-slate-800 bg-slate-900/75 p-5 sm:p-7">
      <Link href={`/workspace/${encodeURIComponent(brandKey)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">
        <ArrowLeft size={14}/> Tilbake til workspace
      </Link>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-300">
            <Building2 size={16}/> Corporate Account
          </div>
          <h1 className="mt-2 text-3xl font-black text-white">{prospect.company_name}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {[prospect.industry, prospect.city, prospect.organization_number ? `Org.nr. ${prospect.organization_number}` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-cyan-950 px-3 py-1.5 font-semibold text-cyan-200">Fit {prospect.fit_tier} · {prospect.fit_score}/100</span>
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">{prospect.status}</span>
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">{strategy.priority}</span>
            <span className="rounded-full bg-slate-800 px-3 py-1.5 text-slate-300">{strategy.stage}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {prospect.website_url && <a href={prospect.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
            Nettside <ExternalLink size={14}/>
          </a>}
          {prospect.linkedin_company_url && <a href={prospect.linkedin_company_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
            LinkedIn <Linkedin size={14}/>
          </a>}
        </div>
      </div>
    </header>

    {error && <div className="rounded-2xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</div>}
    {notice && <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-200">{notice}</div>}

    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Bedriftsdata</p>
          <h2 className="mt-1 text-lg font-bold text-white">Brønnøysund + 1881</h2>
          <p className="mt-1 text-xs text-slate-500">Felt merket «bekreftet» finnes i mer enn én kilde. Kildene beholdes per felt.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${data.companyProfile.providerStatus.brreg.available ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
            Brønnøysund {data.companyProfile.providerStatus.brreg.available ? "hentet" : "ikke hentet"}
          </span>
          <span className={`rounded-full px-2.5 py-1 font-semibold ${data.companyProfile.providerStatus.api1881.available ? "bg-emerald-950 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
            1881 {data.companyProfile.providerStatus.api1881.available ? "hentet" : "ikke hentet"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><MapPin size={14}/> Adresse</div>
          <p className="mt-2 text-sm text-slate-200">{data.companyProfile.address?.value || "Ikke funnet"}</p>
          {data.companyProfile.address && <p className="mt-2 text-[11px] text-slate-500">{data.companyProfile.address.sources.join(" + ")}{data.companyProfile.address.verified ? " · bekreftet" : ""}</p>}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Phone size={14}/> Telefon</div>
          <div className="mt-2 space-y-2">
            {data.companyProfile.phones.slice(0, 4).map(phone => <div key={phone.value}>
              <p className="text-sm text-slate-200">{phone.value}{phone.main ? " · hovednummer" : ""}</p>
              <p className="text-[11px] text-slate-500">{phone.sources.join(" + ")}{phone.verified ? " · bekreftet" : ""}</p>
            </div>)}
            {!data.companyProfile.phones.length && <p className="text-sm text-slate-500">Ikke funnet</p>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Mail size={14}/> E-post</div>
          <div className="mt-2 space-y-2">
            {data.companyProfile.emails.slice(0, 4).map(email => <div key={email.value}>
              <p className="break-all text-sm text-slate-200">{email.value}</p>
              <p className="text-[11px] text-slate-500">{email.sources.join(" + ")}{email.verified ? " · bekreftet" : ""}</p>
            </div>)}
            {!data.companyProfile.emails.length && <p className="text-sm text-slate-500">Ikke funnet</p>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><Users size={14}/> Ansatte</div>
          <p className="mt-2 text-2xl font-black text-white">{data.companyProfile.employees?.value?.toLocaleString("nb-NO") || "—"}</p>
          {data.companyProfile.employees && <p className="mt-2 text-[11px] text-slate-500">{data.companyProfile.employees.sources.join(" + ")}{data.companyProfile.employees.verified ? " · bekreftet" : ""}</p>}
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-violet-900/60 bg-violet-950/15 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">Nexus Corporate Advisor</p>
          <h2 className="mt-2 text-xl font-bold text-white">{data.advisor.headline}</h2>
          <p className="mt-2 text-sm text-slate-300">{data.advisor.nextAction}</p>
        </div>
        <span className="shrink-0 rounded-full border border-violet-800 px-3 py-1.5 text-xs font-black text-violet-300">{data.advisor.priority} · {data.advisor.score}/100</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div><p className="text-xs font-semibold text-slate-400">Anbefalt modell</p><p className="mt-1 text-sm text-slate-200">{data.advisor.recommendedModels.join(" · ")}</p></div>
        <div><p className="text-xs font-semibold text-slate-400">Anbefalt inngang</p><p className="mt-1 text-sm text-slate-200">{data.advisor.recommendedEntryRole}</p></div>
        <div><p className="text-xs font-semibold text-slate-400">Mangler før neste nivå</p><p className="mt-1 text-sm text-amber-300">{data.advisor.missing.join(" · ") || "Ingen kritiske mangler"}</p></div>
      </div>
      {data.advisor.whyNow.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
        {data.advisor.whyNow.map((reason,index) => <span key={index} className="rounded-full border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-[11px] text-slate-300">{reason}</span>)}
      </div>}
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {data.advisor.channelSequence.map(step => <div key={step.order} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-[10px] font-black uppercase text-violet-300">{step.order}. {step.channel}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{step.action}</p>
        </div>)}
      </div>
      <p className="mt-4 text-[11px] text-slate-500">{data.advisor.guardrail}</p>
    </section>

    <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/10 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
            <TrendingUp size={16}/> Corporate Intelligence
          </div>
          <h2 className="mt-2 text-xl font-bold text-white">Hva har endret seg – og hvorfor betyr det noe?</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Dyp research på selskapets nettsider, årsrapporter/PDF-er og offentlig web. Funn er evidens, ikke automatisk pipelinebevegelse eller outreach.</p>
        </div>
        <button type="button" onClick={() => void runCorporateIntelligence()} disabled={busy === "intelligence"}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <RefreshCw size={15} className={busy === "intelligence" ? "animate-spin" : ""}/>{busy === "intelligence" ? "Research…" : "Kjør dyp research"}
        </button>
      </div>

      {data.intelligence.latestRun && <div className={`mt-4 rounded-xl border p-3 ${intelligenceDegraded ? "border-amber-800 bg-amber-950/20" : "border-emerald-800 bg-emerald-950/20"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${intelligenceDegraded ? "bg-amber-950 text-amber-300" : "bg-emerald-950 text-emerald-300"}`}>
              {intelligenceDegraded ? "DEGRADED RESEARCH" : "FULL RESEARCH"}
            </span>
            <span className="text-xs text-slate-400">Provider: {data.intelligence.latestRun.provider || "ukjent"}</span>
            <span className="text-xs text-slate-500">· {data.intelligence.latestRun.source_count} kilder · {data.intelligence.latestRun.finding_count} funn</span>
          </div>
          <span className="text-[10px] text-slate-600">
            {new Date(data.intelligence.latestRun.started_at).toLocaleString("nb-NO")}
          </span>
        </div>
        {(data.intelligence.latestRun.warnings || []).length > 0 && <div className="mt-2 space-y-1">
          {data.intelligence.latestRun.warnings.slice(0, 3).map((warning,index) => <p key={index} className="text-xs leading-5 text-amber-200">⚠ {warning}</p>)}
        </div>}
      </div>}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Aktive funn</p>
          <p className="mt-1 text-xl font-black text-white">{data.intelligence.summary.total}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Nytt / endret</p>
          <p className="mt-1 text-xl font-black text-emerald-300">{data.intelligence.summary.materialChanges}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Negative signaler</p>
          <p className="mt-1 text-xl font-black text-rose-300">{data.intelligence.summary.negativeSignals}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Signalpåvirkning</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Fit {data.intelligence.summary.deltas.fit >= 0 ? "+" : ""}{data.intelligence.summary.deltas.fit}
            {" · "}Timing {data.intelligence.summary.deltas.timing >= 0 ? "+" : ""}{data.intelligence.summary.deltas.timing}
            {" · "}Intent {data.intelligence.summary.deltas.intent >= 0 ? "+" : ""}{data.intelligence.summary.deltas.intent}
            {" · "}Kapasitet {data.intelligence.summary.deltas.financialCapacity >= 0 ? "+" : ""}{data.intelligence.summary.deltas.financialCapacity}
          </p>
        </div>
      </div>

      {data.intelligence.account.length > 0 ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {data.intelligence.account.slice(0, 8).map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.change_status === "NEW" ? "bg-emerald-950 text-emerald-300" : item.change_status === "CHANGED" ? "bg-amber-950 text-amber-300" : "bg-slate-800 text-slate-500"}`}>{item.change_status === "NEW" ? "NYTT FUNN" : item.change_status === "CHANGED" ? "ENDRET" : "UENDRET"}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.direction === "NEGATIVE" ? "bg-rose-950 text-rose-300" : item.direction === "POSITIVE" ? "bg-cyan-950 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>{item.direction}</span>
            </div>
            <span className="text-[10px] text-slate-600">Relevans {item.relevance} · freshness {item.freshness ?? "—"} · confidence {item.confidence}</span>
          </div>
          <h3 className="mt-3 text-sm font-bold text-white">{item.title}</h3>
          <p className="mt-2 text-xs leading-5 text-slate-300">{item.summary}</p>
          {item.evidence?.event_year && <p className="mt-1 text-[11px] text-slate-500">
            Hendelsesår: {item.evidence.event_year}{item.evidence.historical ? " · historisk kontekst" : ""}
          </p>}
          {item.why_it_matters && <p className="mt-2 text-xs leading-5 text-emerald-200"><strong>Hvorfor viktig:</strong> {item.why_it_matters}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-slate-600">{item.source_kind.replaceAll("_"," ")}</span>
            <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">Kilde <ExternalLink size={12}/></a>
          </div>
        </article>)}
      </div> : <div className="mt-4 rounded-xl border border-dashed border-slate-800 p-5 text-sm text-slate-500">Ingen Intelligence-funn ennå. Kjør dyp research for denne kontoen.</div>}

      {(data.intelligence.market.length > 0 || data.intelligence.regulatory.length > 0) && <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-300"><TrendingUp size={14}/> Markedswatch</div>
          <div className="mt-3 space-y-3">
            {data.intelligence.market.slice(0, 4).map(item => <div key={item.id} className="border-b border-slate-800 pb-3 last:border-0 last:pb-0">
              <a href={item.source_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-200 hover:text-cyan-300">{item.title}</a>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.why_it_matters || item.summary}</p>
            </div>)}
            {!data.intelligence.market.length && <p className="text-xs text-slate-600">Ingen markedsfunn ennå.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-amber-300"><ShieldCheck size={14}/> Regelverkswatch</div>
          <div className="mt-3 space-y-3">
            {data.intelligence.regulatory.slice(0, 4).map(item => <div key={item.id} className="border-b border-slate-800 pb-3 last:border-0 last:pb-0">
              <a href={item.source_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-200 hover:text-amber-300">{item.title}</a>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.why_it_matters || item.summary}</p>
            </div>)}
            {!data.intelligence.regulatory.length && <p className="text-xs text-slate-600">Ingen regelverksfunn ennå.</p>}
          </div>
        </div>
      </div>}
    </section>

    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2"><Target size={18} className="text-cyan-300"/><h2 className="font-semibold">Kontostrategi</h2></div>
          <p className="mt-1 text-xs text-slate-500">Hvorfor denne kontoen, hvilket problem skal vi forstå, hvem skal vi gå via og hva er neste beste handling?</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500">Prioritet
            <select value={strategy.priority} onChange={e => setStrategy(s => ({ ...s, priority: e.target.value }))} className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              {["P1","P2","P3"].map(v => <option key={v}>{v}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void saveStrategy()} disabled={busy === "strategy"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Save size={15}/>{busy === "strategy" ? "Lagrer…" : "Lagre strategi"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          {STAGES.map(stage => <button
            key={stage}
            type="button"
            onClick={() => setStrategy(s => ({ ...s, stage }))}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${strategy.stage === stage ? "border-cyan-500 bg-cyan-950 text-cyan-200" : "border-slate-800 bg-slate-950/50 text-slate-500 hover:text-slate-300"}`}
          >{stage}</button>)}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Fit", data.advisor.scores.fit],
          ["Timing", data.advisor.scores.timing],
          ["Access", data.advisor.scores.access],
          ["Intent", data.advisor.scores.intent],
          ["Account score", data.advisor.scores.overall],
        ].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-black text-white">{value}<span className="text-xs font-medium text-slate-500">/100</span></p>
        </div>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Strategisk hypotese</p>
            <p className="mt-1 text-xs text-slate-500">Skal endres når kunden gir ny informasjon. Hypotese er ikke fakta.</p>
          </div>
          <textarea value={strategy.objective} onChange={e => setStrategy(s => ({ ...s, objective: e.target.value }))} rows={2} placeholder="Hvorfor denne kontoen og hva ønsker vi å oppnå?" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea value={strategy.problemHypothesis} onChange={e => setStrategy(s => ({ ...s, problemHypothesis: e.target.value }))} rows={4} placeholder="Problemhypotese: Hva tror vi de prøver å løse?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={strategy.problemAcceptanceGoal} onChange={e => setStrategy(s => ({ ...s, problemAcceptanceGoal: e.target.value }))} rows={4} placeholder="Problemaksept: Hva må kunden selv bekrefte før vi går til løsning?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={strategy.solutionHypothesis} onChange={e => setStrategy(s => ({ ...s, solutionHypothesis: e.target.value }))} rows={4} placeholder="Løsningshypotese: Hvilken modell kan passe hvis problemet bekreftes?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={strategy.solutionAcceptanceGoal} onChange={e => setStrategy(s => ({ ...s, solutionAcceptanceGoal: e.target.value }))} rows={4} placeholder="Løsningsaksept: Hva må kunden validere for å gå videre?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/10 p-3">
              <label className="text-xs font-semibold text-amber-200">Faktisk problemaksept
                <select value={strategy.problemAcceptanceStatus} onChange={e => setStrategy(s => ({ ...s, problemAcceptanceStatus: e.target.value }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <option value="UNKNOWN">Ikke bekreftet</option>
                  <option value="PARTIAL">Delvis bekreftet</option>
                  <option value="CONFIRMED">Bekreftet av kunden</option>
                  <option value="REJECTED">Avvist / korrigert</option>
                </select>
              </label>
              <textarea value={strategy.problemAcceptanceEvidence} onChange={e => setStrategy(s => ({ ...s, problemAcceptanceEvidence: e.target.value }))} rows={3} placeholder="Evidens: hva sa kunden, i hvilket møte/e-post, og hva ble faktisk bekreftet?" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            </div>
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/10 p-3">
              <label className="text-xs font-semibold text-emerald-200">Faktisk løsningsaksept
                <select value={strategy.solutionAcceptanceStatus} onChange={e => setStrategy(s => ({ ...s, solutionAcceptanceStatus: e.target.value }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                  <option value="UNKNOWN">Ikke bekreftet</option>
                  <option value="PARTIAL">Delvis bekreftet</option>
                  <option value="CONFIRMED">Bekreftet av kunden</option>
                  <option value="REJECTED">Avvist / må endres</option>
                </select>
              </label>
              <textarea value={strategy.solutionAcceptanceEvidence} onChange={e => setStrategy(s => ({ ...s, solutionAcceptanceEvidence: e.target.value }))} rows={3} placeholder="Evidens: hva ved løsningen bekreftet kunden, og hvilke forbehold står igjen?" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea value={strategy.coreMessage} onChange={e => setStrategy(s => ({ ...s, coreMessage: e.target.value }))} rows={3} placeholder="Kjernebudskap: Hva skal vi si?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={strategy.avoidMessage} onChange={e => setStrategy(s => ({ ...s, avoidMessage: e.target.value }))} rows={3} placeholder="Ikke start med: f.eks. investering, prisvekst eller boligobjekt" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea value={strategy.nextBestAction} onChange={e => setStrategy(s => ({ ...s, nextBestAction: e.target.value }))} rows={3} placeholder={`Neste beste handling · Nexus foreslår: ${data.advisor.nextAction}`} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={strategy.nextActionReason} onChange={e => setStrategy(s => ({ ...s, nextActionReason: e.target.value }))} rows={3} placeholder="Hvorfor er dette riktig neste steg?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Kontorolle & salgsmodell</p>
            <p className="mt-1 text-xs text-slate-500">Referral partner er nå en kontorolle, ikke en salgsmodell.</p>
          </div>
          <label className="text-xs text-slate-500">Kontorolle
            <select value={strategy.accountRole} onChange={e => setStrategy(s => ({ ...s, accountRole: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              {ACCOUNT_ROLES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-500">Primær modell
              <select value={strategy.primaryModel} onChange={e => setStrategy(s => ({ ...s, primaryModel: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                <option value="">Velg / la Nexus foreslå</option>
                {MODELS.map(model => <option key={model}>{model}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">Sekundær modell
              <select value={strategy.secondaryModel} onChange={e => setStrategy(s => ({ ...s, secondaryModel: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                <option value="">Ingen ennå</option>
                {MODELS.map(model => <option key={model}>{model}</option>)}
              </select>
            </label>
          </div>
          <label className="text-xs text-slate-500">Mulig utvidelse
            <select value={strategy.expansionModel} onChange={e => setStrategy(s => ({ ...s, expansionModel: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <option value="">Ingen ennå</option>
              {MODELS.map(model => <option key={model}>{model}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">Anbefalt inngang
            <select value={strategy.recommendedEntryRole} onChange={e => setStrategy(s => ({ ...s, recommendedEntryRole: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <option value="">{data.advisor.recommendedEntryRole || "Velg rolle"}</option>
              {ENTRY_ROLES.map(role => <option key={role}>{role}</option>)}
            </select>
          </label>
          <textarea value={strategy.championHypothesis} onChange={e => setStrategy(s => ({ ...s, championHypothesis: e.target.value }))} rows={2} placeholder="Champion-hypotese: Hvem kan drive saken internt?" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <textarea value={strategy.entryAngle} onChange={e => setStrategy(s => ({ ...s, entryAngle: e.target.value }))} rows={2} placeholder="Inngangsvinkel: hvorfor akkurat denne rollen?" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <textarea value={strategy.firstOffer} onChange={e => setStrategy(s => ({ ...s, firstOffer: e.target.value }))} rows={2} placeholder="Første tilbud: f.eks. Corporate Home Assessment / beslutningsnotat" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-300">Business case completeness</p>
              <span className="text-sm font-black text-cyan-300">{data.advisor.businessCaseCompleteness}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-600" style={{ width: `${data.advisor.businessCaseCompleteness}%` }}/></div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">Fasevakt · {data.stageGate.currentStage}</p>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${data.stageGate.readyToAdvance ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>
              {data.stageGate.completionPercent}% · {data.stageGate.readyToAdvance ? "klar" : "ikke klar"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {data.stageGate.criteria.map(item => <div key={item.id} className="flex items-start gap-2 text-xs text-slate-300">
              <span className={item.met ? "text-emerald-300" : "text-slate-600"}>{item.met ? "✓" : "○"}</span>
              <div><span>{item.label}</span>{item.evidence && <p className="mt-0.5 text-[11px] text-slate-500">{item.evidence}</p>}</div>
            </div>)}
          </div>
          {data.stageGate.nextStage && <p className="mt-3 text-[11px] text-slate-500">Neste fase: <strong className="text-slate-300">{data.stageGate.nextStage}</strong>. Fasevakt kontrolleres når strategien lagres.</p>}
          {data.strategy?.stage_override_reason && <p className="mt-3 text-[11px] leading-5 text-slate-600">Siste registrerte overstyring: {String(data.strategy.stage_override_reason)}</p>}
          {(!data.stageGate.readyToAdvance || stageSkipRequested) && <label className="mt-3 block text-xs text-slate-500">Overstyr fasevakt
            <textarea value={strategy.stageOverrideReason} onChange={e => setStrategy(s => ({ ...s, stageOverrideReason: e.target.value }))} rows={2} placeholder="Kun ved bevisst overstyring: skriv hvorfor kontoen skal videre før kriteriene er komplette." className="mt-1 w-full rounded-lg border border-amber-900/60 bg-slate-950 px-3 py-2 text-sm text-slate-200"/>
          </label>}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">Ansvar & verdi</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-500">Account owner
              <select value={strategy.accountOwnerEmail} onChange={e => setStrategy(s => ({ ...s, accountOwnerEmail: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                {data.assignmentOptions.users.map(user => <option key={user.email} value={user.email}>{user.displayName} · {user.role === "OWNER" ? "Owner" : "Corporate"}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">Strategisk ansvarlig
              <select value={strategy.strategicOwnerEmail} onChange={e => setStrategy(s => ({ ...s, strategicOwnerEmail: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                {data.assignmentOptions.users.map(user => <option key={user.email} value={user.email}>{user.displayName} · {user.role === "OWNER" ? "Owner" : "Corporate"}</option>)}
              </select>
            </label>
            <input type="number" min="0" value={strategy.estimatedValueEur} onChange={e => setStrategy(s => ({ ...s, estimatedValueEur: e.target.value }))} placeholder="Estimert verdi €" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <label className="text-xs text-slate-500">Måldato<input type="date" value={strategy.targetDate} onChange={e => setStrategy(s => ({ ...s, targetDate: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"/></label>
            <label className="text-xs text-slate-500 md:col-span-2">Neste strategigjennomgang<input type="datetime-local" value={strategy.nextReviewAt} onChange={e => setStrategy(s => ({ ...s, nextReviewAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"/></label>
          </div>
          <label className="mt-3 block text-xs text-slate-500">LinkedIn-bevegelse
            <select value={strategy.linkedinMotion} onChange={e => setStrategy(s => ({ ...s, linkedinMotion: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <option value="MANUAL_APPROVAL">LinkedIn: manuell godkjenning</option>
              <option value="RELATIONSHIP_ONLY">LinkedIn: relasjonsbygging</option>
              <option value="OFF">LinkedIn: av</option>
            </select>
          </label>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Nye kontoer får RealtyFlow Owner som standard. Du kan overstyre til en annen aktiv bruker med Corporate-tilgang.</p>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-violet-900/60 bg-violet-950/15 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><BrainCircuit size={19} className="text-violet-300"/><h2 className="font-semibold">Nexus AI Sales Coach</h2></div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Coach på laget for denne kontoen: avdekk problem → få kunden til å bekrefte problemet → presenter relevant løsning → test løsningsaksept → avtal konkret neste steg. Coach lager råd og utkast, men sender ingenting.</p>
        </div>
        <span className="rounded-full border border-violet-800 bg-violet-950 px-3 py-1 text-[11px] font-semibold text-violet-200">Human approved · no auto-send</span>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3">
          <label className="text-xs text-slate-400">Hva vil du ha hjelp til?
            <select value={coachMode} onChange={e => setCoachMode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200">
              <option value="NEXT_STEP">Hva bør jeg gjøre nå?</option>
              <option value="DISCOVERY">Discovery: spørsmål og problemforståelse</option>
              <option value="EMAIL">Analyser e-post og foreslå svar</option>
              <option value="ARGUMENTS">Argumenter og verdihistorie</option>
              <option value="OBJECTION">Håndter innvending</option>
              <option value="MEETING">Forbered møte</option>
            </select>
          </label>
          <textarea value={coachSource} onChange={e => setCoachSource(e.target.value)} rows={8} placeholder="Lim inn kundens e-post, innvending, møtenotat eller annen relevant tekst. La stå tomt for å coache kun på kontoens lagrede data." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm"/>
          <textarea value={coachContext} onChange={e => setCoachContext(e.target.value)} rows={3} placeholder="Din egen kommentar: Hva er du usikker på? Hva vil du oppnå i neste kontakt?" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          <button type="button" onClick={() => void runSalesCoach()} disabled={busy === "coach"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            <MessageSquareText size={16}/>{busy === "coach" ? "Coach analyserer…" : "Kjør Sales Coach"}
          </button>
          {data.coachRuns.length > 0 && <p className="text-[11px] text-slate-500">{data.coachRuns.length} siste coach-kjøringer lagret på kontoen.</p>}
        </div>

        <div className="min-w-0">
          {!coachOutput ? <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">Kjør coachen for å få konto-spesifikke spørsmål, argumenter, akseptsignaler, innvendinger, neste handling og e-postutkast.</div> :
          <div className="space-y-4">
            <div className="rounded-xl border border-violet-800/60 bg-slate-950/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">{coachOutput.currentPhase.replaceAll("_"," ")}</p>
                <span className="text-[11px] text-slate-500">Confidence {coachOutput.confidence}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-200">{coachOutput.summary}</p>
              <p className="mt-3 text-sm font-semibold text-white">Neste beste handling</p>
              <p className="mt-1 text-sm text-cyan-200">{coachOutput.nextBestAction.action}</p>
              <p className="mt-1 text-xs text-slate-500">{coachOutput.nextBestAction.why} · {coachOutput.nextBestAction.channel}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-black uppercase text-amber-300">1–2 · Problem & problemaksept</p>
                <p className="mt-2 text-sm text-slate-200">{coachOutput.problem.hypothesis}</p>
                <p className="mt-3 text-xs font-semibold text-slate-400">Spørsmål</p>
                <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-300">{coachOutput.problem.questions.map(q => <li key={q}>• {q}</li>)}</ul>
                <p className="mt-3 text-xs font-semibold text-slate-400">Tegn på reell problemaksept</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">{coachOutput.problem.acceptanceSignals.map(q => <li key={q}>• {q}</li>)}</ul>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-black uppercase text-emerald-300">3–4 · Løsning & løsningsaksept</p>
                <p className="mt-2 text-sm text-slate-200">{coachOutput.solution.positioning}</p>
                <p className="mt-3 text-xs font-semibold text-slate-400">Argumenter</p>
                <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-300">{coachOutput.solution.arguments.map(q => <li key={q}>• {q}</li>)}</ul>
                <p className="mt-3 text-xs font-semibold text-slate-400">Spørsmål for løsningsaksept</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">{coachOutput.solution.acceptanceQuestions.map(q => <li key={q}>• {q}</li>)}</ul>
              </div>
            </div>

            {coachOutput.objections.length > 0 && <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs font-black uppercase text-rose-300">Innvendinger</p>
              <div className="mt-3 space-y-3">{coachOutput.objections.map(item => <div key={item.objection} className="border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-semibold text-slate-200">{item.objection}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{item.response}</p>
                <p className="mt-1 text-xs text-cyan-300">Spør: {item.followUpQuestion}</p>
              </div>)}</div>
            </div>}

            <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
              <div className="flex items-center gap-2"><Mail size={15} className="text-cyan-300"/><p className="text-xs font-black uppercase text-cyan-300">Forslag til e-post</p></div>
              <p className="mt-3 text-sm font-semibold text-white">{coachOutput.emailDraft.subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-6 text-slate-300">{coachOutput.emailDraft.body}</pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveCoachEmailDraft()} disabled={busy === "coach-email"}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  <Mail size={14}/>{busy === "coach-email" ? "Lagrer…" : "Lagre i E-post / Reach"}
                </button>
                <button type="button" onClick={() => void applyCoachRecommendation()} disabled={!coachRunId || busy === "coach-apply"}
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-700 px-3 py-2 text-xs font-semibold text-violet-200 disabled:opacity-50">
                  <Target size={14}/> {busy === "coach-apply" ? "Oppdaterer strategi…" : "Godkjenn og bruk i kontostrategi"}
                </button>
                <Link href={`/workspace/${encodeURIComponent(brandKey)}?tab=growth&area=email`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300">
                  <ExternalLink size={14}/> Åpne E-post / Reach
                </Link>
              </div>
              <p className="mt-3 text-[11px] text-slate-600">Utkastet er ikke sendt. Lagring oppretter bare et utkast mot en server-godkjent Corporate-mottaker. Ingenting sendes uten eksplisitt handling i E-post / Reach.</p>
              <p className="mt-2 text-[11px] text-violet-300/80">«Godkjenn og bruk» skriver bare coachens hypoteser, akseptmål og neste handling til strategien med audit. Faktisk problem- og løsningsaksept må registreres separat med kundeevidens.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-black uppercase text-emerald-300">Gjør</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">{coachOutput.sellerCoach.do.map(q => <li key={q}>• {q}</li>)}</ul>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-black uppercase text-rose-300">Unngå</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">{coachOutput.sellerCoach.avoid.map(q => <li key={q}>• {q}</li>)}</ul>
              </div>
            </div>
          </div>}
        </div>
      </div>
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><Users size={18} className="text-cyan-300"/> Decision Unit</h2>
            <p className="mt-1 text-xs text-slate-500">Beslutningstakere, påvirkere og mulige champions.</p>
          </div>
          <span className="text-xs text-slate-500">{data.contacts.length} personer</span>
        </div>

        {data.companyProfile.publicRoles.length > 0 && <div className="mt-4 rounded-xl border border-cyan-900/50 bg-cyan-950/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-cyan-200">Offentlige roller</h3>
              <p className="mt-1 text-xs text-slate-500">Daglig leder, kontaktperson og styre fra Brønnøysund/1881. Firmaets sentralbord og e-post kopieres ikke til personen.</p>
            </div>
            <span className="text-xs text-slate-500">{data.companyProfile.publicRoles.length} funnet</span>
          </div>
          <div className="mt-3 grid gap-2">
            {data.companyProfile.publicRoles.slice(0, 10).map(role => {
              const exists = data.contacts.some(contact =>
                contact.name.trim().toLowerCase() === role.name.trim().toLowerCase() &&
                String(contact.title || "").trim().toLowerCase() === role.title.trim().toLowerCase()
              );
              const roleBusy = busy === `role:${role.name}:${role.title}`;
              return <div key={`${role.name}:${role.title}`} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/45 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{role.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{role.title}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{role.sources.join(" + ")}{role.verified ? " · bekreftet av begge" : ""}</p>
                </div>
                <button
                  type="button"
                  disabled={exists || roleBusy}
                  onClick={() => void addPublicRole(role)}
                  className="rounded-lg border border-cyan-800 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:border-slate-800 disabled:text-slate-600"
                >
                  {exists ? "I Decision Unit" : roleBusy ? "Legger til…" : "Legg til"}
                </button>
              </div>;
            })}
          </div>
        </div>}

        <div className="mt-4 space-y-3">
          {data.contacts.map(contact => <article key={contact.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <strong>{contact.name}</strong>
                  {contact.is_primary && <span className="rounded-full bg-cyan-950 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">Primær</span>}
                  {contact.relationship_status === "CHAMPION" && <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Champion</span>}
                </div>
                <p className="mt-1 text-xs text-slate-400">{[contact.title, contact.buying_role, contact.influence_level].filter(Boolean).join(" · ")}</p>
                {contact.professional_relevance && <p className="mt-2 text-sm text-slate-300">{contact.professional_relevance}</p>}
                {contact.professional_topics?.length ? <p className="mt-2 text-xs text-violet-300">Tema: {contact.professional_topics.join(" · ")}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {contact.email && <a href={`mailto:${contact.email}`} className="rounded-lg border border-slate-700 p-2 text-slate-300"><Mail size={14}/></a>}
                {contact.phone && <a href={`tel:${contact.phone}`} className="rounded-lg border border-slate-700 p-2 text-slate-300"><Phone size={14}/></a>}
                {contact.linkedin_url && <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 p-2 text-slate-300"><Linkedin size={14}/></a>}
              </div>
            </div>
          </article>)}
          {!data.contacts.length && <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">Ingen personer er lagt til ennå.</p>}
        </div>

        <div className="mt-5 border-t border-slate-800 pt-5">
          <h3 className="text-sm font-semibold">Legg til person</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={contactForm.name} onChange={e => setContactForm(s => ({ ...s, name: e.target.value }))} placeholder="Navn" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.title} onChange={e => setContactForm(s => ({ ...s, title: e.target.value }))} placeholder="Stilling" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.email} onChange={e => setContactForm(s => ({ ...s, email: e.target.value }))} placeholder="Jobb-e-post" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.phone} onChange={e => setContactForm(s => ({ ...s, phone: e.target.value }))} placeholder="Telefon" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.linkedinUrl} onChange={e => setContactForm(s => ({ ...s, linkedinUrl: e.target.value }))} placeholder="LinkedIn-URL" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.sourceUrl} onChange={e => setContactForm(s => ({ ...s, sourceUrl: e.target.value }))} placeholder="Kilde-URL (1881, bedriftsside, LinkedIn …)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <select value={contactForm.relationshipStatus} onChange={e => setContactForm(s => ({ ...s, relationshipStatus: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {["UNKNOWN","NOT_CONTACTED","CONNECTED","ENGAGED","CHAMPION","BLOCKED"].map(v => <option key={v}>{v}</option>)}
            </select>
            <select value={contactForm.influenceLevel} onChange={e => setContactForm(s => ({ ...s, influenceLevel: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              {["UNKNOWN","LOW","MEDIUM","HIGH","DECISION_MAKER"].map(v => <option key={v}>{v}</option>)}
            </select>
            <input value={contactForm.buyingRole} onChange={e => setContactForm(s => ({ ...s, buyingRole: e.target.value }))} placeholder="Kjøpsrolle: HR, CEO, CFO…" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input value={contactForm.professionalTopics} onChange={e => setContactForm(s => ({ ...s, professionalTopics: e.target.value }))} placeholder="Profesjonelle temaer, komma-separert" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={contactForm.professionalRelevance} onChange={e => setContactForm(s => ({ ...s, professionalRelevance: e.target.value }))} rows={3} placeholder="Hvorfor er denne personen relevant?" className="sm:col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
            <label className="flex items-center gap-2"><input type="checkbox" checked={contactForm.isPrimary} onChange={e => setContactForm(s => ({ ...s, isPrimary: e.target.checked }))}/> Primær kontakt</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={contactForm.linkedinFollowing} onChange={e => setContactForm(s => ({ ...s, linkedinFollowing: e.target.checked }))}/> Følger på LinkedIn</label>
          </div>
          <button type="button" onClick={() => void saveContact()} disabled={busy === "contact"} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">
            <Plus size={15}/>{busy === "contact" ? "Lagrer…" : "Legg til person"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock size={18} className="text-cyan-300"/> Kontaktplan</h2>
          <p className="mt-1 text-xs text-slate-500">Planlegg e-post, LinkedIn, telefon og møter som én koordinert sekvens.</p>
          <div className="mt-4 grid gap-2">
            <select value={touchpoint.contactId} onChange={e => setTouchpoint(s => ({ ...s, contactId: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              <option value="">Hele bedriften</option>
              {data.contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={touchpoint.channel} onChange={e => setTouchpoint(s => ({ ...s, channel: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                {["LINKEDIN","EMAIL","CALL","MEETING","OTHER"].map(v => <option key={v}>{v}</option>)}
              </select>
              <select value={touchpoint.activityType} onChange={e => setTouchpoint(s => ({ ...s, activityType: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                {["FOLLOW_COMPANY","VIEW_PROFILE","CONNECT","PERSONAL_MESSAGE","EMAIL_INTRO","EMAIL_FOLLOWUP","CALL","DISCOVERY_MEETING","SEND_MATERIAL"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <input value={touchpoint.ownerEmail} onChange={e => setTouchpoint(s => ({ ...s, ownerEmail: e.target.value }))} placeholder="Ansvarlig e-post (valgfritt)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <input type="datetime-local" value={touchpoint.dueAt} onChange={e => setTouchpoint(s => ({ ...s, dueAt: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <textarea value={touchpoint.summary} onChange={e => setTouchpoint(s => ({ ...s, summary: e.target.value }))} rows={3} placeholder="Hva skal gjøres / hvilket budskap?" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/>
            <button type="button" onClick={() => void addTouchpoint()} disabled={busy === "touchpoint"} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Plus size={15}/>{busy === "touchpoint" ? "Lagrer…" : "Legg i kontaktplan"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold">Neste aktiviteter</h2>
          <div className="mt-3 space-y-2">
            {upcomingTouchpoints.map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{item.channel} · {item.activity_type}</strong>
                {item.due_at && <span className="text-[11px] text-slate-500">{new Date(item.due_at).toLocaleString("no-NO")}</span>}
              </div>
              {item.summary && <p className="mt-2 text-xs text-slate-300">{item.summary}</p>}
              <button type="button" onClick={() => void completeTouchpoint(item)} disabled={busy === item.id} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                <CheckCircle2 size={13}/>{busy === item.id ? "Oppdaterer…" : "Marker utført"}
              </button>
            </article>)}
            {!upcomingTouchpoints.length && <p className="text-sm text-slate-500">Ingen planlagte aktiviteter ennå.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="font-semibold">Datakilder</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="rounded-lg border border-slate-800 px-3 py-2">
              <div className="flex justify-between gap-3"><span>Brønnøysund</span><span className="text-emerald-300">Åpent API · gratis</span></div>
              <button
                type="button"
                disabled={busy === "brreg" || !prospect.organization_number}
                onClick={() => void runBrregEnrichment()}
                className="mt-2 text-xs font-semibold text-cyan-300 underline disabled:text-slate-600 disabled:no-underline"
              >
                {busy === "brreg" ? "Henter…" : data.companyProfile.providerStatus.brreg.available ? "Oppdater Brønnøysund" : "Hent bedrift + roller"}
              </button>
            </div>
            <div className="rounded-lg border border-slate-800 px-3 py-2">
              <div className="flex justify-between gap-3"><span>1881 API</span><span className={data.enrichmentCapabilities.api1881.configured ? "text-emerald-300" : "text-amber-300"}>{data.enrichmentCapabilities.api1881.configured ? "Koblet" : "API-nøkkel mangler"}</span></div>
              <button
                type="button"
                disabled={!data.enrichmentCapabilities.api1881.configured || busy === "1881"}
                onClick={() => void run1881Enrichment()}
                className="mt-2 text-xs font-semibold text-cyan-300 underline disabled:text-slate-600 disabled:no-underline"
              >
                {busy === "1881" ? "Henter…" : data.companyProfile.providerStatus.api1881.available ? "Oppdater 1881 (bruker 1 søk)" : "Hent fra 1881 (bruker 1 søk)"}
              </button>
            </div>
            <div className="flex justify-between rounded-lg border border-slate-800 px-3 py-2"><span>LinkedIn</span><span className="text-cyan-300">Relasjonskanal</span></div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">LinkedIn brukes ikke til automatisk profilscraping. Persondata skal være offentlig, relevant for B2B-arbeidet og kildebelagt.</p>
        </div>
      </div>
    </section>
  </div>;
}
