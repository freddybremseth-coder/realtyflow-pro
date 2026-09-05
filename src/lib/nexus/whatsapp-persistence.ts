import { buildWhatsAppLeadMemory, decideWhatsAppAutoReply, type WhatsAppInboundMessage } from "@/lib/nexus/whatsapp-inbound";
import { insertRevenueEvent } from "@/lib/revenue/events";

function normalizePhone(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? `+${digits}` : "";
}

function clean(value: unknown) {
  return String(value || "").trim();
}

export type WhatsAppPersistenceResult = {
  ok: boolean;
  duplicate: boolean;
  contactId?: string | null;
  createdContact?: boolean;
  workItemCreated?: boolean;
  autoReply: ReturnType<typeof decideWhatsAppAutoReply>;
  error?: string;
};

export async function persistWhatsAppInbound(
  supabase: any,
  message: WhatsAppInboundMessage,
): Promise<WhatsAppPersistenceResult> {
  const memory = buildWhatsAppLeadMemory(message);
  const phone = normalizePhone(memory.identity.phone);
  if (!phone || !clean(message.messageId) || !clean(message.text)) {
    return {
      ok: false,
      duplicate: false,
      autoReply: decideWhatsAppAutoReply({ signals: memory.signals, isKnownContact: false }),
      error: "WhatsApp message requires messageId, text and a valid sender phone number.",
    };
  }

  const { data: duplicateEvent } = await supabase
    .from("revenue_events")
    .select("id,contact_id")
    .eq("dedupe_key", memory.dedupeKey)
    .limit(1)
    .maybeSingle();

  if (duplicateEvent?.id) {
    return {
      ok: true,
      duplicate: true,
      contactId: duplicateEvent.contact_id || null,
      autoReply: { allowed: false, mode: "NONE", reason: "Duplicate inbound message; suppress repeated auto reply.", suggestedReply: null },
    };
  }

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id,name,phone,notes,interactions,pipeline_status,brand,brand_id,property_interest,pipeline_value")
    .limit(1000);
  if (contactsError) {
    return {
      ok: false,
      duplicate: false,
      autoReply: decideWhatsAppAutoReply({ signals: memory.signals, isKnownContact: false }),
      error: contactsError.message,
    };
  }

  const existing = (contacts || []).find((candidate: any) => normalizePhone(candidate.phone) === phone) || null;
  const now = memory.occurredAt;
  const brandId = clean(message.brandId) || clean(existing?.brand_id || existing?.brand) || null;
  const signals = memory.signals;
  const summary = [
    "WhatsApp inbound",
    signals.areas.length ? `Område: ${signals.areas.join(", ")}` : "",
    signals.budgetEur ? `Budsjett: €${signals.budgetEur}` : "",
    signals.bedrooms ? `Soverom: ${signals.bedrooms}` : "",
    signals.timeline ? `Tidslinje: ${signals.timeline}` : "",
    signals.propertyRefs.length ? `Boligref: ${signals.propertyRefs.join(", ")}` : "",
    `Intent: ${signals.intent}`,
    `Melding: ${message.text}`,
  ].filter(Boolean).join("\n");

  const interaction = {
    id: `whatsapp-${message.messageId}`,
    type: "whatsapp",
    content: summary,
    date: now,
    direction: "in",
    brand_id: brandId,
    metadata: {
      message_id: message.messageId,
      source: "whatsapp",
      intent: signals.intent,
      hot_signal: signals.hotSignal,
      budget_eur: signals.budgetEur,
      areas: signals.areas,
      bedrooms: signals.bedrooms,
      timeline: signals.timeline,
      property_refs: signals.propertyRefs,
    },
  };

  const existingInteractions = Array.isArray(existing?.interactions) ? existing.interactions : [];
  const mergedPropertyInterest = signals.propertyRefs.length
    ? signals.propertyRefs.join(", ")
    : signals.areas.length
      ? signals.areas.join(", ")
      : clean(existing?.property_interest) || null;
  const pipelineValue = signals.budgetEur || Number(existing?.pipeline_value || 0) || 0;
  const nextFollowup = new Date(Date.now() + (signals.hotSignal ? 2 : 24) * 60 * 60 * 1000).toISOString();
  const basePayload: Record<string, unknown> = {
    name: memory.identity.name || existing?.name || `WhatsApp ${phone.slice(-4)}`,
    phone,
    source: "whatsapp",
    notes: [summary, clean(existing?.notes) ? `Tidligere notater:\n${existing.notes}` : ""].filter(Boolean).join("\n\n---\n\n"),
    pipeline_status: signals.intent === "NOT_INTERESTED" ? (existing?.pipeline_status || "ON_HOLD") : (existing?.pipeline_status || "NEW"),
    pipeline_value: pipelineValue,
    property_interest: mergedPropertyInterest,
    last_contact: now,
    next_followup: signals.intent === "NOT_INTERESTED" ? null : nextFollowup,
    interactions: [interaction, ...existingInteractions],
    updated_at: now,
  };
  if (brandId) {
    basePayload.brand = brandId;
    basePayload.brand_id = brandId;
  }

  const contactWrite = existing?.id
    ? supabase.from("contacts").update(basePayload).eq("id", existing.id).select().single()
    : supabase.from("contacts").insert({ ...basePayload, created_at: now }).select().single();
  const { data: contact, error: contactError } = await contactWrite;
  if (contactError || !contact?.id) {
    return {
      ok: false,
      duplicate: false,
      autoReply: decideWhatsAppAutoReply({ signals, isKnownContact: Boolean(existing?.id) }),
      error: contactError?.message || "Failed to persist WhatsApp contact.",
    };
  }

  const event = await insertRevenueEvent(supabase, {
    eventType: existing?.id ? "contact_updated" : "lead_created",
    title: existing?.id ? `WhatsApp activity: ${contact.name || phone}` : `New WhatsApp lead: ${contact.name || phone}`,
    description: summary,
    contactId: contact.id,
    brandId,
    sourceSystem: "whatsapp",
    sourceType: "customer_message",
    sourceId: message.messageId,
    actorType: "customer",
    confidenceScore: signals.hotSignal ? 92 : 80,
    revenueImpactEur: signals.budgetEur,
    occurredAt: now,
    dedupeKey: memory.dedupeKey,
    metadata: interaction.metadata,
    createdBy: "nexus/whatsapp-persistence",
  });
  if (!event.ok && !event.tableNotReady) {
    return {
      ok: false,
      duplicate: false,
      contactId: contact.id,
      createdContact: !existing?.id,
      autoReply: decideWhatsAppAutoReply({ signals, isKnownContact: Boolean(existing?.id) }),
      error: event.error || "Failed to record WhatsApp revenue event.",
    };
  }

  let workItemCreated = false;
  if (signals.intent !== "NOT_INTERESTED") {
    const { error: workError } = await supabase.from("work_items").insert({
      title: `${signals.hotSignal ? "HOT WhatsApp" : "WhatsApp"}: ${contact.name || phone}`,
      description: summary,
      status: "TO_DO",
      priority: signals.hotSignal ? "HIGH" : "MEDIUM",
      due_date: new Date().toISOString().slice(0, 10),
      brand_id: brandId,
      source_type: "whatsapp",
      source_id: contact.id,
      assigned_agent: "sales",
      next_action: memory.recommendedNextAction,
      ai_score: signals.hotSignal ? 92 : 72,
      metadata: {
        whatsapp_message_id: message.messageId,
        whatsapp_dedupe_key: memory.dedupeKey,
        phone,
        intent: signals.intent,
        hot_signal: signals.hotSignal,
      },
      created_at: now,
      updated_at: now,
    });
    workItemCreated = !workError;
  }

  return {
    ok: true,
    duplicate: false,
    contactId: contact.id,
    createdContact: !existing?.id,
    workItemCreated,
    autoReply: decideWhatsAppAutoReply({ signals, isKnownContact: Boolean(existing?.id) }),
  };
}
