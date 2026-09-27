function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textValue(value: unknown) {
  const valueText = String(value ?? "").trim();
  return valueText || null;
}

function euro(value: number | null) {
  return value ? `€${value.toLocaleString("nb-NO")}` : "ikke oppgitt";
}

export type CorporateOpportunityPackInput = {
  company_name: string;
  status?: string | null;
  fit_tier?: string | null;
  fit_score?: number | null;
  evidence?: Record<string, unknown> | null;
};

export function buildCorporateOpportunityPack(input: CorporateOpportunityPackInput, now = new Date()) {
  const status = String(input.status || "").toUpperCase();
  if (status !== "OPPORTUNITY") {
    throw new Error("Prospektet må stå i OPPORTUNITY før beslutningspakken kan bygges.");
  }

  const evidence = objectValue(input.evidence);
  const assessment = objectValue(evidence.corporate_assessment);
  const propertyMatch = objectValue(evidence.corporate_property_match);
  const shortlist = Array.isArray(propertyMatch.shortlist)
    ? propertyMatch.shortlist.filter((item) => item && typeof item === "object")
    : [];

  if (!shortlist.length) {
    throw new Error("Lag og lagre en Corporate Home-shortlist før beslutningspakken bygges.");
  }

  const budgetMax = numberValue(assessment.budget_max_eur);
  const expectedUsers = numberValue(assessment.expected_users);
  const usageWeeks = numberValue(assessment.usage_weeks_per_year);
  const preferredArea = textValue(assessment.preferred_area);
  const propertyType = textValue(assessment.property_type);
  const model = textValue(assessment.model);
  const bedroomsMin = numberValue(assessment.bedrooms_min);

  const topProperties = shortlist.slice(0, 3).map((raw: any, index) => {
    const price = numberValue(raw.price);
    const budgetDelta = budgetMax && price ? budgetMax - price : null;
    return {
      rank: index + 1,
      ref: textValue(raw.ref),
      title: textValue(raw.title) || textValue(raw.ref) || `Bolig ${index + 1}`,
      location: textValue(raw.location),
      price,
      website_url: textValue(raw.website_url),
      bedrooms: numberValue(raw.bedrooms),
      property_type: textValue(raw.property_type),
      match_score: numberValue(raw.corporate_match_score),
      use_classification: textValue(raw.corporate_use_classification),
      budget_delta_eur: budgetDelta,
      within_budget: budgetDelta === null ? null : budgetDelta >= 0,
      reasons: Array.isArray(raw.corporate_match_reasons) ? raw.corporate_match_reasons.slice(0, 4) : [],
      cautions: Array.isArray(raw.corporate_match_cautions) ? raw.corporate_match_cautions.slice(0, 3) : [],
    };
  });

  const executiveSummary = [
    `${input.company_name} er kvalifisert som en aktiv Zen Corporate Homes-opportunity.`,
    model ? `Arbeidsmodell: ${model}.` : null,
    budgetMax ? `Dokumentert maksimal investeringsramme: ${euro(budgetMax)}.` : null,
    expectedUsers ? `Forventet brukerbase: ${expectedUsers.toLocaleString("nb-NO")} personer.` : null,
    usageWeeks ? `Planlagt bruk: ${usageWeeks.toLocaleString("nb-NO")} uker per år.` : null,
    preferredArea ? `Foretrukket område: ${preferredArea}.` : null,
    propertyType ? `Boligtype: ${propertyType}${bedroomsMin ? `, minimum ${bedroomsMin} soverom` : ""}.` : null,
  ].filter(Boolean).join(" ");

  const decisionPoints = [
    model ? `Bekreft at «${model}» er riktig eier-/bruksmodell internt.` : "Bekreft endelig eier-/bruksmodell.",
    "Velg hvilke 1–3 boliger som skal inngå i neste beslutningsrunde.",
    "Avklar styre-/ledergodkjenning, signaturfullmakt og ønsket beslutningstidspunkt.",
    "Kvalitetssikre skatt, juridisk struktur og regnskapsmessig behandling med kvalifiserte rådgivere.",
    "Avklar lokal drift: nøkkelhold, renhold, vedlikehold, booking og årlig kontroll.",
  ];

  return {
    generated_at: now.toISOString(),
    company_name: input.company_name,
    fit: {
      tier: String(input.fit_tier || "UNSCORED"),
      score: Number(input.fit_score || 0),
    },
    executive_summary: executiveSummary,
    commercial_frame: {
      model,
      budget_max_eur: budgetMax,
      expected_users: expectedUsers,
      usage_weeks_per_year: usageWeeks,
      preferred_area: preferredArea,
      property_type: propertyType,
      bedrooms_min: bedroomsMin,
    },
    shortlist: topProperties,
    decision_points: decisionPoints,
    recommended_next_step: "Kvalitetssjekk topp 3, velg kandidat(er) for styre-/lederpresentasjon og avtal konkret beslutningssteg.",
    guardrails: [
      "Internt arbeidsgrunnlag; ikke automatisk delt med kunde.",
      "Boligdata må kontrolleres mot aktuell tilgjengelighet og pris før ekstern bruk.",
      "Skatt, juridisk struktur og regnskapsmessig behandling må kvalitetssikres av kvalifiserte rådgivere.",
      "Ingen avkastning, skattebesparelse eller juridisk effekt skal fremstilles som garantert.",
    ],
    customer_shared: false,
    human_quality_check_required: true,
    automatic_customer_contact: false,
  };
}

export function opportunityPackToText(pack: ReturnType<typeof buildCorporateOpportunityPack>) {
  const propertyLines = pack.shortlist.map((property) => {
    const budgetText = property.budget_delta_eur === null
      ? "budsjettavvik ikke beregnet"
      : property.budget_delta_eur >= 0
        ? `${euro(property.budget_delta_eur)} under maksbudsjett`
        : `${euro(Math.abs(property.budget_delta_eur))} over maksbudsjett`;
    return `${property.rank}. ${property.title} · ${property.location || "område ikke oppgitt"} · ${euro(property.price)} · match ${property.match_score || "–"}/100 · ${budgetText}`;
  });

  return [
    `ZEN CORPORATE HOMES · OPPORTUNITY PACK · ${pack.company_name}`,
    "",
    pack.executive_summary,
    "",
    "TOPP 3",
    ...propertyLines,
    "",
    "BESLUTNINGSPUNKTER",
    ...pack.decision_points.map((point) => `• ${point}`),
    "",
    `Neste steg: ${pack.recommended_next_step}`,
    "",
    "Internt arbeidsgrunnlag. Ikke kundedelt.",
  ].join("\n");
}
