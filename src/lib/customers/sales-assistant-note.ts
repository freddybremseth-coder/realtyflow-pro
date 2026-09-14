import { z } from "zod";
import type { ResponseSchema } from "@google/generative-ai";
import { askClaude } from "@/services/ai/claude-client";

export const SalesAssistantNoteInputSchema = z.object({
  note: z.string().trim().min(3).max(30000),
  nowIso: z.string().datetime(),
  timezone: z.string().min(1).max(80).default("Europe/Madrid"),
  customerName: z.string().max(180).nullable().optional(),
}).strict();

export const BUYER_CRITERION_KEYS = [
  "bedrooms", "bathrooms", "property_type", "location", "total_budget", "purchase_price",
  "estimated_total_cost", "floor_position", "has_lift", "terrace_area_m2", "terrace_access",
  "view_quality", "orientation", "parking", "pool", "new_build_or_resale", "availability_status",
  "availability_verified_at", "adjacent_plot_status", "future_building_risk", "view_privacy_loss_risk",
  "view_obstruction_risk", "legal_notes", "living_area_m2", "plot_area_m2", "distance_to_beach",
  "stairs", "other", "unknown",
] as const;

export const BUYER_PROPERTY_TYPES = [
  "end_townhouse", "townhouse", "apartment", "penthouse", "villa", "duplex", "bungalow", "finca",
  "country_house", "plot", "commercial", "other", "unknown",
] as const;

export const BuyerCriterionSuggestionSchema = z.object({
  criterionType: z.enum(["hard_requirement", "preference", "exclusion"]),
  key: z.enum(BUYER_CRITERION_KEYS),
  otherKey: z.string().trim().min(1).max(120).nullable(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "exists", "unknown"]),
  value: z.string().trim().min(1).max(500),
  weight: z.number().min(0).max(1).nullable(),
  severity: z.enum(["reject", "major_penalty", "minor_penalty"]).nullable(),
  appliesToPropertyTypes: z.array(z.enum(BUYER_PROPERTY_TYPES)).max(20),
  sourceText: z.string().trim().min(1).max(300),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((criterion, ctx) => {
  if (criterion.key === "other" && !criterion.otherKey) {
    ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is required for other criteria" });
  }
  if (criterion.key !== "other" && criterion.otherKey) {
    ctx.addIssue({ code: "custom", path: ["otherKey"], message: "otherKey is only allowed for other criteria" });
  }
  if (criterion.criterionType === "preference" && criterion.weight === null) {
    ctx.addIssue({ code: "custom", path: ["weight"], message: "weight is required for preferences" });
  }
  if (criterion.criterionType === "exclusion" && criterion.severity === null) {
    ctx.addIssue({ code: "custom", path: ["severity"], message: "severity is required for exclusions" });
  }
});

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
  buyerCriteria: z.array(BuyerCriterionSuggestionSchema).max(30),
}).strict();

export type SalesAssistantNoteAnalysis = z.infer<typeof SalesAssistantNoteAnalysisSchema>;
export type BuyerCriterionSuggestion = z.infer<typeof BuyerCriterionSuggestionSchema>;
export type VerifiedBuyerCriterion = Omit<BuyerCriterionSuggestion, "value"> & { value: string | number | boolean };

const buyerCriterionSchema = {
  type: "object",
  required: ["criterionType","key","otherKey","operator","value","weight","severity","appliesToPropertyTypes","sourceText","confidence"],
  properties: {
    criterionType: { type: "string", format: "enum", enum: ["hard_requirement","preference","exclusion"] },
    key: { type: "string", format: "enum", enum: [...BUYER_CRITERION_KEYS] },
    otherKey: { type: "string", nullable: true },
    operator: { type: "string", format: "enum", enum: ["eq","neq","gt","gte","lt","lte","in","not_in","contains","exists","unknown"] },
    value: { type: "string" },
    weight: { type: "number", nullable: true },
    severity: { type: "string", nullable: true, format: "enum", enum: ["reject","major_penalty","minor_penalty"] },
    appliesToPropertyTypes: { type: "array", items: { type: "string", format: "enum", enum: [...BUYER_PROPERTY_TYPES] } },
    sourceText: { type: "string" },
    confidence: { type: "number" },
  },
};

const responseSchema = {
  type: "object",
  required: ["polishedNote","title","updateType","outcome","nextAction","nextFollowup","followupConfidence","calendarRecommended","calendarTitle","calendarDurationMinutes","propertyReference","explicitFacts","buyerCriteria"],
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
    buyerCriteria: { type: "array", items: buyerCriterionSchema },
  },
} as unknown as ResponseSchema;

