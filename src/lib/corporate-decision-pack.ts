type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function txt(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

export function buildCorporateDecisionPack(input: {
  company_name: string;
  status?: string | null;
  fit_tier?: string | null;
  fit_score?: number | null;
  evidence?: Obj | null;
}) {
  const status = String(input.status || "").toUpperCase();
  if (status !== "OPPORTUNITY") {
    throw new Error("Prospektet må stå i OPPORTUNITY før beslutningspakken kan bygges.");
  }

  const evidence = obj(input.evidence);
  const assessment = obj(evidence.corporate_assessment);
  const propertyMatch = obj(evidence.corporate_property_match);
  const shortlist = Array.isArray(propertyMatch.shortlist)
    ? propertyMatch.shortlist.filter((item) => item && typeof item === "object").slice(0, 5) as Obj[]
    : [];

  if (!shortlist.length) {
    throw new Error("Boligshortlist må være lagret og kvalitetssikret før beslutningspakken kan bygges.");
  }

  const budgetMax = num(assessment.budget_max_eur);
  const expectedUsers = num(assessment.expected_users);
  const usageWeeks = num(assessment.usage_weeks_per_year);
  const ownershipYears = num(assessment.ownership_years);
  const topPrice = num(shortlist[0]?.price);

  const usageCapacity = expectedUsers && usageWeeks ? expectedUsers * usageWeeks : null;
  const purchasePerUser = topPrice && expectedUsers ? Math.round(topPrice / expectedUsers) : null;
  const purchasePerPlannedUserWeek = topPrice && usageCapacity ? Math.round(topPrice / usageCapacity) : null;
  const annualizedPurchase = topPrice && ownershipYears ? Math.round(topPrice / ownershipYears) : null;

  const openItems = [
    "Skatt og juridisk struktur må kvalitetssikres av kvalifiserte rådgivere.",
    "Årlige felleskostnader, forsikring, skatt, strøm, vedlikehold og lokal drift må beregnes på valgt bolig.",
    "Bookingregler, intern fordelingsmodell og ansvar for skader må vedtas internt.",
    "Endelig bolig må kvalitetssikres før den deles som anbefaling.",
  ];

  return {
    title: `${input.company_name} · Corporate Decision Pack`,
    generated_at: new Date().toISOString(),
    company: {
      name: input.company_name,
      fit_tier: input.fit_tier || "UNSCORED",
      fit_score: Number(input.fit_score || 0),
    },
    assessment: {
      model: txt(assessment.model),
      budget_max_eur: budgetMax,
      expected_users: expectedUsers,
      usage_weeks_per_year: usageWeeks,
      preferred_area: txt(assessment.preferred_area),
      bedrooms_min: num(assessment.bedrooms_min),
      property_type: txt(assessment.property_type),
      ownership_years: ownershipYears,
    },
    shortlist: shortlist.map((property, index) => ({
      rank: index + 1,
      ref: txt(property.ref),
      title: txt(property.title),
      location: txt(property.location),
      price: num(property.price),
      bedrooms: num(property.bedrooms),
      property_type: txt(property.property_type),
      website_url: txt(property.website_url),
      match_score: num(property.corporate_match_score),
      use_classification: txt(property.corporate_use_classification),
      reasons: Array.isArray(property.corporate_match_reasons) ? property.corporate_match_reasons.slice(0, 5) : [],
      cautions: Array.isArray(property.corporate_match_cautions) ? property.corporate_match_cautions.slice(0, 3) : [],
    })),
    economics: {
      basis_property_price_eur: topPrice,
      budget_headroom_eur: budgetMax && topPrice ? budgetMax - topPrice : null,
      purchase_per_expected_user_eur: purchasePerUser,
      purchase_per_planned_user_week_eur: purchasePerPlannedUserWeek,
      annualized_purchase_price_eur: annualizedPurchase,
      note: "Forenklede interne nøkkeltall basert på kjøpesum. Drift, finansiering, skatt og transaksjonskostnader er ikke inkludert.",
    },
    board_case: [
      {
        label: "Strategisk formål",
        status: txt(assessment.model) ? "ready" : "open",
        note: txt(assessment.model) || "Modell/formål må bekreftes.",
      },
      {
        label: "Investeringsramme",
        status: budgetMax && topPrice && topPrice <= budgetMax ? "ready" : "review",
        note: budgetMax && topPrice
          ? `Toppkandidat €${topPrice.toLocaleString("nb-NO")} mot maksbudsjett €${budgetMax.toLocaleString("nb-NO")}.`
          : "Budsjett eller boligpris mangler.",
      },
      {
        label: "Kapasitet og bruk",
        status: expectedUsers && usageWeeks ? "ready" : "open",
        note: expectedUsers && usageWeeks
          ? `${expectedUsers} forventede brukere og ${usageWeeks} planlagte bruksuker per år.`
          : "Brukergrunnlag må kompletteres.",
      },
      {
        label: "Boliggrunnlag",
        status: shortlist.length >= 3 ? "ready" : "review",
        note: `${shortlist.length} interne kandidater er lagret.`,
      },
      {
        label: "Skatt/juridisk/drift",
        status: "external",
        note: "Krever ekstern kvalitetssikring og boligspesifikke driftsestimater.",
      },
    ],
    open_items: openItems,
    governance: {
      internal_only: true,
      customer_shared: false,
      human_quality_check_required: true,
      automatic_customer_contact: false,
      investment_advice: false,
    },
  };
}
