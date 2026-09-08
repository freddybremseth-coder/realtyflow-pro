import { z } from "zod";
import type { ResponseSchema } from "@google/generative-ai";
import { askClaude } from "@/services/ai/claude-client";

export const SalesAssistantNoteInputSchema = z.object({
  note: z.string().trim().min(3).max(8000),
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
  explicitFacts: z.array(z.string().trim().min(1).max(300)).max(20),
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

export async function analyzeSalesAssistantNote(input: z.infer<typeof SalesAssistantNoteInputSchema>): Promise<SalesAssistantNoteAnalysis> {
  const parsed = SalesAssistantNoteInputSchema.parse(input);
  const prompt = `Current time: ${parsed.nowIso}\nTimezone: ${parsed.timezone}\nCustomer: ${parsed.customerName || "unknown"}\n\nRaw CRM note:\n${parsed.note}\n\nReturn JSON only. Rewrite the note professionally but preserve meaning. Extract only facts explicitly stated. Infer a follow-up timestamp only when the note clearly requests or implies follow-up (including relative expressions such as "in two weeks"); resolve relative time from Current time in the given timezone. If timing is vague or uncertain, use null or confidence below 0.90. Calendar is recommended only when nextFollowup is non-null and the note intends a call/meeting/follow-up. Do not invent budget, property criteria, outcome, or commitments.`;
  const raw = await askClaude(prompt, {
    temperature: 0.1,
    maxTokens: 1800,
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
