export type CorporateProspectStatus =
  | "DISCOVERED"
  | "RESEARCHED"
  | "QUALIFIED"
  | "CONTACT_READY"
  | "CONTACTED"
  | "ENGAGED"
  | "MEETING"
  | "OPPORTUNITY"
  | "DISQUALIFIED";

export type CorporateProspectType =
  | "company"
  | "association"
  | "member_organization"
  | "group"
  | "other";

export type CorporateProspectInput = {
  company_name?: unknown;
  organization_number?: unknown;
  domain?: unknown;
  organization_type?: unknown;
  country_code?: unknown;
  city?: unknown;
  industry?: unknown;
  employee_count?: unknown;
  employee_band?: unknown;
  member_count?: unknown;
  website_url?: unknown;
  linkedin_company_url?: unknown;
  status?: unknown;
  decision_roles?: unknown;
  source_type?: unknown;
  source_url?: unknown;
  evidence?: unknown;
  notes?: unknown;
  next_action?: unknown;
  next_followup?: unknown;
};

const COMPANY_ROLES = [
  "CEO / Managing Director",
  "HR / People & Culture",
  "CFO / Finance",
  "Chair / Board",
] as const;

const ORGANISATION_ROLES = [
  "General Secretary / CEO",
  "Chair / Board",
  "Member Services / Administration",
  "Finance",
] as const;

