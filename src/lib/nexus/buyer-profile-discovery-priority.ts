export type BuyerProfileDiscoveryField =
  | "next_followup"
  | "purchase_timeline"
  | "budget"
  | "property_type"
  | "bedrooms"
  | "location"
  | "other";

export type BuyerProfileDiscoveryInput = {
  pipelineStatus?: string | null;
  pipelineValue?: number | null;
  personaConfidence?: number | null;
  projectedCompletenessScore: number;
  projectedMissing: string[];
  evidenceConflictCount?: number;
};

export type BuyerProfileDiscoveryPriority = {
  field: BuyerProfileDiscoveryField | null;
  label: string;
  action: string;
  reason: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
  requiresCustomerInput: boolean;
  readOnly: true;
};

const FIELD_RULES: Array<{
  field: BuyerProfileDiscoveryField;
  pattern: RegExp;
  label: string;
  action: string;
}> = [
  {
    field: "next_followup",
    pattern: /neste oppfølging|next follow/i,
    label: "Neste oppfølging",
    action: "Avklar og registrer ett konkret neste oppfølgingspunkt med dato.",
  },
  {
    field: "purchase_timeline",
    pattern: /kjøpstidslinje|purchase timeline|timeline|tidslinje/i,
    label: "Kjøpstidslinje",
    action: "Avklar når kunden realistisk ønsker å kjøpe: nå, innen måneder, i år eller senere.",
  },
  {
    field: "budget",
    pattern: /budsjett|budget/i,
    label: "Budsjett",
    action: "Avklar realistisk kjøpsbudsjett og om omkostninger skal være inkludert.",
  },
  {
    field: "property_type",
    pattern: /boligtype|property type/i,
    label: "Boligtype",
    action: "Avklar primær boligtype uten å anta at flere alternativer er likeverdige.",
  },
  {
    field: "bedrooms",
    pattern: /soverom|bedroom/i,
    label: "Soverom",
    action: "Avklar minimum antall soverom som et eksplisitt krav eller preferanse.",
  },
  {
    field: "location",
    pattern: /område|location/i,
    label: "Område",
    action: "Avklar prioriterte områder og hvor fleksibel kunden er geografisk.",
  },
];

function stage(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function chooseField(missing: string[], pipelineStatus: string) {
  // For VIEWING, an absent next follow-up is the operational risk that must be
  // resolved first. For all other cases, purchase intent/timeline comes first
  // because production data shows it is the scarcest Buyer Profile signal.
  const ordered = pipelineStatus === "VIEWING"
    ? FIELD_RULES
    : [FIELD_RULES[1], FIELD_RULES[2], FIELD_RULES[3], FIELD_RULES[4], FIELD_RULES[5], FIELD_RULES[0]];

  for (const rule of ordered) {
    if (missing.some((value) => rule.pattern.test(value))) return rule;
  }
  return null;
}

export function buildBuyerProfileDiscoveryPriority(
  input: BuyerProfileDiscoveryInput,
): BuyerProfileDiscoveryPriority {
  const normalizedStage = stage(input.pipelineStatus);
  const missing = [...new Set((input.projectedMissing || []).map(String).filter(Boolean))];
  const rule = chooseField(missing, normalizedStage);

  if (!missing.length) {
    return {
      field: null,
      label: "Ingen discovery nødvendig",
      action: "Profilen mangler ingen Customer 360-felt i projected preview. Fortsett med kontrollert evidensreview.",
      reason: "Projected Customer 360 completeness er 100%.",
      priority: "LOW",
      score: 0,
      requiresCustomerInput: false,
      readOnly: true,
    };
  }

  let score = 0;
  if (normalizedStage === "VIEWING") score += 45;
  else if (normalizedStage === "QUALIFIED") score += 25;

  score += Math.round(clamp(Number(input.projectedCompletenessScore || 0), 0, 100) * 0.35);

  const value = Number(input.pipelineValue || 0);
  if (value >= 750_000) score += 12;
  else if (value >= 500_000) score += 9;
  else if (value >= 250_000) score += 6;
  else if (value > 0) score += 3;

  const personaConfidence = clamp(Number(input.personaConfidence || 0), 0, 100);
  score += Math.round(personaConfidence * 0.1);

  const conflicts = Math.max(0, Number(input.evidenceConflictCount || 0));
  if (conflicts > 0) score += Math.min(8, conflicts * 4);

  score = clamp(Math.round(score), 0, 100);
  const priority = score >= 85 ? "CRITICAL" : score >= 65 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  const selected = rule || {
    field: "other" as const,
    label: missing[0] || "Manglende profilinformasjon",
    action: `Avklar det manglende profilfeltet: ${missing[0] || "ukjent felt"}.`,
  };

  return {
    field: selected.field,
    label: selected.label,
    action: selected.action,
    reason: [
      normalizedStage ? `pipeline ${normalizedStage}` : null,
      `projected completeness ${clamp(Number(input.projectedCompletenessScore || 0), 0, 100)}%`,
      value > 0 ? `pipelineverdi €${Math.round(value)}` : null,
      personaConfidence > 0 ? `Persona ${personaConfidence}%` : null,
      conflicts > 0 ? `${conflicts} evidenskonflikt${conflicts === 1 ? "" : "er"}` : null,
    ].filter(Boolean).join(" · "),
    priority,
    score,
    requiresCustomerInput: true,
    readOnly: true,
  };
}

export function sortBuyerProfileDiscoveryPriorities<T extends BuyerProfileDiscoveryPriority>(items: T[]) {
  const weight: Record<T["priority"], number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...items].sort((a, b) => weight[b.priority] - weight[a.priority] || b.score - a.score || a.label.localeCompare(b.label, "nb"));
}
