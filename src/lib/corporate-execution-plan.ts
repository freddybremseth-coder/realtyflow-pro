type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildCorporateExecutionPlan(input: {
  status?: string | null;
  evidence?: Obj | null;
  now?: Date;
}) {
  const status = text(input.status).toUpperCase();
  if (status !== "OPPORTUNITY") {
    throw new Error("Gjennomføringsplan kan bare bygges for en aktiv OPPORTUNITY.");
  }

  const evidence = obj(input.evidence);
  const pack = obj(evidence.corporate_decision_pack);
  const decision = obj(evidence.corporate_decision_outcome);
  const shortlist = Array.isArray(pack.shortlist)
    ? pack.shortlist.filter((item) => item && typeof item === "object") as Obj[]
    : [];
  const outcome = text(decision.outcome).toUpperCase();

  if (!shortlist.length) throw new Error("Corporate Decision Pack mangler boligshortlist.");
  if (!["APPROVE_VIEWINGS", "APPROVE_OFFER_PREP"].includes(outcome)) {
    throw new Error("Styre-/lederutfallet må godkjenne visning eller tilbudsforberedelse først.");
  }

  const now = input.now || new Date();

  if (outcome === "APPROVE_VIEWINGS") {
    const refs = Array.isArray(decision.viewing_candidate_refs)
      ? decision.viewing_candidate_refs.map(text).filter(Boolean).slice(0, 3)
      : [];
    const candidates = refs
      .map((ref) => shortlist.find((property) => text(property.ref) === ref))
      .filter(Boolean) as Obj[];

    if (!candidates.length) throw new Error("Ingen godkjente visningskandidater finnes i Decision Pack.");

    return {
      kind: "VIEWING_PLAN" as const,
      created_at: now.toISOString(),
      properties: candidates.map((property, index) => ({
        order: index + 1,
        ref: text(property.ref),
        title: text(property.title) || null,
        location: text(property.location) || null,
        price: numberValue(property.price),
        website_url: text(property.website_url) || null,
        match_score: numberValue(property.match_score),
        preflight: [
          "Bekreft at boligen fortsatt er tilgjengelig.",
          "Bekreft aktuell pris og eventuelle kampanje-/reservasjonsvilkår.",
          "Avklar tilgang og mulig visningstid med utbygger/megler.",
          "Kontroller at boligdata og bilder fortsatt er korrekte.",
          "Noter hva selskapet spesielt skal vurdere ved denne boligen.",
        ],
      })),
      next_action: "Bekreft tilgjengelighet og avtal visningstidene manuelt før planen deles med selskapet.",
      governance: {
        customer_message_sent: false,
        calendar_action_created: false,
        external_booking_created: false,
        human_confirmation_required: true,
      },
    };
  }

  const selectedRef = text(decision.selected_property_ref);
  const selected = shortlist.find((property) => text(property.ref) === selectedRef);
  if (!selected) throw new Error("Valgt tilbudsbolig finnes ikke lenger i Decision Pack.");

  return {
    kind: "OFFER_PREP" as const,
    created_at: now.toISOString(),
    property: {
      ref: text(selected.ref),
      title: text(selected.title) || null,
      location: text(selected.location) || null,
      price: numberValue(selected.price),
      website_url: text(selected.website_url) || null,
      match_score: numberValue(selected.match_score),
    },
    preflight: [
      { key: "availability", label: "Tilgjengelighet bekreftet", required: true },
      { key: "price", label: "Pris og inkluderte ytelser bekreftet", required: true },
      { key: "reservation", label: "Reservasjonsvilkår og beløp innhentet", required: true },
      { key: "authority", label: "Selskapets beslutningsmyndighet/fullmakt avklart", required: true },
      { key: "funding", label: "Finansiering/betalingsmåte avklart", required: true },
      { key: "legal", label: "Advokat/juridisk rådgiver avklart", required: true },
      { key: "tax", label: "Skatt og selskapsstruktur sendt til kvalifisert rådgiver ved behov", required: true },
    ],
    next_action: "Fullfør tilbudspreflight manuelt før pris, reservasjon eller tilbud kommuniseres til selger/utbygger.",
    governance: {
      customer_message_sent: false,
      seller_message_sent: false,
      offer_sent: false,
      reservation_created: false,
      payment_initiated: false,
      human_confirmation_required: true,
    },
  };
}
