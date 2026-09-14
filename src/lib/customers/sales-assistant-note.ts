import { z } from "zod";
import type { ResponseSchema } from "@google/generative-ai";
import { askClaude } from "@/services/ai/claude-client";

export const SalesAssistantNoteInputSchema = z.object({
  note: z.string().trim().min(3).max(30000),
  nowIso: z.string().datetime(),
  timezone: z.string().min(1).max(80).default("Europe/Madrid"),
  customerName: z.string().max(180).nullable().optional(),
}).strict();

export const SalesAssistantNoteAnalysisSchema = z.object({
  polishedNote: z.string().trim().min(1).max(4000),
  title: z.string().trim().min(1).max(180),
  updateType: z.enum(["general_note","phone_call","email","whatsapp","meeting","viewing","preference","offer","finance","closing","other"]),
  outcome: z.enum(["interested","maybe","not_interested","second_viewing","offer_considered","offer_submitted","waiting_customer","waiting_third_party","other"]).nullable(),
  nextAction: z.string().trim().max(1500).nullable(),
  nextFollowup: z.string().datetime().nullable(),
  followupConfidence: z.number().min(0).max(1),
  calendarRecommended: z.boolean(),
  calendarTitle: z.string().trim().max(180).nullable(),
  calendarDurationMinutes: z.number().int().min(10).max(180).nullable(),
  propertyReference: z.string().trim().max(300).nullable(),
  explicitFacts: z.array(z.string().trim().min(1).max(300)).max(40),
}).strict();

export type SalesAssistantNoteAnalysis = z.infer<typeof SalesAssistantNoteAnalysisSchema>;

const responseSchema = {
  type: "object",
  required: ["polishedNote","title","updateType","outcome","nextAction","nextFollowup","followupConfidence","calendarRecommended","calendarTitle","calendarDurationMinutes","propertyReference","explicitFacts"],
  properties: {
    polishedNote: { type: "string" },
    title: { type: "string" },
    updateType: { type: "string", format: "enum", enum: ["general_note","phone_call","email","whatsapp","meeting","viewing","preference","offer","finance","closing","other"] },
    outcome: { type: "string", nullable: true, format: "enum", enum: ["interested","maybe","not_interested","second_viewing","offer_considered","offer_submitted","waiting_customer","waiting_third_party","other"] },
    nextAction: { type: "string", nullable: true },
    nextFollowup: { type: "string", nullable: true },
    followupConfidence: { type: "number" },
    calendarRecommended: { type: "boolean" },
    calendarTitle: { type: "string", nullable: true },
    calendarDurationMinutes: { type: "number", nullable: true },
    propertyReference: { type: "string", nullable: true },
    explicitFacts: { type: "array", items: { type: "string" } },
  },
} as unknown as ResponseSchema;

export function buildSalesAssistantPrompt(input: z.infer<typeof SalesAssistantNoteInputSchema>) {
  const parsed = SalesAssistantNoteInputSchema.parse(input);
  return `Current time: ${parsed.nowIso}\nTimezone: ${parsed.timezone}\nCustomer: ${parsed.customerName || "unknown"}\n\nRaw CRM source:\n${parsed.note}\n\nReturn JSON only. Rewrite the source into a concise professional CRM note while preserving meaning and chronology. Extract only facts explicitly stated.\n\nThe source may be a pasted email thread, forwarded message, WhatsApp conversation, SMS, meeting note, OCR text from an image/PDF, or a mixture of these. Apply these rules strictly:\n- Distinguish the customer's own statements from internal colleague notes and messages sent by the advisor. Never attribute an internal or outbound statement to the customer.\n- Ignore signatures, contact cards, legal footers, tracking notices, Gmail/Outlook/HubSpot UI text, image placeholders, quoted duplicates and repeated message chains when they add no new fact.\n- Preserve useful chronology when dates/times are present. A visit window or availability date that is already in the past relative to Current time is historical context only and must not become nextFollowup or a calendar event.\n- Infer a follow-up timestamp only when the source clearly requests or implies a future follow-up. Resolve relative expressions such as "in two weeks" from Current time in the given timezone. If timing is vague, historical, conflicting or uncertain, use null or confidence below 0.90.\n- Calendar is recommended only when nextFollowup is non-null and the source intends a future call, meeting or follow-up.\n- Do not invent budget, property criteria, outcome, urgency, commitments or customer preferences.\n- If the thread contains both customer requirements and later advisor/internal coordination, explicitFacts should identify the customer-backed facts separately from internal process notes.\n- If the source mentions a property/project name, keep it in propertyReference when appropriate.\n\nUse updateType=email for an email thread, whatsapp for WhatsApp, phone_call for a call note, and general_note when the source type cannot be determined reliably.`;
}

export async function analyzeSalesAssistantNote(input: z.infer<typeof SalesAssistantNoteInputSchema>): Promise<SalesAssistantNoteAnalysis> {
  const parsed = SalesAssistantNoteInputSchema.parse(input);
  const raw = await askClaude(buildSalesAssistantPrompt(parsed), {
    temperature: 0.1,
    maxTokens: 2200,
    responseMimeType: "application/json",
    responseSchema,
    fallbackOnInvalidResponse: true,
    validateResponse: (text) => {
      try { SalesAssistantNoteAnalysisSchema.parse(JSON.parse(text)); return true; } catch { return false; }
    },
  });
  return SalesAssistantNoteAnalysisSchema.parse(JSON.parse(raw));
}

export function shouldCreateFollowupCalendarEvent(analysis: SalesAssistantNoteAnalysis) {
  return Boolean(analysis.calendarRecommended && analysis.nextFollowup && analysis.followupConfidence >= 0.9);
}
