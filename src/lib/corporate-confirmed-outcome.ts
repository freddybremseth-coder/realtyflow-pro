type Obj = Record<string, unknown>;

export type CorporateConfirmedOutcomeType = "VIEWING_COMPLETED" | "OFFER_MADE";

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function positive(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildCorporateConfirmedOutcome(input: {
  status?: string | null;
  evidence?: Obj | null;
  convertedContactId?: string | null;
  type: CorporateConfirmedOutcomeType;
  propertyRef?: string | null;
  occurredAt?: string | Date | null;
  offerAmountEur?: number | string | null;
  note?: string | null;
}) {
  const status = text(input.status).toUpperCase();
  if (status !== "OPPORTUNITY") {
    throw new Error("Bekreftet salgsutfall kan bare registreres for en aktiv OPPORTUNITY.");
  }
  const contactId = text(input.convertedContactId);
  if (!contactId) {
    throw new Error("Prospektet må være promotert til CRM før et kanonisk Revenue Outcome registreres.");
  }

  const evidence = obj(input.evidence);
  const plan = obj(evidence.corporate_execution_plan);
  const planKind = text(plan.kind).toUpperCase();
  const propertyRef = text(input.propertyRef);
  const when = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error("Ugyldig tidspunkt for utfallet.");

  if (input.type === "VIEWING_COMPLETED") {
    if (planKind !== "VIEWING_PLAN") throw new Error("En lagret visningsplan kreves før fullført visning kan registreres.");
    const properties = Array.isArray(plan.properties)
      ? plan.properties.filter((item) => item && typeof item === "object") as Obj[]
      : [];
    const selected = properties.find((property) => text(property.ref) === propertyRef);
    if (!propertyRef || !selected) {
      throw new Error("Velg en bolig fra den lagrede visningsplanen.");
    }

    return {
      eventType: "viewing_completed" as const,
      crmPipelineStatus: "VIEWING" as const,
      occurredAt: when.toISOString(),
      propertyRef,
      pipelineValueEur: positive(selected.price),
      offerAmountEur: null,
      note: text(input.note) || null,
      nextAction: "Registrer konkret visningsfeedback og avklar om selskapet vil gå videre med en bolig, se flere alternativer eller revidere shortlisten.",
    };
  }

  if (planKind !== "OFFER_PREP") throw new Error("En lagret tilbudspreflight kreves før faktisk tilbud kan registreres.");
  const selected = obj(plan.property);
  const selectedRef = text(selected.ref);
  if (!selectedRef || (propertyRef && propertyRef !== selectedRef)) {
    throw new Error("Tilbudet må gjelde boligen som er valgt i tilbudspreflighten.");
  }

  const offerAmountEur = positive(input.offerAmountEur);
  return {
    eventType: "offer_made" as const,
    crmPipelineStatus: "NEGOTIATION" as const,
    occurredAt: when.toISOString(),
    propertyRef: selectedRef,
    pipelineValueEur: offerAmountEur || positive(selected.price),
    offerAmountEur,
    note: text(input.note) || null,
    nextAction: "Følg tilbudet aktivt: avklar respons, pris/vilkår, reservasjon, beslutningsmyndighet og konkret neste steg mot avtale.",
  };
}

export function appendCorporateConfirmedOutcome(
  evidence: Obj | null | undefined,
  outcome: Record<string, unknown>,
) {
  const root = obj(evidence);
  const current = Array.isArray(root.corporate_confirmed_outcomes)
    ? root.corporate_confirmed_outcomes.filter((item) => item && typeof item === "object")
    : [];
  return {
    ...root,
    corporate_confirmed_outcomes: [...current, outcome].slice(-20),
    latest_corporate_confirmed_outcome: outcome,
  };
}
