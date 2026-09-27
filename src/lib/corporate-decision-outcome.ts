type Obj = Record<string, unknown>;

export type CorporateDecisionOutcome =
  | "APPROVE_VIEWINGS"
  | "APPROVE_OFFER_PREP"
  | "NEEDS_CHANGES"
  | "HOLD";

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function buildCorporateDecisionOutcome(input: {
  status?: string | null;
  evidence?: Obj | null;
  outcome: CorporateDecisionOutcome;
  selectedPropertyRef?: string | null;
  note?: string | null;
  now?: Date;
}) {
  const status = text(input.status).toUpperCase();
  if (status !== "OPPORTUNITY") {
    throw new Error("Beslutningsutfall kan bare registreres for en aktiv OPPORTUNITY.");
  }

  const evidence = obj(input.evidence);
  const pack = obj(evidence.corporate_decision_pack);
  const shortlist = Array.isArray(pack.shortlist)
    ? pack.shortlist.filter((item) => item && typeof item === "object") as Obj[]
    : [];
  if (!shortlist.length) {
    throw new Error("Corporate Decision Pack må bygges før beslutningsutfall registreres.");
  }

  const selectedRef = text(input.selectedPropertyRef) || null;
  if (input.outcome === "APPROVE_OFFER_PREP") {
    if (!selectedRef) throw new Error("Velg bolig før tilbudsforberedelse godkjennes.");
    const exists = shortlist.some((property) => text(property.ref) === selectedRef);
    if (!exists) throw new Error("Valgt bolig finnes ikke i den lagrede Decision Pack-shortlisten.");
  }

  const now = input.now || new Date();
  const topViewingRefs = shortlist.slice(0, 3).map((property) => text(property.ref)).filter(Boolean);
  const nextFollowup = new Date(now);
  nextFollowup.setUTCDate(nextFollowup.getUTCDate() + (input.outcome === "HOLD" ? 14 : 2));

  const config = {
    APPROVE_VIEWINGS: {
      label: "Godkjent for visningsplan",
      nextAction: "Kvalitetssjekk toppkandidater og avtal eventuell visning manuelt med selskapet og utbygger/megler.",
    },
    APPROVE_OFFER_PREP: {
      label: "Godkjent for tilbudsforberedelse",
      nextAction: "Kontroller pris, tilgjengelighet, vilkår og rådgiverbehov før et konkret tilbud eller reservasjon diskuteres med kunden.",
    },
    NEEDS_CHANGES: {
      label: "Decision Pack må revideres",
      nextAction: "Oppdater assessment, shortlist eller økonomiske forutsetninger og bygg Decision Pack på nytt.",
    },
    HOLD: {
      label: "Satt på hold",
      nextAction: "Følg opp beslutningen manuelt etter avtalt pause og bekreft om Opportunity fortsatt er aktiv.",
    },
  }[input.outcome];

  const outcome = {
    outcome: input.outcome,
    label: config.label,
    decided_at: now.toISOString(),
    note: text(input.note) || null,
    selected_property_ref: input.outcome === "APPROVE_OFFER_PREP" ? selectedRef : null,
    viewing_candidate_refs: input.outcome === "APPROVE_VIEWINGS" ? topViewingRefs : [],
    customer_message_sent: false,
    calendar_action_created: false,
    offer_sent: false,
    reservation_created: false,
    human_execution_required: true,
  };

  return {
    status: "OPPORTUNITY",
    next_action: config.nextAction,
    next_followup: nextFollowup.toISOString(),
    evidence: {
      ...evidence,
      corporate_decision_outcome: outcome,
    },
    outcome,
  };
}