function normalizedEvidence(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function normalizeBuyerCriterionValue(key: BuyerCriterionSuggestion["key"], rawValue: string): string | number | boolean {
  const value = rawValue.trim();
  const numericKeys = new Set([
    "bedrooms", "bathrooms", "total_budget", "purchase_price", "estimated_total_cost", "terrace_area_m2",
    "living_area_m2", "plot_area_m2", "distance_to_beach", "stairs",
  ]);
  if (numericKeys.has(key)) {
    const parsed = Number(value.replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (["has_lift", "parking", "pool"].includes(key)) {
    if (/^(true|yes|ja|sí|si)$/i.test(value)) return true;
    if (/^(false|no|nei)$/i.test(value)) return false;
  }
  return value;
}

export function verifiedBuyerCriteria(analysis: SalesAssistantNoteAnalysis, rawSource: string): VerifiedBuyerCriterion[] {
  const source = normalizedEvidence(rawSource);
  const seen = new Set<string>();
  const verified: VerifiedBuyerCriterion[] = [];

  for (const candidate of analysis.buyerCriteria) {
    const evidence = normalizedEvidence(candidate.sourceText);
    if (candidate.confidence < 0.9 || evidence.length < 2 || !source.includes(evidence)) continue;
    const value = normalizeBuyerCriterionValue(candidate.key, candidate.value);
    const signature = JSON.stringify([candidate.criterionType, candidate.key, candidate.otherKey || null, candidate.operator, value]);
    if (seen.has(signature)) continue;
    seen.add(signature);
    verified.push({ ...candidate, value });
  }
  return verified;
}

export function buildSalesAssistantPrompt(input: z.infer<typeof SalesAssistantNoteInputSchema>) {
  const parsed = SalesAssistantNoteInputSchema.parse(input);
  return `Current time: ${parsed.nowIso}\nTimezone: ${parsed.timezone}\nCustomer: ${parsed.customerName || "unknown"}\n\nRaw CRM source:\n${parsed.note}\n\nReturn JSON only. Rewrite the source into a concise professional CRM note while preserving meaning and chronology. Extract only facts explicitly stated.\n\nThe source may be a pasted email thread, forwarded message, WhatsApp conversation, SMS, meeting note, OCR text from an image/PDF, or a mixture of these. Apply these rules strictly:\n- Distinguish the customer's own statements from internal colleague notes and messages sent by the advisor. Never attribute an internal or outbound statement to the customer.\n- Ignore signatures, contact cards, legal footers, tracking notices, Gmail/Outlook/HubSpot UI text, image placeholders, quoted duplicates and repeated message chains when they add no new fact.\n- Preserve useful chronology when dates/times are present. A visit window or availability date that is already in the past relative to Current time is historical context only and must not become nextFollowup or a calendar event.\n- Infer a follow-up timestamp only when the source clearly requests or implies a future follow-up. Resolve relative expressions such as "in two weeks" from Current time in the given timezone. If timing is vague, historical, conflicting or uncertain, use null or confidence below 0.90.\n- Calendar is recommended only when nextFollowup is non-null and the source intends a future call, meeting or follow-up.\n- Do not invent budget, property criteria, outcome, urgency, commitments or customer preferences.\n- If the thread contains both customer requirements and later advisor/internal coordination, explicitFacts should identify the customer-backed facts separately from internal process notes.\n- If the source mentions a property/project name, keep it in propertyReference when appropriate.\n\nFor buyerCriteria, return only customer-backed property criteria with an exact short sourceText excerpt copied from Raw CRM source and confidence >= 0 only when there is explicit evidence. Use canonical keys. Important mappings: property type -> property_type; minimum bedrooms/bathrooms -> bedrooms/bathrooms with gte; area above a stated size -> living_area_m2 with gt/gte; preferred town/area -> location; not ground floor -> floor_position preference with neq and value ground_floor; named development/project -> other with otherKey development; explicit budget -> total_budget or purchase_price. Values must be plain strings without units (for example "3", "100", "Albir", "apartment", "ground_floor"). For preferences set weight 0-1; otherwise weight is null. For exclusions set severity; otherwise severity is null. Do not turn historical dates, advisor suggestions or internal statements into buyerCriteria.\n\nUse updateType=email for an email thread, whatsapp for WhatsApp, phone_call for a call note, and general_note when the source type cannot be determined reliably.`;
}

export async function analyzeSalesAssistantNote(input: z.infer<typeof SalesAssistantNoteInputSchema>): Promise<SalesAssistantNoteAnalysis> {
  const parsed = SalesAssistantNoteInputSchema.parse(input);
  const raw = await askClaude(buildSalesAssistantPrompt(parsed), {
    temperature: 0.1,
    maxTokens: 3200,
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
