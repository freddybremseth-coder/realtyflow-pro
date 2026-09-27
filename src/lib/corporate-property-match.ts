export type CorporateModel =
  | "employee_home"
  | "corporate_villa"
  | "shared_corporate_home"
  | "member_home"
  | "unspecified";

export type CorporatePropertyClassification =
  | "Employee Home"
  | "Executive Home"
  | "Corporate Retreat"
  | "Member Home"
  | "Not recommended";

export type CorporatePropertyAssessment = {
  model?: unknown;
  budget_min_eur?: unknown;
  budget_max_eur?: unknown;
  expected_users?: unknown;
  usage_weeks_per_year?: unknown;
  preferred_area?: unknown;
  bedrooms_min?: unknown;
  property_type?: unknown;
  ownership_years?: unknown;
  airport_max_minutes?: unknown;
};

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function truthy(value: unknown) {
  return value === true || String(value || "").toLowerCase() === "true";
}

export function normalizeCorporateModel(value: unknown): CorporateModel {
  const raw = textValue(value).toLowerCase();
  if (/ansatt|employee/.test(raw)) return "employee_home";
  if (/bedriftsvilla|corporate villa|executive/.test(raw)) return "corporate_villa";
  if (/delt|shared/.test(raw)) return "shared_corporate_home";
  if (/medlem|member/.test(raw)) return "member_home";
  return "unspecified";
}

function normalizedPropertyText(property: Record<string, unknown>) {
  return [
    property.title,
    property.title_no,
    property.location,
    property.town,
    property.region_bucket,
    property.property_type,
    property.type,
    property.description_no,
  ].filter(Boolean).join(" ").toLowerCase();
}

function propertyTypeKind(property: Record<string, unknown>) {
  const haystack = normalizedPropertyText(property);
  if (/villa|frittstående|detached/.test(haystack)) return "villa";
  if (/penthouse|toppetasje/.test(haystack)) return "penthouse";
  if (/rekkehus|townhouse|duplex/.test(haystack)) return "townhouse";
  if (/leilighet|apartment|apartamento/.test(haystack)) return "apartment";
  return "other";
}

