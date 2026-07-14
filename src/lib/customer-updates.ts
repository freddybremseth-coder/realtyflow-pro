import { z } from "zod";

export const CUSTOMER_UPDATE_TYPES = [
  "general_note",
  "phone_call",
  "email",
  "whatsapp",
  "meeting",
  "viewing",
  "preference",
  "offer",
  "finance",
  "closing",
  "other",
] as const;

export const CUSTOMER_UPDATE_OUTCOMES = [
  "interested",
  "maybe",
  "not_interested",
  "second_viewing",
  "offer_considered",
  "offer_submitted",
  "waiting_customer",
  "waiting_third_party",
  "other",
] as const;

export const CUSTOMER_PIPELINE_STATUSES = [
  "NEW",
  "CONTACT",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ON_HOLD",
] as const;

const nullableText = (max: number) => z.preprocess(
  (value) => {
    const text = String(value ?? "").trim();
    return text || null;
  },
  z.string().max(max).nullable(),
);

const nullableEmail = z.preprocess(
  (value) => {
    const text = String(value ?? "").trim().toLowerCase();
    return text || null;
  },
  z.string().email().max(320).nullable(),
);

const nullableNumber = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? null : Number(value),
  z.number().finite().nonnegative().max(1_000_000_000).nullable(),
);

export const CustomerDetailsInputSchema = z.object({
  action: z.literal("UPDATE_DETAILS"),
  details: z.object({
    name: nullableText(180),
    email: nullableEmail,
    phone: nullableText(80),
    country: nullableText(100),
    language: nullableText(40),
    preferredLocation: nullableText(500),
    propertyInterest: nullableText(1500),
    pipelineValue: nullableNumber,
    pipelineStatus: z.enum(CUSTOMER_PIPELINE_STATUSES),
  }).strict(),
}).strict();

export const CustomerTimelineUpdateInputSchema = z.object({
  action: z.literal("ADD_UPDATE"),
  update: z.object({
    updateType: z.enum(CUSTOMER_UPDATE_TYPES),
    occurredAt: z.string().datetime(),
    title: nullableText(180),
    details: z.string().trim().min(1).max(8000),
    propertyReference: nullableText(300),
    outcome: z.enum(CUSTOMER_UPDATE_OUTCOMES).nullable(),
    nextAction: nullableText(1500),
    nextFollowup: z.string().datetime().nullable(),
    direction: z.enum(["in", "out", "internal"]).default("internal"),
  }).strict(),
}).strict();

export const CustomerUpdateRequestSchema = z.discriminatedUnion("action", [
  CustomerDetailsInputSchema,
  CustomerTimelineUpdateInputSchema,
]);

export type CustomerUpdateRequest = z.infer<typeof CustomerUpdateRequestSchema>;
export type CustomerTimelineUpdate = z.infer<typeof CustomerTimelineUpdateInputSchema>["update"];

export const CUSTOMER_UPDATE_TYPE_LABELS: Record<(typeof CUSTOMER_UPDATE_TYPES)[number], string> = {
  general_note: "Kundenotat",
  phone_call: "Telefonsamtale",
  email: "E-post",
  whatsapp: "WhatsApp",
  meeting: "Møte",
  viewing: "Visning",
  preference: "Nye kundeønsker",
  offer: "Tilbud / bud",
  finance: "Økonomi / finansiering",
  closing: "Closing / juridisk",
  other: "Annen oppdatering",
};

export const CUSTOMER_UPDATE_OUTCOME_LABELS: Record<(typeof CUSTOMER_UPDATE_OUTCOMES)[number], string> = {
  interested: "Interessert",
  maybe: "Mulig interesse",
  not_interested: "Ikke interessert",
  second_viewing: "Ønsker ny visning",
  offer_considered: "Vurderer tilbud",
  offer_submitted: "Tilbud gitt",
  waiting_customer: "Venter på kunden",
  waiting_third_party: "Venter på tredjepart",
  other: "Annet resultat",
};

export function contactDetailPatch(details: z.infer<typeof CustomerDetailsInputSchema>["details"]) {
  return {
    name: details.name,
    email: details.email,
    phone: details.phone,
    country: details.country,
    language: details.language,
    preferred_location: details.preferredLocation,
    property_interest: details.propertyInterest,
    pipeline_value: details.pipelineValue,
    pipeline_status: details.pipelineStatus,
  };
}

export function buildCustomerTimelineInteraction(params: {
  update: CustomerTimelineUpdate;
  actorEmail: string;
  id?: string;
}) {
  const typeMap: Record<CustomerTimelineUpdate["updateType"], string> = {
    general_note: "customer_note",
    phone_call: "call",
    email: "email",
    whatsapp: "whatsapp",
    meeting: "meeting",
    viewing: "viewing",
    preference: "preference",
    offer: "offer",
    finance: "finance",
    closing: "closing",
    other: "customer_update",
  };
  const outcomeLabel = params.update.outcome ? CUSTOMER_UPDATE_OUTCOME_LABELS[params.update.outcome] : null;
  const content = [
    params.update.title ? `Overskrift: ${params.update.title}` : null,
    params.update.details,
    params.update.propertyReference ? `Bolig / referanse: ${params.update.propertyReference}` : null,
    outcomeLabel ? `Resultat: ${outcomeLabel}` : null,
    params.update.nextAction ? `Neste handling: ${params.update.nextAction}` : null,
    params.update.nextFollowup ? `Neste oppfølging: ${params.update.nextFollowup}` : null,
  ].filter(Boolean).join("\n");

  return {
    id: params.id || crypto.randomUUID(),
    type: typeMap[params.update.updateType],
    date: params.update.occurredAt,
    direction: params.update.direction,
    content,
    metadata: {
      source: "customer-360",
      update_type: params.update.updateType,
      title: params.update.title,
      property_reference: params.update.propertyReference,
      outcome: params.update.outcome,
      outcome_label: outcomeLabel,
      next_action: params.update.nextAction,
      next_followup: params.update.nextFollowup,
      actor_email: params.actorEmail.toLowerCase(),
      no_customer_contact: true,
    },
  };
}

export function appendCustomerInteraction(existing: unknown, interaction: ReturnType<typeof buildCustomerTimelineInteraction>, limit = 500) {
  const rows = Array.isArray(existing) ? existing.filter((item) => item && typeof item === "object") : [];
  return [...rows, interaction].slice(-Math.max(1, limit));
}

export function changedCustomerDetailFields(current: Record<string, unknown>, patch: Record<string, unknown>) {
  return Object.entries(patch)
    .filter(([key, value]) => String(current[key] ?? "") !== String(value ?? ""))
    .map(([key]) => key);
}
