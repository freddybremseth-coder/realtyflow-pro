import type { SupabaseClient } from "@supabase/supabase-js";

export type InboundReplyClassification =
  | "unsubscribe"
  | "purchased"
  | "active_reply"
  | "informational";

export interface InboundCrmActionResult {
  contactId: string | null;
  classification: InboundReplyClassification;
  suppressed: boolean;
  pipelineStatus: string | null;
  workItemCreated: boolean;
}

const UNSUBSCRIBE_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bremove me from (?:your|the) (?:mailing|email) list\b/i,
  /\bdo not (?:email|contact|message) me\b/i,
  /\bstop (?:sending|emailing|contacting)\b/i,
  /\bavmeld(?:e|ing)?\b/i,
  /\bikke send (?:meg )?(?:flere )?e-?poster\b/i,
  /\bikke kontakt meg\b/i,
  /\bstopp (?:e-?post|utsendelser)\b/i,
  /\bdarme de baja\b/i,
  /\bno me (?:env[ií]e|mand[eé])n? m[aá]s (?:correos|emails|mensajes)\b/i,
  /\bno (?:me )?contact(?:e|en)\b/i,
];

const PURCHASED_PATTERNS = [
  /\b(?:har|vi har|jeg har) kj[oø]pt (?:en |et )?(?:bolig|leilighet|hus|eiendom)\b/i,
  /\bkj[oø]pt (?:et |en )?(?:annet|annen) (?:bolig|hus|leilighet|eiendom)\b/i,
  /\b(?:we|i) (?:have )?(?:bought|purchased) (?:a |another )?(?:property|home|house|apartment|villa)\b/i,
  /\b(?:we|i)'ve (?:bought|purchased) (?:a |another )?(?:property|home|house|apartment|villa)\b/i,
  /\bno longer (?:looking|searching) because (?:we|i) (?:bought|purchased)\b/i,
  /\b(?:ya )?hemos comprado (?:una |un )?(?:vivienda|casa|apartamento|propiedad)\b/i,
  /\b(?:ya )?he comprado (?:una |un )?(?:vivienda|casa|apartamento|propiedad)\b/i,
];

const LOW_VALUE_PATTERNS = [
  /^\s*(?:thanks|thank you|takk|gracias|ok|okay|noted|mottatt)[.!\s]*$/i,
];

function normalize(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function classify(subject: string, body: string): InboundReplyClassification {
  const text = `${subject}\n${body}`.trim();
  if (UNSUBSCRIBE_PATTERNS.some((pattern) => pattern.test(text))) return "unsubscribe";
  if (PURCHASED_PATTERNS.some((pattern) => pattern.test(text))) return "purchased";
  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(body))) return "informational";
  return "active_reply";
}

function priorityFor(urgency: string | null | undefined, classification: InboundReplyClassification) {
  if (classification === "unsubscribe" || classification === "purchased") return "MEDIUM";
  const value = String(urgency || "").toLowerCase();
  if (value === "critical" || value === "high") return "HIGH";
  return "MEDIUM";
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
  const classification = classify(subject, body);
  const now = new Date().toISOString();

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
      classification,
      suppressed: classification === "unsubscribe" || classification === "purchased",
      pipelineStatus: null,
      workItemCreated: false,
    };
  }

  const summary = normalize(params.summary) || body.slice(0, 500) || subject || "Innkommende e-post";
  const existingInteractions = Array.isArray(contact.interactions) ? contact.interactions : [];
  const interaction = {
    id: `email-reply-${params.emailMessageId}`,
    type: "email_reply",
    content: [
      `Innkommende e-post: ${subject || "(uten emne)"}`,
      `Klassifisering: ${classification}`,
      `Oppsummering: ${summary}`,
      params.suggestedAction ? `Foreslått handling: ${normalize(params.suggestedAction)}` : "",
    ].filter(Boolean).join("\n"),
    date: now,
    direction: "in",
    brand_id: params.brandId,
    metadata: {
      email_message_id: params.emailMessageId,
      classification,
      urgency: params.urgency || null,
    },
  };

  const update: Record<string, unknown> = {
    last_inbound_reply_at: now,
    last_reply_classification: classification,
    last_contact: now,
    interactions: [interaction, ...existingInteractions].slice(0, 250),
    updated_at: now,
  };

  let nextPipelineStatus = String(contact.pipeline_status || "") || null;
  let suppressed = Boolean(contact.email_suppressed || contact.do_not_contact);

  if (classification === "unsubscribe") {
    update.do_not_contact = true;
    update.email_suppressed = true;
    update.unsubscribe_at = now;
    update.suppression_reason = "customer_unsubscribe_reply";
    update.nurture_status = "paused";
    update.next_followup = null;
    suppressed = true;
  } else if (classification === "purchased") {
    update.pipeline_status = "LOST";
    update.lost_reason = "purchased_elsewhere_or_no_longer_searching";
    update.email_suppressed = true;
    update.suppression_reason = "purchase_reported_by_customer";
    update.nurture_status = "paused";
    update.next_followup = null;
    nextPipelineStatus = "LOST";
    suppressed = true;
  } else if (classification === "active_reply") {
    update.nurture_status = "paused";
    update.next_followup = now;
  }

  const { error: updateError } = await supabase.from("contacts").update(update).eq("id", contact.id);
  if (updateError) throw new Error(`CRM reply update failed: ${updateError.message}`);

  let workItemCreated = false;
  if (classification === "active_reply") {
    const { error: workError } = await supabase.from("work_items").insert({
      title: `Svar kunde raskt: ${contact.name || fromAddress}`,
      description: `${subject || "Innkommende e-post"}\n${summary}`.slice(0, 1600),
      status: "TO_DO",
      priority: priorityFor(params.urgency, classification),
      due_date: now.slice(0, 10),
      brand_id: params.brandId,
      source_type: "crm",
      source_id: params.emailMessageId,
      assigned_agent: "sales",
      next_action: params.suggestedAction || "Les AI-utkastet i Nexus Communications og svar kunden så raskt som mulig.",
      ai_score: String(params.urgency || "").toLowerCase() === "high" || String(params.urgency || "").toLowerCase() === "critical" ? 95 : 82,
      metadata: {
        event_type: "email_reply",
        email_message_id: params.emailMessageId,
        contact_id: contact.id,
        from_address: fromAddress,
        classification,
        urgency: params.urgency || null,
      },
      created_at: now,
      updated_at: now,
    });
    if (workError) throw new Error(`CRM reply work item failed: ${workError.message}`);
    workItemCreated = true;
  }

  return {
    contactId: String(contact.id),
    classification,
    suppressed,
    pipelineStatus: nextPipelineStatus,
    workItemCreated,
  };
}