function areaMatches(property: Record<string, unknown>, preferredArea: string) {
  const normalized = preferredArea.toLowerCase();
  if (!normalized || /åpen|open|costa blanca\s*\/\s*åpen/.test(normalized)) return null;
  const terms = normalized
    .split(/[,/;]|\seller\s|\bor\b/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
  if (!terms.length) return null;
  const haystack = normalizedPropertyText(property);
  return terms.some((term) => haystack.includes(term));
}

function requestedTypeMatches(property: Record<string, unknown>, requested: string) {
  const normalized = requested.toLowerCase();
  if (!normalized) return null;
  const terms = normalized
    .split(/[,/]|\seller\s/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
  if (!terms.length) return null;
  const haystack = normalizedPropertyText(property);
  return terms.some((term) => haystack.includes(term));
}

function classifyProperty(property: Record<string, unknown>, score: number): CorporatePropertyClassification {
  if (score < 35) return "Not recommended";
  const kind = propertyTypeKind(property);
  const bedrooms = numberValue(property.bedrooms) || 0;
  const bathrooms = numberValue(property.bathrooms) || 0;
  const builtArea = numberValue(property.built_area || property.area_m2) || 0;
  const price = numberValue(property.price) || 0;
  const plot = numberValue(property.plot_size) || 0;

  if (kind === "villa" && (bedrooms >= 4 || builtArea >= 180 || plot >= 500)) return "Corporate Retreat";
  if ((kind === "villa" || kind === "penthouse") && price >= 750_000 && bedrooms >= 3 && bathrooms >= 2) return "Executive Home";
  if (["apartment", "penthouse", "townhouse"].includes(kind) && bedrooms >= 2) return "Member Home";
  return "Employee Home";
}

function addModelFit(
  property: Record<string, unknown>,
  model: CorporateModel,
  reasons: string[],
  cautions: string[],
) {
  let score = 0;
  const kind = propertyTypeKind(property);
  const bedrooms = numberValue(property.bedrooms) || 0;
  const bathrooms = numberValue(property.bathrooms) || 0;
  const builtArea = numberValue(property.built_area || property.area_m2) || 0;
  const plot = numberValue(property.plot_size) || 0;
  const hasGarage = truthy(property.garage);
  const hasPool = truthy(property.pool);

  if (model === "employee_home") {
    if (bedrooms >= 3) {
      score += 8;
      reasons.push("3+ soverom gir fleksibilitet for ansatte og familier");
    }
    if (["apartment", "penthouse", "townhouse"].includes(kind)) {
      score += 6;
      reasons.push("Boligtypen er relativt enkel å låse og forlate mellom opphold");
    }
    if (plot >= 500) cautions.push("Stor tomt kan gi mer løpende vedlikehold");
  }

  if (model === "corporate_villa") {
    if (kind === "villa") {
      score += 12;
      reasons.push("Villa passer arbeidsmodellen");
    }
    if (bedrooms >= 4) {
      score += 8;
      reasons.push("4+ soverom gir bedre kapasitet for ledelse og gjester");
    }
    if (bathrooms >= 3) {
      score += 4;
      reasons.push("Flere bad passer samtidig bruk");
    }
    if (plot >= 300) {
      score += 4;
      reasons.push("Privat uteareal gir mer fleksibilitet");
    }
    if (hasPool) score += 3;
  }

  if (model === "shared_corporate_home") {
    if (bedrooms >= 4) {
      score += 8;
      reasons.push("4+ soverom støtter flere brukergrupper");
    }
    if (bathrooms >= 2) {
      score += 4;
      reasons.push("2+ bad gjør delt bruk enklere");
    }
    if (["apartment", "penthouse", "townhouse"].includes(kind)) {
      score += 5;
      reasons.push("Boligtypen kan gi enklere delt drift");
    }
    if (hasGarage) score += 2;
  }

  if (model === "member_home") {
    if (bedrooms >= 3) {
      score += 7;
      reasons.push("3+ soverom gir god medlemskapasitet");
    }
    if (bathrooms >= 2) {
      score += 4;
      reasons.push("2+ bad støtter hyppige brukerskifter");
    }
    if (["apartment", "penthouse", "townhouse"].includes(kind)) {
      score += 7;
      reasons.push("Lavere driftskompleksitet passer medlemsmodell");
    }
    if (hasPool) score += 2;
  }

  if (model === "unspecified") {
    if (builtArea >= 90) score += 3;
    if (bedrooms >= 3) score += 3;
  }

  return score;
}

export function scoreCorporateProperty(
  property: Record<string, unknown>,
  assessment: CorporatePropertyAssessment,
) {
  let score = 0;
  const reasons: string[] = [];
  const cautions: string[] = [];

  const model = normalizeCorporateModel(assessment.model);
  const price = numberValue(property.price);
  const minBudget = numberValue(assessment.budget_min_eur);
  const maxBudget = numberValue(assessment.budget_max_eur);

  if (maxBudget) {
    if (price && price <= maxBudget) {
      score += 28;
      reasons.push("Innenfor maksbudsjett");
      if (minBudget && price >= minBudget) {
        score += 4;
        reasons.push("Innenfor ønsket budsjettintervall");
      }
    } else if (price && price <= maxBudget * 1.08) {
      score += 10;
      cautions.push("Litt over oppgitt maksbudsjett");
    } else if (price) {
      score -= 30;
      cautions.push("Klart over oppgitt maksbudsjett");
    } else {
      cautions.push("Pris mangler");
    }
  }

  const bedrooms = numberValue(property.bedrooms) || 0;
  const bedroomsMin = numberValue(assessment.bedrooms_min);
  if (bedroomsMin) {
    if (bedrooms >= bedroomsMin) {
      score += 18;
      reasons.push(`${bedrooms} soverom møter minimumskravet`);
      if (bedrooms >= bedroomsMin + 1) {
        score += 3;
        reasons.push("Ekstra soverom gir reservekapasitet");
      }
    } else {
      score -= 22;
      cautions.push(`Kun ${bedrooms || "ukjent antall"} soverom`);
    }
  }

  const bathrooms = numberValue(property.bathrooms) || 0;
  if (bathrooms >= 2) {
    score += 5;
    reasons.push("2+ bad støtter flere samtidige brukere");
  }

  const preferredArea = textValue(assessment.preferred_area);
  const areaMatch = areaMatches(property, preferredArea);
  if (areaMatch === true) {
    score += 14;
    reasons.push("Matcher ønsket område");
  } else if (areaMatch === false) {
    cautions.push("Områdematch ikke bekreftet");
  }

  const requestedType = textValue(assessment.property_type);
  const typeMatch = requestedTypeMatches(property, requestedType);
  if (typeMatch === true) {
    score += 8;
    reasons.push("Matcher ønsket boligtype");
  } else if (typeMatch === false) {
    cautions.push("Boligtypen avviker fra ønsket profil");
  }

  if (truthy(property.garage)) {
    score += 5;
    reasons.push("Garasje/parkering er registrert");
  }

  if (truthy(property.pool)) {
    score += 4;
    reasons.push("Basseng er registrert");
  }

  const builtArea = numberValue(property.built_area || property.area_m2);
  if (builtArea && builtArea >= 100) {
    score += 4;
    reasons.push("Godt innvendig areal for delt bruk");
  }

  const plot = numberValue(property.plot_size);
  if (plot && plot >= 250) {
    score += 2;
    reasons.push("Privat uteareal");
  }

  score += addModelFit(property, model, reasons, cautions);

  const airportMax = numberValue(assessment.airport_max_minutes);
  if (airportMax) {
    cautions.push("Flyplasstid må verifiseres separat før shortlist deles");
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    score: finalScore,
    model,
    classification: classifyProperty(property, finalScore),
    reasons: [...new Set(reasons)],
    cautions: [...new Set(cautions)],
  };
}
