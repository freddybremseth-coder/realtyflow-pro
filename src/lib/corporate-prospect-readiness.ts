export type CorporateReadinessInput = {
  status?: string | null;
  fit_tier?: string | null;
  fit_score?: number | null;
  organization_number?: string | null;
  domain?: string | null;
  website_url?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  employee_band?: string | null;
  member_count?: number | null;
  organization_type?: string | null;
  source_url?: string | null;
  decision_roles?: string[] | null;
  evidence_gaps?: string[] | null;
};

const SALES_ACTIVE = new Set([
  "QUALIFIED",
  "CONTACT_READY",
  "CONTACTED",
  "ENGAGED",
  "MEETING",
  "OPPORTUNITY",
]);

export function evaluateCorporateProspectReadiness(input: CorporateReadinessInput) {
  const status = String(input.status || "DISCOVERED").toUpperCase();
  const tier = String(input.fit_tier || "UNSCORED").toUpperCase();
  const type = String(input.organization_type || "company").toLowerCase();
  const isMemberOrganisation = ["association", "member_organization"].includes(type);
  const roles = Array.isArray(input.decision_roles) ? input.decision_roles.filter(Boolean) : [];
  const gaps = Array.isArray(input.evidence_gaps) ? input.evidence_gaps.filter(Boolean) : [];

  if (status === "DISQUALIFIED") {
    return {
      score: 0,
      label: "Ikke aktuell",
      suggestedStage: "DISQUALIFIED",
      autoAdvanceAllowed: false,
      qualificationReady: false,
      reasons: ["Prospektet er eksplisitt markert som ikke aktuelt."],
      missing: [],
    };
  }

  let score = 0;
  const reasons: string[] = [];
  const missing: string[] = [];

  if (tier === "A") {
    score += 30;
    reasons.push("A-fit målgruppe");
  } else if (tier === "B") {
    score += 22;
    reasons.push("B-fit målgruppe");
  } else {
    missing.push("A/B-fit er ikke dokumentert");
  }

  if (input.organization_number) {
    score += 12;
    reasons.push("Organisasjonsnummer verifisert");
  } else {
    missing.push("Organisasjonsnummer mangler");
  }

  if (input.source_url) {
    score += 10;
    reasons.push("Kildelenke registrert");
  } else {
    missing.push("Kildelenke mangler");
  }

  if (input.industry) {
    score += 10;
    reasons.push("Bransje kartlagt");
  } else {
    missing.push("Bransje mangler");
  }

  const hasSize = isMemberOrganisation
    ? input.member_count !== null && input.member_count !== undefined
    : (input.employee_count !== null && input.employee_count !== undefined) || Boolean(input.employee_band);
  if (hasSize) {
    score += 15;
    reasons.push(isMemberOrganisation ? "Medlemsbase kartlagt" : "Virksomhetsstørrelse kartlagt");
  } else {
    missing.push(isMemberOrganisation ? "Medlemsbase mangler" : "Antall ansatte mangler");
  }

  if (input.domain || input.website_url) {
    score += 8;
    reasons.push("Nettsted/domene tilgjengelig");
  } else {
    missing.push("Nettsted/domene mangler");
  }

  if (roles.length >= 3) {
    score += 10;
    reasons.push("Buying committee-roller definert");
  } else {
    missing.push("Buying committee er ikke godt nok definert");
  }

  const gapPenalty = Math.min(15, gaps.length * 3);
  score -= gapPenalty;
  if (gapPenalty) missing.push(...gaps.slice(0, 5));

  score = Math.min(100, Math.max(0, score));

  const companyResearchReady = ["A", "B"].includes(tier) &&
    Boolean(input.organization_number) &&
    Boolean(input.source_url) &&
    Boolean(input.industry) &&
    hasSize;

  const qualificationReady = companyResearchReady &&
    score >= 75 &&
    roles.length >= 3 &&
    gaps.length <= 2;

  const suggestedStage = SALES_ACTIVE.has(status)
    ? status
    : companyResearchReady
      ? "RESEARCHED"
      : "DISCOVERED";

  const label = SALES_ACTIVE.has(status)
    ? "I salgsprosess"
    : qualificationReady
      ? "Klar for menneskelig kvalifisering"
      : companyResearchReady
        ? "Research komplett"
        : "Trenger mer selskapsdata";

  return {
    score,
    label,
    suggestedStage,
    autoAdvanceAllowed: status === "DISCOVERED" && suggestedStage === "RESEARCHED",
    qualificationReady,
    reasons,
    missing: [...new Set(missing)],
  };
}
