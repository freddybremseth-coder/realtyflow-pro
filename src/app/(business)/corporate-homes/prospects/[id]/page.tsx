"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Copy,
  ExternalLink,
  Mail,
  FileText,
  Save,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { corporateOutreachTemplates, personalizeCorporateOutreach } from "@/lib/corporate-outreach";

type Brief = {
  title: string;
  generatedAt: string;
  fit: {
    tier: string;
    score: number;
    reasons: string[];
    gaps: string[];
  };
  company: {
    name: string;
    organizationNumber?: string | null;
    industry?: string | null;
    city?: string | null;
    size: string;
    website?: string | null;
    sourceUrl?: string | null;
    status: string;
    facts: string[];
  };
  workingModel: { label: string; rationale: string };
  assessment: {
    model: string | null;
    budgetMinEur: number | null;
    budgetMaxEur: number | null;
    expectedUsers: number | null;
    usageWeeksPerYear: number | null;
    preferredArea: string | null;
    bedroomsMin: number | null;
    propertyType: string | null;
    ownershipYears: number | null;
    airportMaxMinutes: number | null;
    readyForPropertyMatch: boolean;
  };
  propertyMatchCriteria: string[];
  buyingCommittee: string[];
  discoveryQuestions: string[];
  boardChecklist: Array<{ label: string; status: string; note: string }>;
  nextStep: string;
  guardrails: string[];
};

type Prospect = {
  id: string;
  converted_contact_id?: string | null;
  status?: string | null;
  evidence?: Record<string, unknown> | null;
};

