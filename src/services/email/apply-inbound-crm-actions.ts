import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyInboundReply,
  governInboundReply,
  type InboundReplyIntent,
} from "@/lib/inbound-reply-intelligence";
import { decideHotLeadSla, responseDueAt } from "@/lib/nexus/hot-lead-sla";

export interface InboundCrmActionResult {
  contactId: string | null;
  classification: InboundReplyIntent;
  suppressed: boolean;
  pipelineStatus: string | null;
  workItemCreated: boolean;
  governanceTier: "AUTO" | "REVIEW" | "FREDDY";
}

function normalize(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function ensureWorkItem(
  supabase: SupabaseClient,
  input: {
    sourceId: string;
    title: string;
    description: string;
    priority: string;
    brandId: string;
    nextAction: string;
    aiScore: number;
    metadata: Record<string, unknown>;
  },
) {
  const existing = await supabase
    .from("work_items")
    .select("id")
    .eq("source_type", "crm")
    .eq("source_id", input.sourceId)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(`CRM reply work item lookup failed: ${existing.error.message}`);
  if (existing.data?.id) return false;

  const now = new Date().toISOString();
  const inserted = await supabase.from("work_items").insert({
    title: input.title,
    description: input.description.slice(0, 1600),
    status: "TO_DO",
    priority: input.priority,
    due_date: now.slice(0, 10),
    brand_id: input.brandId,
    source_type: "crm",
    source_id: input.sourceId,
    assigned_agent: "sales",
    next_action: input.nextAction,
    ai_score: input.aiScore,
    metadata: input.metadata,
    created_at: now,
    updated_at: now,
  });
  if (inserted.error) throw new Error(`CRM reply work item failed: ${inserted.error.message}`);
  return true;
}

async function loadBuyerProfileSignal(supabase: SupabaseClient, contactId: string) {
  const result = await supabase
    .from("buyer_profiles")
    .select("id,status,purchase_readiness,updated_at")
    .eq("contact_id", contactId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) return { profileId: null, profileStatus: null, purchaseReadiness: null };
  return {
    profileId: result.data?.id ? String(result.data.id) : null,
    profileStatus: result.data?.status ? String(result.data.status).toUpperCase() : null,
    purchaseReadiness: result.data?.purchase_readiness ? String(result.data.purchase_readiness) : null,
  };
}

function operationalNextAction(input: {
  intent: InboundReplyIntent;
  profileId: string | null;
  profileStatus: string | null;
  suggestedAction?: string | null;
}) {
  if (input.suggestedAction) return normalize(input.suggestedAction);

  if (input.intent === "update_preferences") {
    return input.profileId
      ? "Åpne eksisterende Buyer Profile, oppdater kriteriene fra kundens svar og kjør ny matching."
      : "Opprett Buyer Profile fra kundens oppdaterte kriterier før matching.";
  }

  if (input.intent === "viewing_request") {
    return input.profileId && input.profileStatus === "APPROVED"
      ? "Behandle som hot lead: verifiser aktuell bolig/shortlist og avtal visning umiddelbart."
      : "Behandle som hot lead: avklar boligen, ferdigstill Buyer Profile ved behov og avtal visning umiddelbart.";
  }

  if (input.intent === "property_interest") {
    return input.profileId && input.profileStatus === "APPROVED"
      ? "Behandle som hot lead: åpne Buyer Profile/Stage Readiness, sjekk boligen og prioriter matching/shortlist."
      : "Behandle som hot lead: identifiser boligen, opprett/ferdigstill Buyer Profile og prioriter matching.";
  }

  if (input.intent === "active_interest") {
    return input.profileId
      ? "Åpne Buyer Profile og Stage Readiness, oppdater kjøpsstatus og prioriter neste matchingsteg."
      : "Opprett Buyer Profile og prioriter kunden for matching.";
  }

  if (input.intent === "question") {
    return "Svar kunden raskt. Bruk Customer 360 og aktuell bolig-/kundedata før svaret sendes.";
  }

  return "Les AI-utkastet i Nexus Communications og følg opp kunden.";
}

export async function applyInboundCrmActions(
  supabase: SupabaseClient,
  params: {
    emailMessageId: string;
    brandId: string;
    fromAddress: string;
    subject?: string | null;
    body?: string | null;
    summary?: string | null;
    urgency?: string | null;
    suggestedAction?: string | null;
  },
): Promise<InboundCrmActionResult> {
  const fromAddress = normalize(params.fromAddress).toLowerCase();
  const subject = normalize(params.subject);
  const body = normalize(params.body);
  const classification = classifyInboundReply({ subject, body });
  const governance = governInboundReply(classification);
  const sla = decideHotLeadSla(classification);
  const now = new Date().toISOString();
  const responseDue = responseDueAt(now, sla.responseMinutes);

  const { data: contact } = fromAddress
    ? await supabase
        .from("contacts")
        .select("id,name,email,brand_id,brand,pipeline_status,nurture_status,notes,interactions,do_not_contact,email_suppressed")
        .ilike("email", fromAddress)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (!contact?.id) {
    return {
      contactId: null,
      classification: classification.intent,
      suppressed: classification.intent === "do_not_contact" || classification.intent === "purchased_elsewhere",
      pipelineStatus: null,
      workItemCreated: false,
      governanceTier: governance.safety.tier,
    };
  }

  const buyerProfile = await loadBuyerProfileSignal(supabase, String(contact.id));
  const summary = normalize(params.summary) || body.slice(0, 500) || subject || "Innkommende e-post";
  const existingInteractions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const interactionId = `email-reply-${params.emailMessageId}`;
  const interaction = {
    id: interactionId,
    type: "email_reply",
    content: [
      `Innkommende e-post: ${subject || "(uten emne)"}`,
      `Klassifisering: ${classification.intent}`,
      `Autopilot: ${governance.safety.tier}`,
      sla.isHotLead ? `Hot Lead SLA: ${sla.responseMinutes} min` : "",
      `Oppsummering: ${summary}`,
      params.suggestedAction ? `Foreslått handling: ${normalize(params.suggestedAction)}` : "",
    ].filter(Boolean).join("\n"),
    date: now,
    direction: "in",
    brand_id: params.brandId,
    metadata: {
      email_message_id: params.emailMessageId,
      classification: classification.intent,
      confidence: classification.confidence,
      governance_tier: governance.safety.tier,
      urgency: params.urgency || null,
      hot_lead: sla.isHotLead,
      response_due_at: responseDue,
      operational_target: sla.operationalTarget,
      buyer_profile_id: buyerProfile.profileId,
      buyer_profile_status: buyerProfile.profileStatus,
    },
  };

  const dedupedInteractions = existingInteractions.filter((item: any) => String(item?.id || "") !== interactionId);
  const update: Record<string, unknown> = {
    last_inbound_reply_at: now,
    last_reply_classification: classification.intent,
    last_contact: now,
    interactions: [interaction, ...dedupedInteractions].slice(0, 250),
    updated_at: now,
  };

  let nextPipelineStatus = String(contact.pipeline_status || "") || null;
  let suppressed = Boolean(contact.email_suppressed || contact.do_not_contact);

  if (classification.intent === "do_not_contact") {
    update.do_not_contact = true;
    update.email_suppressed = true;
    update.unsubscribe_at = now;
    update.suppression_reason = "customer_unsubscribe_reply";
    update.nurture_status = "stopped";
    update.next_followup = null;
    suppressed = true;
  } else if (classification.intent === "purchased_elsewhere") {
    update.email_suppressed = true;
    update.suppression_reason = "purchase_reported_by_customer_pending_outcome_review";
    update.nurture_status = "stopped";
    update.next_followup = null;
    suppressed = true;
  } else if (classification.shouldPauseNurture) {
    update.nurture_status = "paused";
    if (classification.requiresFastResponse) update.next_followup = now;
  }

  const { error: updateError } = await supabase.from("contacts").update(update).eq("id", contact.id);
  if (updateError) throw new Error(`CRM reply update failed: ${updateError.message}`);

  let workItemCreated = false;
  const metadata = {
    event_type: "email_reply",
    email_message_id: params.emailMessageId,
    contact_id: contact.id,
    from_address: fromAddress,
    classification: classification.intent,
    confidence: classification.confidence,
    governance_tier: governance.safety.tier,
    urgency: params.urgency || null,
    hot_lead: sla.isHotLead,
    hot_lead_reason: sla.reason,
    response_due_at: responseDue,
    response_sla_minutes: sla.responseMinutes,
    operational_target: sla.operationalTarget,
    buyer_profile_id: buyerProfile.profileId,
    buyer_profile_status: buyerProfile.profileStatus,
    purchase_readiness: buyerProfile.purchaseReadiness,
    stage_readiness_href: buyerProfile.profileId
      ? `/lead-intelligence?buyerProfileId=${encodeURIComponent(buyerProfile.profileId)}&brand=${encodeURIComponent(params.brandId)}`
      : `/customers?contactId=${encodeURIComponent(String(contact.id))}`,
  };

  if (classification.intent === "purchased_elsewhere") {
    workItemCreated = await ensureWorkItem(supabase, {
      sourceId: `${params.emailMessageId}:purchased-outcome-review`,
      title: `Bekreft LOST – kunde har kjøpt annet sted: ${contact.name || fromAddress}`,
      description: `${subject || "Innkommende e-post"}\n${summary}`,
      priority: "MEDIUM",
      brandId: params.brandId,
      nextAction: "Bekreft at kunden har kjøpt annet sted, sett LOST med korrekt årsak og behold permanent suppression.",
      aiScore: 96,
      metadata,
    });
  } else if (classification.intent !== "do_not_contact" && classification.intent !== "unclear") {
    workItemCreated = await ensureWorkItem(supabase, {
      sourceId: params.emailMessageId,
      title: sla.isHotLead ? `HOT LEAD: ${contact.name || fromAddress}` : `Følg opp kundesvar: ${contact.name || fromAddress}`,
      description: `${subject || "Innkommende e-post"}\n${summary}`,
      priority: sla.priority,
      brandId: params.brandId,
      nextAction: operationalNextAction({
        intent: classification.intent,
        profileId: buyerProfile.profileId,
        profileStatus: buyerProfile.profileStatus,
        suggestedAction: params.suggestedAction,
      }),
      aiScore: sla.aiScore,
      metadata,
    });
  } else if (classification.intent === "unclear") {
    workItemCreated = await ensureWorkItem(supabase, {
      sourceId: `${params.emailMessageId}:manual-review`,
      title: `Vurder uklart kundesvar: ${contact.name || fromAddress}`,
      description: `${subject || "Innkommende e-post"}\n${summary}`,
      priority: "MEDIUM",
      brandId: params.brandId,
      nextAction: "Vurder kundens hensikt før pipeline, nurture eller matching endres videre.",
      aiScore: 60,
      metadata,
    });
  }

  return {
    contactId: String(contact.id),
    classification: classification.intent,
    suppressed,
    pipelineStatus: nextPipelineStatus,
    workItemCreated,
    governanceTier: governance.safety.tier,
  };
}
