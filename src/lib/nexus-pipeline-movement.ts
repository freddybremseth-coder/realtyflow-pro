import { assessDormantLead } from "@/lib/nexus-dormant-lead-reactivation";
import {
  buildCustomerListAction,
  normalizeRealEstateStage,
  type CustomerListContact,
} from "@/lib/customers/action-priority";

export type MovementCause =
  | "waiting_planned"
  | "waiting_overdue"
  | "missing_contact_channel"
  | "missing_followup"
  | "missing_buyer_direction"
  | "ready_for_matching"
  | "matching_stalled"
  | "viewing_stalled"
  | "negotiation_stalled"
  | "reserved_stalled"
  | "dormant_reactivation"
  | "data_quality"
  | "active_followup";

export interface PipelineMovementContact extends CustomerListContact {
  id: string;
  name?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  pipeline_status?: string | null;
  do_not_contact?: boolean | null;
  email_suppressed?: boolean | null;
  last_inbound_reply_at?: string | null;
}

export interface PipelineMovementAssessment {
  score: number;
  cause: MovementCause;
  causeLabel: string;
  action: string;
  reason: string;
  targetStage: string | null;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  needsAction: boolean;
  reactivationSegment: string | null;
  reactivationScore: number | null;
  href: string;
}

const CANONICAL = new Set(["NEW","CONTACT","QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","ON_HOLD","WON","LOST"]);

function href(id: string) {
  return `/customers?contactId=${encodeURIComponent(id)}&tab=all`;
}

function validDate(value: unknown) {
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(value: unknown, now: Date) {
  const d = validDate(value);
  return d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000)) : null;
}

