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
  "MATCHING",
  "VIEWING",
  "NEGOTIATION",
  "RESERVED",
  "ON_HOLD",
  "WON",
  "LOST",
] as const;

export type CustomerPipelineStatus = (typeof CUSTOMER_PIPELINE_STATUSES)[number];
export type CustomerWaitingOn = "customer" | "third_party";

export const CUSTOMER_PIPELINE_STATUS_LABELS: Record<CustomerPipelineStatus, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  MATCHING: "Boligmatching",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  RESERVED: "Reservert",
  ON_HOLD: "På vent",
  WON: "Gjennomført",
  LOST: "Tapt",
};

export function normalizeCustomerPipelineStatus(value: unknown): CustomerPipelineStatus {
  const normalized = String(value || "NEW")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Æ/g, "AE")
    .replace(/Ø/g, "O")
    .replace(/Å/g, "A")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (["WON", "CUSTOMER", "VIP", "VUNNET", "SOLGT", "SOLD", "CLOSED", "CLOSED_WON", "COMPLETED", "KUNDE"].includes(normalized)) return "WON";
  if (["LOST", "TAPT", "CLOSED_LOST"].includes(normalized)) return "LOST";
  if (["PROPERTY_MATCHING", "SHORTLIST", "MATCH", "MATCHING"].includes(normalized)) return "MATCHING";
  if (["RESERVATION", "RESERVERT", "RESERVED", "DEPOSIT_PAID"].includes(normalized)) return "RESERVED";
  if (["WAITING", "PAUSED", "HOLD", "ON_HOLD"].includes(normalized)) return "ON_HOLD";
  return CUSTOMER_PIPELINE_STATUSES.includes(normalized as CustomerPipelineStatus)
    ? normalized as CustomerPipelineStatus
    : "NEW";
}

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
    pipelineStatus: z.preprocess(normalizeCustomerPipelineStatus, z.enum(CUSTOMER_PIPELINE_STATUSES)),
  }).strict(),
}).strict();

const CustomerTimelineUpdateSchema = z.object({
  updateType: z.enum(CUSTOMER_UPDATE_TYPES),
  occurredAt: z.string().datetime(),
  title: nullableText(180),
  details: z.string().trim().min(1).max(8000),
  propertyReference: nullableText(300),
  outcome: z.enum(CUSTOMER_UPDATE_OUTCOMES).nullable(),
  nextAction: nullableText(1500),
  nextFollowup: z.string().datetime().nullable(),
  direction: z.enum(["in", "out", "internal"]).default("internal"),
}).strict().superRefine((update, ctx) => {
  if (["waiting_customer", "waiting_third_party"].includes(update.outcome || "") && !update.nextFollowup) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nextFollowup"],
      message: "Ventetilstand krever en konkret dato for gjenopptakelse.",
    });
  }
});

export const CustomerTimelineUpdateInputSchema = z.object({
  action: z.literal("ADD_UPDATE"),
  update: CustomerTimelineUpdateSchema,
}).strict();

export const CustomerUpdateRequestSchema = z.discriminatedUnion("action", [
  CustomerDetailsInputSchema,
  CustomerTimelineUpdateInputSchema,
]);

export type CustomerUpdateRequest = z.infer<typeof CustomerUpdateRequestSchema>;
export type CustomerTimelineUpdate = z.infer<typeof CustomerTimelineUpdateSchema>;

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

export function customerWaitingStatePatch(update: CustomerTimelineUpdate) {
  if (update.outcome === "waiting_customer" || update.outcome === "waiting_third_party") {
    const waitingOn: CustomerWaitingOn = update.outcome === "waiting_customer" ? "customer" : "third_party";
    const waitingReason = update.title || update.details.slice(0, 1500);
    return {
      waiting_on: waitingOn,
      waiting_reason: waitingReason,
      waiting_until: update.nextFollowup,
      next_followup: update.nextFollowup,
    };
  }

  // A concrete non-waiting outcome means the previous wait has resolved.
  // An internal/general note with outcome=null or outcome=other must not silently clear waiting.
  if (update.outcome && update.outcome !== "other") {
    return {
      waiting_on: null,
      waiting_reason: null,
      waiting_until: null,
      next_followup: update.nextFollowup,
    };
  }

  return {};
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

export function appendCustomerInteraction<T extends Record<string, unknown>>(existing: unknown, interaction: T, limit = 500) {
  const rows = Array.isArray(existing) ? existing.filter((item) => item && typeof item === "object") : [];
  return [...rows, interaction].slice(-Math.max(1, limit));
}

export function changedCustomerDetailFields(current: Record<string, unknown>, patch: Record<string, unknown>) {
  return Object.entries(patch)
    .filter(([key, value]) => String(current[key] ?? "") !== String(value ?? ""))
    .map(([key]) => key);
}