const TARGET_INDUSTRY_TERMS = [
  "technology",
  "software",
  "programmer",
  "informasjonsteknologi",
  "it-tjen",
  "consult",
  "konsulent",
  "rådgiv",
  "engineering",
  "ingeniør",
  "arkitekt",
  "construction",
  "bygg",
  "anlegg",
  "oppføring",
  "energy",
  "energi",
  "elektrisitet",
  "finance",
  "finans",
  "bank",
  "forsikring",
  "account",
  "regnskap",
  "revisjon",
  "industrial",
  "industri",
  "produksjon",
  "professional services",
] as const;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function nullableText(value: unknown, max = 500) {
  const valueText = text(value, max);
  return valueText || null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => text(item, 120)).filter(Boolean))].slice(0, 20);
  }
  const raw = text(value, 1200);
  if (!raw) return [];
  return [...new Set(raw.split(/[;,|]/).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function normalizeDomain(value: unknown) {
  let raw = text(value, 200).toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0].trim();
  return raw || null;
}

function normalizeOrganizationNumber(value: unknown) {
  const digits = text(value, 40).replace(/\D/g, "");
  return digits || null;
}

function normalizeType(value: unknown): CorporateProspectType {
  const normalized = text(value, 80).toLowerCase().replace(/[ -]+/g, "_");
  if (["association", "forening"].includes(normalized)) return "association";
  if (["member_organization", "membership_organization", "medlemsorganisasjon"].includes(normalized)) return "member_organization";
  if (["group", "konsern"].includes(normalized)) return "group";
  if (normalized === "other" || normalized === "annet") return "other";
  return "company";
}

function normalizeStatus(value: unknown): CorporateProspectStatus {
  const normalized = text(value, 80).toUpperCase().replace(/[ -]+/g, "_");
  const allowed: CorporateProspectStatus[] = [
    "DISCOVERED",
    "RESEARCHED",
    "QUALIFIED",
    "CONTACT_READY",
    "CONTACTED",
    "ENGAGED",
    "MEETING",
    "OPPORTUNITY",
    "DISQUALIFIED",
  ];
  return allowed.includes(normalized as CorporateProspectStatus)
    ? (normalized as CorporateProspectStatus)
    : "DISCOVERED";
}

export function defaultDecisionRoles(type: CorporateProspectType) {
  return type === "association" || type === "member_organization"
    ? [...ORGANISATION_ROLES]
    : [...COMPANY_ROLES];
}

export function scoreCorporateProspect(input: {
  organization_type: CorporateProspectType;
  country_code: string | null;
  industry: string | null;
  employee_count: number | null;
  employee_band: string | null;
  member_count: number | null;
  domain: string | null;
  website_url: string | null;
  decision_roles: string[];
  source_url: string | null;
}) {
  let score = 0;
  const reasons: string[] = [];
  const gaps: string[] = [];

  const type = input.organization_type;
  const isMemberOrg = type === "association" || type === "member_organization";

  if ((input.country_code || "").toUpperCase() === "NO") {
    score += 10;
    reasons.push("Norsk virksomhet / organisasjon");
  } else {
    gaps.push("Norsk marked ikke bekreftet");
  }

  if (isMemberOrg) {
    if ((input.member_count || 0) >= 500) {
      score += 35;
      reasons.push("Stor medlemsbase (500+)");
    } else if ((input.member_count || 0) >= 100) {
      score += 25;
      reasons.push("Betydelig medlemsbase (100+)");
    } else if (input.member_count !== null) {
      score += 12;
      reasons.push("Medlemsorganisasjon med kjent medlemsbase");
    } else {
      score += 12;
      reasons.push("Medlemsorganisasjon er en prioritert Corporate Homes-segment");
      gaps.push("Antall medlemmer mangler");
    }
  } else if (input.employee_count !== null) {
    if (input.employee_count >= 15 && input.employee_count <= 500) {
      score += 35;
      reasons.push("15–500 ansatte matcher kjernemålgruppen");
    } else if (input.employee_count > 500 && input.employee_count <= 1000) {
      score += 25;
      reasons.push("501–1000 ansatte er relevant utvidet målgruppe");
    } else if (input.employee_count >= 10) {
      score += 15;
      reasons.push("Virksomheten har tilstrekkelig størrelse til videre vurdering");
    } else {
      gaps.push("Færre enn 10 ansatte gir svakere fit for standard bedriftshytte-modell");
    }
  } else if (input.employee_band) {
    const band = input.employee_band.toLowerCase();
    if (/(11|15)[–-]50|51[–-]200|201[–-]500/.test(band)) {
      score += 30;
      reasons.push("Oppgitt ansattintervall matcher kjernemålgruppen");
    } else if (/501[–-]1000/.test(band)) {
      score += 22;
      reasons.push("Oppgitt ansattintervall matcher utvidet målgruppe");
    } else {
      score += 8;
      gaps.push("Ansattintervall trenger nærmere kvalifisering");
    }
  } else {
    gaps.push("Antall ansatte mangler");
  }

  const industry = (input.industry || "").toLowerCase();
  if (industry && TARGET_INDUSTRY_TERMS.some((term) => industry.includes(term))) {
    score += 20;
    reasons.push("Bransje matcher prioritert B2B-segment");
  } else if (!isMemberOrg) {
    gaps.push("Prioritert bransje er ikke bekreftet");
  }

  if (input.domain || input.website_url) {
    score += 8;
    reasons.push("Verifiserbar virksomhetsidentitet / nettsted");
  } else {
    gaps.push("Domene eller nettsted mangler");
  }

  if (input.decision_roles.length >= 3) {
    score += 12;
    reasons.push("Relevant buying committee er definert");
  } else if (input.decision_roles.length > 0) {
    score += 6;
    reasons.push("Minst én relevant beslutningstakerrolle er definert");
  } else {
    gaps.push("Beslutningstakerroller mangler");
  }

  if (input.source_url) {
    score += 5;
    reasons.push("Kildelenke er registrert");
  } else {
    gaps.push("Kildelenke mangler");
  }

  score = Math.min(100, Math.max(0, score));
  const tier = score >= 75 ? "A" : score >= 55 ? "B" : score > 0 ? "C" : "UNSCORED";

  return { score, tier, reasons, gaps };
}

export function normalizeCorporateProspect(input: CorporateProspectInput) {
  const companyName = text(input.company_name, 240);
  if (!companyName) throw new Error("company_name is required");

  const organizationType = normalizeType(input.organization_type);
  const decisionRoles = stringList(input.decision_roles);
  const normalizedRoles = decisionRoles.length ? decisionRoles : defaultDecisionRoles(organizationType);

  const normalized = {
    brand_id: "zeneco",
    company_name: companyName,
    organization_number: normalizeOrganizationNumber(input.organization_number),
    domain: normalizeDomain(input.domain || input.website_url),
    organization_type: organizationType,
    country_code: (text(input.country_code, 4) || "NO").toUpperCase(),
    city: nullableText(input.city, 160),
    industry: nullableText(input.industry, 200),
    employee_count: numberOrNull(input.employee_count),
    employee_band: nullableText(input.employee_band, 80),
    member_count: numberOrNull(input.member_count),
    website_url: nullableText(input.website_url, 500),
    linkedin_company_url: nullableText(input.linkedin_company_url, 500),
    status: normalizeStatus(input.status),
    decision_roles: normalizedRoles,
    source_type: text(input.source_type, 120) || "manual",
    source_url: nullableText(input.source_url, 700),
    evidence:
      input.evidence && typeof input.evidence === "object" && !Array.isArray(input.evidence)
        ? input.evidence
        : {},
    notes: nullableText(input.notes, 5000),
    next_action: nullableText(input.next_action, 1000),
    next_followup: nullableText(input.next_followup, 80),
  };

  const fit = scoreCorporateProspect(normalized);
  return {
    ...normalized,
    fit_score: fit.score,
    fit_tier: fit.tier,
    fit_reasons: fit.reasons,
    evidence_gaps: fit.gaps,
  };
}

export function rescoreCorporateProspect(row: Record<string, unknown>) {
  const organizationType = normalizeType(row.organization_type);
  const decisionRoles = stringList(row.decision_roles);
  const fit = scoreCorporateProspect({
    organization_type: organizationType,
    country_code: nullableText(row.country_code, 4),
    industry: nullableText(row.industry, 200),
    employee_count: numberOrNull(row.employee_count),
    employee_band: nullableText(row.employee_band, 80),
    member_count: numberOrNull(row.member_count),
    domain: normalizeDomain(row.domain),
    website_url: nullableText(row.website_url, 500),
    decision_roles: decisionRoles.length ? decisionRoles : defaultDecisionRoles(organizationType),
    source_url: nullableText(row.source_url, 700),
  });
  return {
    fit_score: fit.score,
    fit_tier: fit.tier,
    fit_reasons: fit.reasons,
    evidence_gaps: fit.gaps,
  };
}

export const CORPORATE_PROSPECT_TARGET = 250;