export function assessPipelineMovement(contact: PipelineMovementContact, now = new Date()): PipelineMovementAssessment | null {
  const stage = normalizeRealEstateStage(contact.pipeline_status);
  if (["WON","LOST"].includes(stage) || contact.do_not_contact || contact.email_suppressed) return null;
  const actionPriority = buildCustomerListAction(contact, now);
  const customerHref = href(contact.id);

  if (!CANONICAL.has(stage)) {
    return { score: 100, cause:"data_quality", causeLabel:"Datakvalitet", action:"Avklar pipeline-status", reason:`Ukjent pipeline-status «${stage}»`, targetStage:null, priority:"CRITICAL", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };
  }

  if (contact.waiting_on) {
    const until = validDate(contact.waiting_until);
    const overdue = !until || until.getTime() < now.getTime();
    return overdue
      ? { score:97, cause:"waiting_overdue", causeLabel:"Ventetid utløpt", action:"Gjenoppta oppfølging", reason:actionPriority.reason, targetStage:stage === "ON_HOLD" ? "CONTACT" : stage, priority:"CRITICAL", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref }
      : { score:18, cause:"waiting_planned", causeLabel:"Planlagt venting", action:actionPriority.label, reason:actionPriority.reason, targetStage:null, priority:"LOW", needsAction:false, reactivationSegment:null, reactivationScore:null, href:customerHref };
  }

  if (!contact.email && !contact.phone) {
    return { score:100, cause:"missing_contact_channel", causeLabel:"Mangler kontaktkanal", action:"Finn kontaktkanal", reason:"Mangler både e-post og telefon", targetStage:null, priority:"CRITICAL", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };
  }

  const activityAt = contact.last_inbound_reply_at || contact.last_contact || contact.updated_at || contact.created_at;
  const staleDays = daysSince(activityAt, now);
  const dormant = assessDormantLead({
    id: contact.id,
    name: contact.name,
    email: contact.email,
    brandId: contact.brand_id || contact.brand,
    pipelineStatus: stage,
    nurtureStatus: contact.nurture_status,
    propertyInterest: contact.property_interest || contact.preferred_location,
    createdAt: contact.created_at,
    lastContact: contact.last_contact || contact.last_inbound_reply_at,
    latestInteractionAt: activityAt ? String(activityAt) : null,
    explicitlyOptedOut: Boolean(contact.do_not_contact || contact.email_suppressed),
  }, [], now);

  if (["NEW","CONTACT","QUALIFIED"].includes(stage) && dormant.eligibleForDraft) {
    return {
      score: Math.max(actionPriority.score, dormant.score),
      cause:"dormant_reactivation",
      causeLabel:"Dormant kunde",
      action:"Reaktiver med personlig melding",
      reason:dormant.reasons.slice(0,2).join(" "),
      targetStage: stage === "NEW" ? "CONTACT" : stage,
      priority:dormant.segment === "hot_dormant" ? "HIGH" : "MEDIUM",
      needsAction:true,
      reactivationSegment:dormant.segment,
      reactivationScore:dormant.score,
      href:customerHref,
    };
  }

  if (stage === "NEW") return { score:80, cause:"active_followup", causeLabel:"Ikke kvalifisert", action:"Kvalifiser lead", reason:"Nytt lead mangler tydelig kvalifisering", targetStage:"CONTACT", priority:"HIGH", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };

  if (stage === "CONTACT") {
    if (!contact.next_followup) return { score:84, cause:"missing_followup", causeLabel:"Mangler neste dato", action:"Sett personlig neste oppfølging", reason:"Aktiv kontakt mangler neste oppfølgingsdato", targetStage:"QUALIFIED", priority:"HIGH", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };
    return { score:actionPriority.score, cause:"active_followup", causeLabel:"Aktiv oppfølging", action:actionPriority.label, reason:actionPriority.reason, targetStage:"QUALIFIED", priority:actionPriority.priority, needsAction:actionPriority.needsAction, reactivationSegment:null, reactivationScore:null, href:customerHref };
  }

  if (stage === "QUALIFIED") {
    const hasDirection = Boolean(String(contact.property_interest || "").trim() || String(contact.preferred_location || "").trim());
    return hasDirection
      ? { score:78, cause:"ready_for_matching", causeLabel:"Klar for matching", action:"Lag personlig shortlist med 2–3 boliger", reason:"Kvalifisert kunde har registrert bolig-/områdeinteresse", targetStage:"MATCHING", priority:"HIGH", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref }
      : { score:76, cause:"missing_buyer_direction", causeLabel:"Mangler kjøpsretning", action:"Avklar område, budsjett og minimumskrav", reason:"Kvalifisert kunde mangler tydelig boligretning", targetStage:"MATCHING", priority:"HIGH", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };
  }

  if (stage === "MATCHING") return { score:staleDays != null && staleDays >= 2 ? 88 : 72, cause:"matching_stalled", causeLabel:"Matching må videre", action:"Oppdater shortlist og be om valg", reason:staleDays != null ? `${staleDays} dager siden siste dokumenterte aktivitet` : "Kunden er i boligmatching", targetStage:"VIEWING", priority:"HIGH", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };
  if (stage === "VIEWING") return { score:92, cause:"viewing_stalled", causeLabel:"Visning krever neste steg", action:"Avklar feedback og neste visning/bud", reason:"Visningsfase bør raskt ende i nytt konkret steg", targetStage:"NEGOTIATION", priority:"CRITICAL", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };
  if (stage === "NEGOTIATION") return { score:96, cause:"negotiation_stalled", causeLabel:"Forhandling i risiko", action:"Følg opp forhandling i dag", reason:"Aktiv forhandling skal ikke stå uten fersk handling", targetStage:"RESERVED", priority:"CRITICAL", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };
  if (stage === "RESERVED") return { score:90, cause:"reserved_stalled", causeLabel:"Closing-fremdrift", action:"Kontroller neste closing-milepæl", reason:"Reservert handel må følges gjennom closing", targetStage:"WON", priority:"HIGH", needsAction:true, reactivationSegment:null, reactivationScore:null, href:customerHref };

  return { score:actionPriority.score, cause:"active_followup", causeLabel:"Aktiv pipeline", action:actionPriority.label, reason:actionPriority.reason, targetStage:null, priority:actionPriority.priority, needsAction:actionPriority.needsAction, reactivationSegment:null, reactivationScore:null, href:customerHref };
}