export default function CorporateProspectBriefPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [brief, setBrief] = useState<Brief | null>(null);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [contacts, setContacts] = useState<Array<Record<string, any>>>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("initial");
  const [copyNotice, setCopyNotice] = useState("");
  const [contactLogging, setContactLogging] = useState(false);
  const [contactLogNotice, setContactLogNotice] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingMethod, setMeetingMethod] = useState("video");
  const [schedulingMeeting, setSchedulingMeeting] = useState(false);
  const [meetingNotice, setMeetingNotice] = useState("");
  const [opportunityPromoting, setOpportunityPromoting] = useState(false);
  const [opportunityNotice, setOpportunityNotice] = useState("");
  const [decisionPack, setDecisionPack] = useState<Record<string, any> | null>(null);
  const [buildingDecisionPack, setBuildingDecisionPack] = useState(false);
  const [decisionPackNotice, setDecisionPackNotice] = useState("");
  const [decisionOutcome, setDecisionOutcome] = useState<Record<string, any> | null>(null);
  const [decisionOutcomeType, setDecisionOutcomeType] = useState("APPROVE_VIEWINGS");
  const [decisionPropertyRef, setDecisionPropertyRef] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [savingDecisionOutcome, setSavingDecisionOutcome] = useState(false);
  const [decisionOutcomeNotice, setDecisionOutcomeNotice] = useState("");
  const [executionPlan, setExecutionPlan] = useState<Record<string, any> | null>(null);
  const [buildingExecutionPlan, setBuildingExecutionPlan] = useState(false);
  const [executionPlanNotice, setExecutionPlanNotice] = useState("");
  const [confirmedOutcome, setConfirmedOutcome] = useState<Record<string, any> | null>(null);
  const [confirmedPropertyRef, setConfirmedPropertyRef] = useState("");
  const [confirmedOccurredAt, setConfirmedOccurredAt] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [confirmedOfferAmount, setConfirmedOfferAmount] = useState("");
  const [confirmedOutcomeNote, setConfirmedOutcomeNote] = useState("");
  const [recordingConfirmedOutcome, setRecordingConfirmedOutcome] = useState(false);
  const [confirmedOutcomeNotice, setConfirmedOutcomeNotice] = useState("");
  const [promotingCrm, setPromotingCrm] = useState(false);
  const [crmNotice, setCrmNotice] = useState("");
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [assessmentNotice, setAssessmentNotice] = useState("");
  const [matchingProperties, setMatchingProperties] = useState<Array<Record<string, any>>>([]);
  const [matching, setMatching] = useState(false);
  const [matchNotice, setMatchNotice] = useState("");
  const [assessment, setAssessment] = useState({
    model: "",
    budget_min_eur: "",
    budget_max_eur: "",
    expected_users: "",
    usage_weeks_per_year: "",
    preferred_area: "Costa Blanca / åpen for forslag",
    bedrooms_min: "3",
    property_type: "Leilighet eller villa",
    ownership_years: "10",
    airport_max_minutes: "60",
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/brief`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke hente beslutningsgrunnlaget.");
      setBrief(body?.brief || null);
      setProspect(body?.prospect || null);
      const savedDecisionPack = body?.prospect?.evidence?.corporate_decision_pack;
      if (savedDecisionPack && typeof savedDecisionPack === "object") setDecisionPack(savedDecisionPack);
      const savedDecisionOutcome = body?.prospect?.evidence?.corporate_decision_outcome;
      if (savedDecisionOutcome && typeof savedDecisionOutcome === "object") {
        setDecisionOutcome(savedDecisionOutcome);
        if (savedDecisionOutcome.outcome) setDecisionOutcomeType(String(savedDecisionOutcome.outcome));
        if (savedDecisionOutcome.selected_property_ref) setDecisionPropertyRef(String(savedDecisionOutcome.selected_property_ref));
        if (savedDecisionOutcome.note) setDecisionNote(String(savedDecisionOutcome.note));
      }
      const savedExecutionPlan = body?.prospect?.evidence?.corporate_execution_plan;
      if (savedExecutionPlan && typeof savedExecutionPlan === "object") {
        setExecutionPlan(savedExecutionPlan);
        if (savedExecutionPlan.kind === "VIEWING_PLAN" && Array.isArray(savedExecutionPlan.properties) && savedExecutionPlan.properties[0]?.ref) {
          setConfirmedPropertyRef(String(savedExecutionPlan.properties[0].ref));
        }
        if (savedExecutionPlan.kind === "OFFER_PREP" && savedExecutionPlan.property?.ref) {
          setConfirmedPropertyRef(String(savedExecutionPlan.property.ref));
        }
      }
      const savedConfirmedOutcome = body?.prospect?.evidence?.latest_corporate_confirmed_outcome;
      if (savedConfirmedOutcome && typeof savedConfirmedOutcome === "object") setConfirmedOutcome(savedConfirmedOutcome);
      const savedPropertyMatch = body?.prospect?.evidence?.corporate_property_match;
      if (savedPropertyMatch && typeof savedPropertyMatch === "object" && Array.isArray(savedPropertyMatch.shortlist)) {
        setMatchingProperties(savedPropertyMatch.shortlist);
        setMatchNotice(savedPropertyMatch.shortlist.length
          ? `Lagret intern shortlist: ${savedPropertyMatch.shortlist.length} boliger.`
          : "");
      }
      const savedMeeting = body?.prospect?.evidence?.corporate_meeting;
      if (savedMeeting && typeof savedMeeting === "object" && savedMeeting.scheduled_at) {
        const scheduled = new Date(String(savedMeeting.scheduled_at));
        if (!Number.isNaN(scheduled.getTime())) {
          const local = new Date(scheduled.getTime() - scheduled.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16);
          setMeetingAt(local);
        }
        if (savedMeeting.method) setMeetingMethod(String(savedMeeting.method));
      }
      const savedAssessment = body?.prospect?.evidence?.corporate_assessment;
      if (savedAssessment && typeof savedAssessment === "object") {
        setAssessment((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(savedAssessment).map(([key, value]) => [key, value == null ? "" : String(value)]),
          ),
        }));
      }
      setContacts(body?.contacts || []);
      setWarnings(body?.warnings || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente beslutningsgrunnlaget.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const verifiedContacts = useMemo(
    () => contacts.filter((contact) => ["VERIFIED", "CONTACT_READY"].includes(String(contact.status || "").toUpperCase())),
    [contacts],
  );

  const primaryContact = useMemo(
    () => verifiedContacts.find((contact) => contact.is_primary) || verifiedContacts[0] || null,
    [verifiedContacts],
  );

  const genericCompanyContact = useMemo(() => {
    const evidence = prospect?.evidence && typeof prospect.evidence === "object" ? prospect.evidence : {};
    const contact = (evidence as Record<string, any>).generic_company_contact;
    return contact && typeof contact === "object"
      ? {
          genericEmail: String(contact.generic_email || "").trim() || null,
          contactPageUrl: String(contact.contact_page_url || "").trim() || null,
          checkedAt: String(contact.checked_at || "").trim() || null,
        }
      : { genericEmail: null, contactPageUrl: null, checkedAt: null };
  }, [prospect?.evidence]);

  const companyName = brief?.company.name || "";

  const outreach = useMemo(() => {
    const template = corporateOutreachTemplates.find((item) => item.key === selectedTemplate) || corporateOutreachTemplates[0];
    const firstName = String(primaryContact?.name || "").trim().split(/\s+/)[0] || null;
    return personalizeCorporateOutreach(template, { firstName, companyName });
  }, [companyName, primaryContact, selectedTemplate]);

  const opportunityUiReady = useMemo(() => {
    if (String(prospect?.status || "").toUpperCase() !== "MEETING") return false;
    if (!brief?.assessment.readyForPropertyMatch || !meetingAt) return false;
    const meetingTime = Date.parse(meetingAt);
    return Number.isFinite(meetingTime) && meetingTime <= Date.now();
  }, [brief?.assessment.readyForPropertyMatch, meetingAt, prospect?.status]);

  async function copyOutreach() {
    const text = `Emne: ${outreach.subject}\n\n${outreach.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice("Kopiert til utklippstavlen.");
      window.setTimeout(() => setCopyNotice(""), 2200);
    } catch {
      setCopyNotice("Kunne ikke kopiere automatisk.");
    }
  }

  async function logManualCompanyContact() {
    const method = genericCompanyContact.genericEmail
      ? "generic_email"
      : genericCompanyContact.contactPageUrl
        ? "contact_form"
        : null;

    if (!method) {
      setContactLogNotice("Ingen offisiell selskapskanal er registrert.");
      return;
    }

    const confirmed = window.confirm(
      "Bekreft kun etter at du selv har sendt eller levert henvendelsen. RealtyFlow sender ingenting fra denne handlingen.",
    );
    if (!confirmed) return;

    setContactLogging(true);
    setContactLogNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/contact-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          template_key: selectedTemplate,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke loggføre manuell kontakt.");
      setProspect(body?.prospect || prospect);
      setContactLogNotice("Manuell kontakt er loggført. Ingen melding ble sendt av RealtyFlow.");
      await load();
    } catch (contactError) {
      setError(contactError instanceof Error ? contactError.message : "Kunne ikke loggføre manuell kontakt.");
    } finally {
      setContactLogging(false);
    }
  }

  async function scheduleDiscoveryMeeting() {
    if (!meetingAt) {
      setMeetingNotice("Velg dato og klokkeslett først.");
      return;
    }

    setSchedulingMeeting(true);
    setMeetingNotice("");
    setError("");
    try {
      const scheduledAt = new Date(meetingAt);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Ugyldig møtetidspunkt.");
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/meeting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_at: scheduledAt.toISOString(),
          method: meetingMethod,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke registrere discovery-møtet.");
      setProspect(body?.prospect || prospect);
      setMeetingNotice("Discovery-møtet er registrert internt. Ingen invitasjon eller melding ble sendt.");
      await load();
    } catch (meetingError) {
      setError(meetingError instanceof Error ? meetingError.message : "Kunne ikke registrere discovery-møtet.");
    } finally {
      setSchedulingMeeting(false);
    }
  }

  async function promoteToOpportunity() {
    if (!opportunityUiReady) {
      setOpportunityNotice("Discovery må være gjennomført og assessment må være komplett først.");
      return;
    }

    const confirmed = window.confirm(
      "Bekreft at discovery-møtet er gjennomført og de viktigste kommersielle kriteriene er dokumentert. Dette flytter prospektet til Opportunity, men sender ingenting til kunden.",
    );
    if (!confirmed) return;

    setOpportunityPromoting(true);
    setOpportunityNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/opportunity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke opprette Opportunity.");
      setProspect(body?.prospect || prospect);
      setOpportunityNotice("Discovery er fullført og prospektet er flyttet til Opportunity. Ingen kundemelding ble sendt.");
      await load();
    } catch (opportunityError) {
      setError(opportunityError instanceof Error ? opportunityError.message : "Kunne ikke opprette Opportunity.");
    } finally {
      setOpportunityPromoting(false);
    }
  }

  async function buildDecisionPack() {
    setBuildingDecisionPack(true);
    setDecisionPackNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/decision-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke bygge Corporate Decision Pack.");
      setDecisionPack(body?.decisionPack || null);
      setDecisionPackNotice("Beslutningspakken er lagret internt. Den er ikke delt med kunden.");
      await load();
    } catch (packError) {
      setError(packError instanceof Error ? packError.message : "Kunne ikke bygge Corporate Decision Pack.");
    } finally {
      setBuildingDecisionPack(false);
    }
  }

  async function saveDecisionOutcome() {
    if (!decisionPack) {
      setDecisionOutcomeNotice("Bygg Decision Pack først.");
      return;
    }
    if (decisionOutcomeType === "APPROVE_OFFER_PREP" && !decisionPropertyRef) {
      setDecisionOutcomeNotice("Velg bolig før tilbudsforberedelse godkjennes.");
      return;
    }

    const confirmed = window.confirm(
      "Registrer dette som internt styre-/lederutfall? RealtyFlow sender ingen kundemelding, oppretter ingen kalenderavtale og sender ingen reservasjon eller tilbud.",
    );
    if (!confirmed) return;

    setSavingDecisionOutcome(true);
    setDecisionOutcomeNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/decision-outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: decisionOutcomeType,
          selected_property_ref: decisionOutcomeType === "APPROVE_OFFER_PREP" ? decisionPropertyRef : null,
          note: decisionNote || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke registrere beslutningsutfallet.");
      setDecisionOutcome(body?.outcome || null);
      setProspect(body?.prospect || prospect);
      setDecisionOutcomeNotice("Internt beslutningsutfall er registrert. Ingen ekstern handling ble utført.");
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Kunne ikke registrere beslutningsutfallet.");
    } finally {
      setSavingDecisionOutcome(false);
    }
  }

  async function buildExecutionPlan() {
    if (!decisionOutcome || !["APPROVE_VIEWINGS", "APPROVE_OFFER_PREP"].includes(String(decisionOutcome.outcome || ""))) {
      setExecutionPlanNotice("Registrer først en beslutning om visning eller tilbudsforberedelse.");
      return;
    }

    setBuildingExecutionPlan(true);
    setExecutionPlanNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/execution-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke bygge gjennomføringsplan.");
      setExecutionPlan(body?.executionPlan || null);
      setProspect(body?.prospect || prospect);
      setExecutionPlanNotice("Intern gjennomføringsplan er bygget. Ingen booking, tilbud eller reservasjon ble sendt.");
      await load();
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : "Kunne ikke bygge gjennomføringsplan.");
    } finally {
      setBuildingExecutionPlan(false);
    }
  }

  async function recordConfirmedOutcome() {
    if (!executionPlan) {
      setConfirmedOutcomeNotice("Bygg gjennomføringsplan først.");
      return;
    }
    if (!prospect?.converted_contact_id) {
      setConfirmedOutcomeNotice("Prospektet må promoteres til Zen Eco Homes CRM før et bekreftet Revenue Outcome kan registreres.");
      return;
    }

    const type = executionPlan.kind === "VIEWING_PLAN" ? "VIEWING_COMPLETED" : "OFFER_MADE";
    if (!confirmedPropertyRef) {
      setConfirmedOutcomeNotice("Velg bolig først.");
      return;
    }

    const confirmed = window.confirm(
      type === "VIEWING_COMPLETED"
        ? "Bekreft bare dersom visningen faktisk er gjennomført. Dette registrerer et kanonisk Revenue Outcome og flytter CRM-kontakten til VIEWING. RealtyFlow sender ingenting."
        : "Bekreft bare dersom et faktisk tilbud/bud allerede er gitt. Dette registrerer et kanonisk Revenue Outcome og flytter CRM-kontakten til NEGOTIATION. RealtyFlow sender ikke tilbudet.",
    );
    if (!confirmed) return;

    setRecordingConfirmedOutcome(true);
    setConfirmedOutcomeNotice("");
    setError("");
    try {
      const occurred = new Date(confirmedOccurredAt);
      if (Number.isNaN(occurred.getTime())) throw new Error("Ugyldig tidspunkt.");
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/confirmed-outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          property_ref: confirmedPropertyRef,
          occurred_at: occurred.toISOString(),
          offer_amount_eur: type === "OFFER_MADE" && confirmedOfferAmount ? Number(confirmedOfferAmount) : null,
          note: confirmedOutcomeNote || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke registrere bekreftet Revenue Outcome.");
      setConfirmedOutcome(body?.outcome || null);
      setProspect(body?.prospect || prospect);
      setConfirmedOutcomeNotice(
        type === "VIEWING_COMPLETED"
          ? "Fullført visning er registrert i Revenue OS og CRM står nå i VIEWING."
          : "Faktisk tilbud er registrert i Revenue OS og CRM står nå i NEGOTIATION.",
      );
      setConfirmedOutcomeNote("");
      await load();
    } catch (outcomeError) {
      setError(outcomeError instanceof Error ? outcomeError.message : "Kunne ikke registrere bekreftet Revenue Outcome.");
    } finally {
      setRecordingConfirmedOutcome(false);
    }
  }

  async function promoteProspectToCrm() {
    setPromotingCrm(true);
    setCrmNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/promote`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke legge prospektet i CRM.");
      if (body?.prospect) setProspect(body.prospect);
      setCrmNotice("Prospektet er koblet til Zen Eco Homes CRM. Automatisk nurture er fortsatt pauset.");
      await load();
    } catch (promotionError) {
      setError(promotionError instanceof Error ? promotionError.message : "Kunne ikke legge prospektet i CRM.");
    } finally {
      setPromotingCrm(false);
    }
  }

  async function loadPropertyMatch() {
    setMatching(true);
    setMatchNotice("");
    setError("");
    try {
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}/property-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lage boligshortlist.");
      setMatchingProperties(body?.properties || []);
      setMatchNotice(body?.persistedShortlist?.length
        ? `Topp ${body.persistedShortlist.length} er lagret internt. ${body.properties.length} kandidater ble vurdert.`
        : body?.properties?.length
          ? `${body.properties.length} aktuelle boliger funnet.`
          : "Ingen boliger traff kriteriene godt nok.");
    } catch (matchError) {
      setMatchingProperties([]);
      setError(matchError instanceof Error ? matchError.message : "Kunne ikke lage boligshortlist.");
    } finally {
      setMatching(false);
    }
  }

  async function saveAssessment() {
    if (!prospect) return;
    setSavingAssessment(true);
    setAssessmentNotice("");
    setError("");
    try {
      const currentEvidence = prospect.evidence && typeof prospect.evidence === "object" ? prospect.evidence : {};
      const normalizedAssessment = {
        model: assessment.model || null,
        budget_min_eur: assessment.budget_min_eur ? Number(assessment.budget_min_eur) : null,
        budget_max_eur: assessment.budget_max_eur ? Number(assessment.budget_max_eur) : null,
        expected_users: assessment.expected_users ? Number(assessment.expected_users) : null,
        usage_weeks_per_year: assessment.usage_weeks_per_year ? Number(assessment.usage_weeks_per_year) : null,
        preferred_area: assessment.preferred_area || null,
        bedrooms_min: assessment.bedrooms_min ? Number(assessment.bedrooms_min) : null,
        property_type: assessment.property_type || null,
        ownership_years: assessment.ownership_years ? Number(assessment.ownership_years) : null,
        airport_max_minutes: assessment.airport_max_minutes ? Number(assessment.airport_max_minutes) : null,
        updated_at: new Date().toISOString(),
      };
      const response = await fetch(`/api/corporate-homes/prospects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidence: { ...currentEvidence, corporate_assessment: normalizedAssessment },
          next_action: "Bruk Corporate Home Assessment til å lage konkret boligshortlist.",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Kunne ikke lagre bedriftsvurderingen.");
      setAssessmentNotice("Bedriftsvurderingen er lagret.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre bedriftsvurderingen.");
    } finally {
      setSavingAssessment(false);
    }
  }

  if (loading || !brief) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        {error ? (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Loader2 size={16} className="animate-spin" /> Henter Corporate Homes-dossier …</div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Link href="/corporate-homes/prospects" className="mb-3 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
              <ArrowLeft size={14} /> Prospektmotor
            </Link>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              <FileText size={16} /> Corporate Homes beslutningsgrunnlag
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{brief.company.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-teal-50 px-3 py-1.5 font-black text-teal-900">Fit {brief.fit.tier} · {brief.fit.score}/100</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{brief.company.status}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{brief.company.size}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {prospect?.converted_contact_id ? (
              <Link href={`/customers?contactId=${encodeURIComponent(prospect.converted_contact_id)}&tab=all`} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-900">
                <CheckCircle2 size={16} /> Åpne CRM
              </Link>
            ) : (
              <button
                onClick={() => void promoteProspectToCrm()}
                disabled={promotingCrm}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2.5 text-sm font-bold text-cyan-900 disabled:opacity-50"
              >
                {promotingCrm ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                Legg i CRM
              </button>
            )}
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
              <RefreshCw size={16} /> Oppdater
            </button>
          </div>
        </div>
      </header>

      {warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{warning}</div>)}
      {crmNotice && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{crmNotice}</div>}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <Building2 size={16} /> Dokumenterte fakta
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {brief.company.facts.map((fact) => <div key={fact} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800">{fact}</div>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            {brief.company.website && <a href={brief.company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-800 hover:underline">Nettsted <ExternalLink size={14} /></a>}
            {brief.company.sourceUrl && <a href={brief.company.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-800 hover:underline">Registerkilde <ExternalLink size={14} /></a>}
          </div>
          {(genericCompanyContact.genericEmail || genericCompanyContact.contactPageUrl) && (
            <div className="mt-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-cyan-900">Offisiell selskapskontakt</div>
              {genericCompanyContact.genericEmail && (
                <div className="mt-2 break-all text-sm font-bold text-slate-900">{genericCompanyContact.genericEmail}</div>
              )}
              {genericCompanyContact.contactPageUrl && (
                <a href={genericCompanyContact.contactPageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
                  Åpne kontaktside <ExternalLink size={12} />
                </a>
              )}
              <div className="mt-2 text-xs text-slate-500">Kun selskapsnivå. Ingen personlig kontakt er lagt til.</div>
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">Arbeidsmodell</div>
          <h2 className="mt-2 text-2xl font-black">{brief.workingModel.label}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{brief.workingModel.rationale}</p>
          <div className="mt-6 rounded-2xl bg-white/5 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Neste steg</div>
            <p className="mt-2 text-sm leading-6 text-slate-100">{brief.nextStep}</p>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <CheckCircle2 size={16} /> Hvorfor den matcher
          </div>
          <div className="mt-4 space-y-2">
            {brief.fit.reasons.length ? brief.fit.reasons.map((reason) => <div key={reason} className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-950">{reason}</div>) : <p className="text-sm text-slate-500">Ingen dokumenterte fit-signaler ennå.</p>}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800">
            <CircleHelp size={16} /> Må avklares
          </div>
          <div className="mt-4 space-y-2">
            {brief.fit.gaps.length ? brief.fit.gaps.map((gap) => <div key={gap} className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-950">{gap}</div>) : <p className="text-sm text-slate-500">Ingen store datagap registrert.</p>}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
            <Users size={16} /> Buying committee
          </div>
          <div className="mt-4 space-y-2">
            {brief.buyingCommittee.map((role) => <div key={role} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800">{role}</div>)}
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><UserRound size={14} /> Verifiserte kontakter</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{verifiedContacts.length}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Persondata legges bare til via godkjent eller manuelt verifisert kilde.</p>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Discovery-møte</div>
          <h2 className="mt-2 text-xl font-black text-slate-950">Spørsmål som må besvares før boligmatching</h2>
          <ol className="mt-5 space-y-3">
            {brief.discoveryQuestions.map((question, index) => (
              <li key={question} className="flex gap-3 rounded-2xl border border-slate-200 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-800 text-xs font-black text-white">{index + 1}</span>
                <span className="text-sm leading-6 text-slate-700">{question}</span>
              </li>
            ))}
          </ol>
        </article>
      </section>

      {["ENGAGED", "MEETING"].includes(String(prospect?.status || "").toUpperCase()) && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-900">
            <CalendarClock size={16} /> Discovery-møte
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-950">
            {String(prospect?.status || "").toUpperCase() === "MEETING" ? "Oppdater avtalt møte" : "Registrer avtalt discovery-møte"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Dette er kun intern registrering i Corporate-pipelinen. RealtyFlow sender ingen kalenderinvitasjon,
            e-post eller annen melding fra denne handlingen.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_.7fr_auto] md:items-end">
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              Dato og klokkeslett
              <input
                type="datetime-local"
                value={meetingAt}
                onChange={(event) => setMeetingAt(event.target.value)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              Møteform
              <select
                value={meetingMethod}
                onChange={(event) => setMeetingMethod(event.target.value)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
              >
                <option value="video">Videomøte</option>
                <option value="phone">Telefon</option>
                <option value="in_person">Fysisk møte</option>
              </select>
            </label>
            <button
              onClick={() => void scheduleDiscoveryMeeting()}
              disabled={schedulingMeeting || !meetingAt}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {schedulingMeeting ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
              {String(prospect?.status || "").toUpperCase() === "MEETING" ? "Oppdater møte" : "Registrer møte"}
            </button>
          </div>
          {meetingNotice && <div className="mt-3 text-xs font-bold text-emerald-900">{meetingNotice}</div>}

          {String(prospect?.status || "").toUpperCase() === "MEETING" && (
            <div className="mt-5 rounded-2xl border border-emerald-300 bg-white p-4">
              <div className="text-xs font-black uppercase tracking-wide text-emerald-900">Opportunity gate</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {opportunityUiReady
                  ? "Møtet er gjennomført og minimumskriteriene er dokumentert. Prospektet kan løftes til en aktiv Opportunity."
                  : brief.assessment.readyForPropertyMatch
                    ? "Assessment er komplett, men registrert møtetid må være passert før discovery kan markeres fullført."
                    : "Fyll ut budsjett, forventede brukere, bruksuker, område, minimum soverom og boligtype før Opportunity."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void promoteToOpportunity()}
                  disabled={opportunityPromoting || !opportunityUiReady}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {opportunityPromoting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Discovery fullført · opprett Opportunity
                </button>
                {opportunityNotice && <span className="text-xs font-bold text-emerald-900">{opportunityNotice}</span>}
                <span className="text-xs text-slate-500">Kun intern pipeline-endring. Ingen automatisk kundekontakt.</span>
              </div>
            </div>
          )}
        </section>
      )}

      {String(prospect?.status || "").toUpperCase() === "OPPORTUNITY" && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-900">Corporate Decision Pack</div>
              <h2 className="mt-2 text-xl font-black text-slate-950">Gjør Opportunity beslutningsklar</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                Samler discovery, lagret topp-5 shortlist, enkle interne nøkkeltall og styre-/lederchecklist.
                Pakken er kun internt arbeidsgrunnlag og deles aldri automatisk.
              </p>
            </div>
            <button
              onClick={() => void buildDecisionPack()}
              disabled={buildingDecisionPack || !matchingProperties.length}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {buildingDecisionPack ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {decisionPack ? "Oppdater Decision Pack" : "Bygg Decision Pack"}
            </button>
          </div>
          {!matchingProperties.length && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
              Lagre boligshortlisten først. Decision Pack bruker den kvalitetssikrede interne topp-5-listen.
            </div>
          )}
          {decisionPackNotice && <div className="mt-3 text-xs font-bold text-emerald-900">{decisionPackNotice}</div>}
          {decisionPack && (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-white p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Boligkandidater</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{decisionPack.shortlist?.length || 0}</div>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Topp pris</div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {decisionPack.economics?.basis_property_price_eur ? `€${Number(decisionPack.economics.basis_property_price_eur).toLocaleString("nb-NO")}` : "—"}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Budsjettmargin</div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {decisionPack.economics?.budget_headroom_eur !== null && decisionPack.economics?.budget_headroom_eur !== undefined
                    ? `€${Number(decisionPack.economics.budget_headroom_eur).toLocaleString("nb-NO")}`
                    : "—"}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Styrepunkter</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{decisionPack.board_case?.length || 0}</div>
              </div>
            </div>
          )}
          {decisionPack && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="text-xs font-black uppercase tracking-wide text-emerald-900">Styre-/lederutfall</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Registrer hva som faktisk er besluttet. Dette oppretter kun intern neste handling og arbeidsoppgave.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                  Beslutning
                  <select
                    value={decisionOutcomeType}
                    onChange={(event) => setDecisionOutcomeType(event.target.value)}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                  >
                    <option value="APPROVE_VIEWINGS">Gå videre til visningsplan</option>
                    <option value="APPROVE_OFFER_PREP">Forbered tilbud på valgt bolig</option>
                    <option value="NEEDS_CHANGES">Decision Pack må revideres</option>
                    <option value="HOLD">Sett Opportunity på hold</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                  Valgt bolig
                  <select
                    value={decisionPropertyRef}
                    onChange={(event) => setDecisionPropertyRef(event.target.value)}
                    disabled={decisionOutcomeType !== "APPROVE_OFFER_PREP"}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
                  >
                    <option value="">Velg fra Decision Pack</option>
                    {(decisionPack.shortlist || []).map((property: Record<string, any>) => (
                      <option key={String(property.ref)} value={String(property.ref)}>
                        {property.ref} · {property.title || property.location || "Bolig"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                  Intern merknad
                  <input
                    value={decisionNote}
                    onChange={(event) => setDecisionNote(event.target.value)}
                    placeholder="Valgfri begrunnelse eller forbehold"
                    className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void saveDecisionOutcome()}
                  disabled={savingDecisionOutcome}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {savingDecisionOutcome ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Registrer beslutning
                </button>
                {decisionOutcomeNotice && <span className="text-xs font-bold text-emerald-900">{decisionOutcomeNotice}</span>}
              </div>
              {decisionOutcome && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                  Sist registrert: <strong>{decisionOutcome.label || decisionOutcome.outcome}</strong>
                  {decisionOutcome.selected_property_ref ? ` · bolig ${decisionOutcome.selected_property_ref}` : ""}
                </div>
              )}
              {decisionOutcome && ["APPROVE_VIEWINGS", "APPROVE_OFFER_PREP"].includes(String(decisionOutcome.outcome || "")) && (
                <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wide text-cyan-900">Neste interne steg</div>
                      <p className="mt-1 text-sm text-slate-700">
                        {String(decisionOutcome.outcome) === "APPROVE_VIEWINGS"
                          ? "Lag preflight og rekkefølge for de godkjente visningskandidatene."
                          : "Lag tilbudspreflight for den valgte boligen før pris, reservasjon eller tilbud diskuteres eksternt."}
                      </p>
                    </div>
                    <button
                      onClick={() => void buildExecutionPlan()}
                      disabled={buildingExecutionPlan}
                      className="inline-flex items-center gap-2 rounded-xl bg-cyan-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {buildingExecutionPlan ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                      {executionPlan ? "Oppdater gjennomføringsplan" : "Bygg gjennomføringsplan"}
                    </button>
                  </div>
                  {executionPlanNotice && <div className="mt-3 text-xs font-bold text-cyan-950">{executionPlanNotice}</div>}
                  {executionPlan && (
                    <div className="mt-4 rounded-xl bg-white p-4">
                      <div className="text-sm font-black text-slate-950">
                        {executionPlan.kind === "VIEWING_PLAN" ? "Intern visningsplan" : "Intern tilbudspreflight"}
                      </div>
                      {executionPlan.kind === "VIEWING_PLAN" ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {(executionPlan.properties || []).map((property: Record<string, any>) => (
                            <div key={String(property.ref)} className="rounded-xl border border-slate-200 p-3">
                              <div className="text-xs font-black text-slate-500">#{property.order} · {property.ref}</div>
                              <div className="mt-1 text-sm font-bold text-slate-950">{property.title || property.location || "Bolig"}</div>
                              <div className="mt-1 text-xs text-slate-600">{property.preflight?.length || 0} kontrollpunkter før visning</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-slate-700">
                          Valgt bolig: <strong>{executionPlan.property?.ref}</strong> · {executionPlan.preflight?.length || 0} obligatoriske preflight-punkter.
                        </div>
                      )}
                    </div>
                  )}
                  {executionPlan && (
                    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                      <div className="text-xs font-black uppercase tracking-wide text-violet-900">Bekreftet kommersielt outcome</div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Registrer kun noe som faktisk har skjedd. Da kobles Corporate-caset til Revenue OS og vanlig CRM-pipeline.
                      </p>
                      {!prospect?.converted_contact_id ? (
                        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
                          Prospektet må ligge i Zen Eco Homes CRM før outcome registreres.
                          <button
                            onClick={() => void promoteProspectToCrm()}
                            disabled={promotingCrm}
                            className="ml-2 inline-flex items-center gap-1 rounded-lg bg-amber-900 px-2.5 py-1.5 font-bold text-white disabled:opacity-50"
                          >
                            {promotingCrm ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                            Legg i CRM nå
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                              Bolig
                              {executionPlan.kind === "VIEWING_PLAN" ? (
                                <select
                                  value={confirmedPropertyRef}
                                  onChange={(event) => setConfirmedPropertyRef(event.target.value)}
                                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                                >
                                  {(executionPlan.properties || []).map((property: Record<string, any>) => (
                                    <option key={String(property.ref)} value={String(property.ref)}>
                                      {property.ref} · {property.title || property.location || "Bolig"}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={confirmedPropertyRef}
                                  readOnly
                                  className="h-10 rounded-xl border border-slate-300 bg-slate-100 px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                                />
                              )}
                            </label>
                            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                              Faktisk tidspunkt
                              <input
                                type="datetime-local"
                                value={confirmedOccurredAt}
                                onChange={(event) => setConfirmedOccurredAt(event.target.value)}
                                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                              />
                            </label>
                            {executionPlan.kind === "OFFER_PREP" && (
                              <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                                Tilbudsbeløp EUR · valgfritt
                                <input
                                  type="number"
                                  value={confirmedOfferAmount}
                                  onChange={(event) => setConfirmedOfferAmount(event.target.value)}
                                  placeholder="475000"
                                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                                />
                              </label>
                            )}
                            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
                              Kort dokumentasjon
                              <input
                                value={confirmedOutcomeNote}
                                onChange={(event) => setConfirmedOutcomeNote(event.target.value)}
                                placeholder="Valgfritt notat"
                                className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
                              />
                            </label>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                              onClick={() => void recordConfirmedOutcome()}
                              disabled={recordingConfirmedOutcome}
                              className="inline-flex items-center gap-2 rounded-xl bg-violet-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                            >
                              {recordingConfirmedOutcome ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                              {executionPlan.kind === "VIEWING_PLAN" ? "Loggfør fullført visning" : "Loggfør faktisk tilbud gitt"}
                            </button>
                            {confirmedOutcomeNotice && <span className="text-xs font-bold text-violet-950">{confirmedOutcomeNotice}</span>}
                          </div>
                        </>
                      )}
                      {confirmedOutcome && (
                        <div className="mt-4 rounded-xl bg-white p-3 text-sm text-slate-700">
                          Sist bekreftet: <strong>{confirmedOutcome.event_type || confirmedOutcome.type}</strong>
                          {confirmedOutcome.property_ref ? ` · ${confirmedOutcome.property_ref}` : ""}
                          {confirmedOutcome.crm_pipeline_status ? ` · CRM ${confirmedOutcome.crm_pipeline_status}` : ""}
                        </div>
                      )}
                      {confirmedOutcome && prospect?.converted_contact_id && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href="/closing"
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
                          >
                            <ArrowLeft size={16} className="rotate-180" /> Fortsett i Closing
                          </Link>
                          <Link
                            href={`/customers?contactId=${encodeURIComponent(prospect.converted_contact_id)}&tab=all`}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800"
                          >
                            <Users size={16} /> Åpne CRM-kunde
                          </Link>
                        </div>
                      )}
                      <div className="mt-3 text-xs text-slate-600">
                        Dette er logging av en allerede utført menneskelig handling. Ingen e-post, kalenderbooking, tilbud, reservasjon eller betaling utføres av RealtyFlow.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="mt-3 text-xs text-slate-600">
            Ingen kundedeling · ingen automatisk utsendelse · ingen kalenderbooking eller tilbud/reservasjon · skatt, juridisk struktur og drift krever separat kvalitetssikring.
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Corporate Home Assessment</div>
            <h2 className="mt-2 text-xl font-black text-slate-950">Gjør prospektet klart for boligmatching</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Lagre de viktigste kommersielle kriteriene fra discovery. Når kjernefeltene er på plass kan dossieret
              brukes som bestilling til en konkret boligshortlist.
            </p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-black ${brief.assessment.readyForPropertyMatch ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
            {brief.assessment.readyForPropertyMatch ? "Klar for boligmatch" : "Trenger flere kriterier"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AssessmentInput label="Budsjett fra EUR" type="number" value={assessment.budget_min_eur} onChange={(value) => setAssessment((row) => ({ ...row, budget_min_eur: value }))} placeholder="300000" />
          <AssessmentInput label="Budsjett til EUR" type="number" value={assessment.budget_max_eur} onChange={(value) => setAssessment((row) => ({ ...row, budget_max_eur: value }))} placeholder="600000" />
          <AssessmentInput label="Forventede brukere" type="number" value={assessment.expected_users} onChange={(value) => setAssessment((row) => ({ ...row, expected_users: value }))} placeholder="50" />
          <AssessmentInput label="Bruksuker per år" type="number" value={assessment.usage_weeks_per_year} onChange={(value) => setAssessment((row) => ({ ...row, usage_weeks_per_year: value }))} placeholder="40" />
          <AssessmentInput label="Ønsket område" value={assessment.preferred_area} onChange={(value) => setAssessment((row) => ({ ...row, preferred_area: value }))} />
          <AssessmentInput label="Min. soverom" type="number" value={assessment.bedrooms_min} onChange={(value) => setAssessment((row) => ({ ...row, bedrooms_min: value }))} />
          <AssessmentInput label="Boligtype" value={assessment.property_type} onChange={(value) => setAssessment((row) => ({ ...row, property_type: value }))} />
          <AssessmentInput label="Eierhorisont år" type="number" value={assessment.ownership_years} onChange={(value) => setAssessment((row) => ({ ...row, ownership_years: value }))} />
          <AssessmentInput label="Maks min. til flyplass" type="number" value={assessment.airport_max_minutes} onChange={(value) => setAssessment((row) => ({ ...row, airport_max_minutes: value }))} />
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 md:col-span-2">
            Modell
            <select value={assessment.model} onChange={(event) => setAssessment((row) => ({ ...row, model: event.target.value }))} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900">
              <option value="">Bruk anbefalt arbeidsmodell</option>
              <option value="Ansattbolig">Ansattbolig</option>
              <option value="Bedriftsvilla">Bedriftsvilla</option>
              <option value="Delt bedriftsbolig">Delt bedriftsbolig</option>
              <option value="Medlemsbolig">Medlemsbolig</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={() => void saveAssessment()} disabled={savingAssessment} className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {savingAssessment ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Lagre bedriftsvurdering
          </button>
          {assessmentNotice && <span className="text-xs font-bold text-emerald-800">{assessmentNotice}</span>}
        </div>

        {brief.propertyMatchCriteria.length > 0 && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-emerald-900">Boligmatch-profil</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {brief.propertyMatchCriteria.map((criterion) => (
                <span key={criterion} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-950">{criterion}</span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => void loadPropertyMatch()}
                disabled={matching || !brief.assessment.readyForPropertyMatch}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {matching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Lag og lagre boligshortlist
              </button>
              {matchNotice && <span className="text-xs font-bold text-emerald-900">{matchNotice}</span>}
            </div>
          </div>
        )}

        {matchingProperties.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Intern shortlist · kvalitetssikres før deling</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {matchingProperties.map((property) => (
                <article key={property.id || property.ref} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-950">{property.title || property.ref || "Eiendom"}</div>
                      <div className="mt-1 text-xs text-slate-500">{property.location || "Område ikke oppgitt"}</div>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-emerald-900">
                      {property.corporate_match_score}/100
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
                    {property.price ? <span>€{Number(property.price).toLocaleString("nb-NO")}</span> : null}
                    {property.bedrooms ? <span>{property.bedrooms} soverom</span> : null}
                    {property.property_type ? <span>{property.property_type}</span> : null}
                  </div>
                  {property.corporate_use_classification && (
                    <div className="mt-3 inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-900">
                      {property.corporate_use_classification}
                    </div>
                  )}
                  <div className="mt-3 space-y-1 text-xs leading-5 text-slate-600">
                    {(property.corporate_match_reasons || []).slice(0, 3).map((reason: string) => <div key={reason}>✓ {reason}</div>)}
                    {(property.corporate_match_cautions || []).slice(0, 2).map((caution: string) => <div key={caution} className="text-amber-800">• {caution}</div>)}
                  </div>
                  {property.website_url && (
                    <a href={property.website_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-black text-cyan-800 hover:underline">
                      Åpne bolig <ExternalLink size={12} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="text-xs font-black uppercase tracking-[0.14em] text-teal-800">Styre-/ledercase</div>
        <h2 className="mt-2 text-xl font-black text-slate-950">Beslutningspunkter</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {brief.boardChecklist.map((item) => (
            <article key={item.label} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-950">{item.label}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.note}</p>
              <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">{item.status}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-teal-800">
              <Mail size={16} /> Godkjent norsk kontaktsekvens
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-950">Klargjør riktig e-post før kontakt</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Tekstene er godkjent for Zen Corporate Homes. RealtyFlow sender ikke automatisk fra denne visningen;
              meldingen kopieres for kontrollert første kontakt og oppfølging.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {corporateOutreachTemplates.map((template) => (
              <button
                key={template.key}
                onClick={() => setSelectedTemplate(template.key)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${selectedTemplate === template.key ? "bg-teal-800 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
              >
                {template.dayOffset === 0 ? "Første e-post" : `Dag ${template.dayOffset}`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Mottakergrunnlag</div>
            <div className="mt-3 text-sm font-bold text-slate-950">{primaryContact?.name || "Ingen verifisert kontakt valgt ennå"}</div>
            <div className="mt-1 text-xs text-slate-500">{primaryContact?.title || primaryContact?.buying_role || "Beslutningstakerrolle må verifiseres"}</div>
            {primaryContact?.email && <div className="mt-2 text-xs font-semibold text-cyan-900">{primaryContact.email}</div>}
            {!primaryContact?.email && genericCompanyContact.genericEmail && (
              <div className="mt-2 text-xs font-semibold text-cyan-900">Generell selskapsadresse: {genericCompanyContact.genericEmail}</div>
            )}
            <div className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600">
              {primaryContact
                ? "Bruk verifisert kontaktinformasjon og kontroller at personen fortsatt har relevant rolle før utsendelse."
                : genericCompanyContact.genericEmail || genericCompanyContact.contactPageUrl
                  ? "Ingen person er verifisert ennå. Den offisielle selskapskanalen kan brukes til en manuelt kontrollert første henvendelse; ingen automatisk utsendelse."
                  : "Finn og verifiser beslutningstaker eller en offisiell selskapskanal før første kontakt. Ingen automatisk utsendelse."}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Emne</div>
              <div className="mt-1 font-bold text-slate-950">{outreach.subject}</div>
            </div>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 font-sans text-sm leading-6 text-slate-700">{outreach.body}</pre>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 p-4">
              <button onClick={() => void copyOutreach()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white">
                <Copy size={16} /> Kopier e-post
              </button>
              {(genericCompanyContact.genericEmail || genericCompanyContact.contactPageUrl) && (
                <button
                  onClick={() => void logManualCompanyContact()}
                  disabled={contactLogging}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-900 disabled:opacity-60"
                >
                  {contactLogging ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {String(prospect?.status || "").toUpperCase() === "CONTACTED"
                    ? "Loggfør ny manuell oppfølging"
                    : "Jeg har kontaktet selskapet manuelt"}
                </button>
              )}
              {copyNotice && <span className="text-xs font-semibold text-emerald-800">{copyNotice}</span>}
              {contactLogNotice && <span className="text-xs font-semibold text-emerald-800">{contactLogNotice}</span>}
              <span className="text-xs text-slate-500">Ingen automatisk utsendelse.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-cyan-50 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-900">
          <ShieldCheck size={16} /> Guardrails
        </div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-cyan-950">
          {brief.guardrails.map((guardrail) => <li key={guardrail}>• {guardrail}</li>)}
        </ul>
      </section>
    </div>
  );
}


function AssessmentInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-900"
      />
    </label>
  );
}
