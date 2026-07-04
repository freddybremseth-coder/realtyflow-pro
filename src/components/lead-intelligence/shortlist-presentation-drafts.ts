import type { ExtractedLead } from "@/services/lead-intelligence/contracts";
import {
  formatCurrency,
  matchReviewDecisionLabel,
  propertyDisplayName,
  propertyFactsLine,
  type LeadIntelligencePropertyMatch,
  type SelectedShortlistDecision,
} from "@/components/lead-intelligence/property-match-display";

export type SelectedShortlistMatch = LeadIntelligencePropertyMatch & {
  decision: SelectedShortlistDecision;
  qualityReview: {
    status: "client_ready";
    note: string;
    checkedAt: string;
    checkedBy: string;
  };
};

export function uniquePresentationItems(values: Array<string | null | undefined>, limit = 6) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

function humanizeMatchReason(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  const isUnverified = lower.includes("(unverified)") || lower.includes("unverified");
  const suffix = isUnverified ? ", men må verifiseres" : "";

  if (lower.includes("bedrooms matches")) {
    return `Antall soverom ser ut til å passe${suffix}.`;
  }
  if (lower.includes("bathrooms matches")) {
    return `Antall bad ser ut til å passe${suffix}.`;
  }
  if (lower.includes("property_type matches")) {
    return `Boligtypen ser ut til å passe${suffix}.`;
  }
  if (lower.includes("estimated total cost") && lower.includes("within the buyer budget")) {
    return normalized
      .replace(/^Estimated total cost/i, "Estimert totalpris")
      .replace(/ is within the buyer budget\.?$/i, " er innenfor kundens budsjett.");
  }
  const cleaned = normalized
    .replace(/\s*\(unverified\)\.?/gi, "")
    .replace(/\bunverified\b\.?/gi, "")
    .trim()
    .replace(/\.$/, "");
  if (isUnverified && !cleaned) return "Dette punktet må verifiseres.";
  return isUnverified ? `${cleaned}, men må verifiseres.` : normalized;
}

export function humanizedMatchReasonItems(values: string[], limit = 3) {
  return uniquePresentationItems(values.slice(0, limit).map(humanizeMatchReason), limit);
}

export function humanizedMatchReasons(values: string[], limit = 2) {
  return humanizedMatchReasonItems(values, limit).join(" ");
}

type MatchReasonKey = "bedrooms" | "bathrooms" | "property_type" | "budget";

function matchReasonKey(value: string): MatchReasonKey | null {
  const lower = value.toLowerCase();
  if (lower.includes("bedrooms matches")) return "bedrooms";
  if (lower.includes("bathrooms matches")) return "bathrooms";
  if (lower.includes("property_type matches")) return "property_type";
  if (lower.includes("estimated total cost") && lower.includes("within the buyer budget")) return "budget";
  return null;
}

function sharedMatchReasonKeys(reasonGroups: string[][]) {
  if (reasonGroups.length < 3) return new Set<MatchReasonKey>();
  const keyedGroups = reasonGroups.map((reasons) => new Set(reasons.map(matchReasonKey).filter((key): key is MatchReasonKey => Boolean(key))));
  const allKeys: MatchReasonKey[] = ["bedrooms", "bathrooms", "property_type", "budget"];
  return new Set(allKeys.filter((key) => keyedGroups.every((group) => group.has(key))));
}

function sharedMatchReasonSummary(sharedKeys: Set<MatchReasonKey>) {
  const parts: string[] = [];
  if (sharedKeys.has("bedrooms") && sharedKeys.has("bathrooms")) {
    parts.push("romfordelingen ser ut til å passe behovet for soverom og bad");
  } else {
    if (sharedKeys.has("bedrooms")) parts.push("antall soverom ser ut til å passe");
    if (sharedKeys.has("bathrooms")) parts.push("antall bad ser ut til å passe");
  }
  if (sharedKeys.has("property_type")) parts.push("boligtypen treffer ønsket type");
  if (sharedKeys.has("budget")) parts.push("prisene ser ut til å ligge innenfor budsjettet");
  if (parts.length === 0) return null;
  return `Felles for forslagene er at ${parts.join(", ")}. Dette må fortsatt bekreftes mot oppdatert prospekt og tilgjengelighet.`;
}

function itemSpecificMatchReasons(values: string[], sharedKeys: Set<MatchReasonKey>, limit = 2) {
  return humanizedMatchReasons(values.filter((value) => {
    const key = matchReasonKey(value);
    return !key || !sharedKeys.has(key);
  }), limit);
}

export function buildShortlistPresentation(lead: ExtractedLead, matches: SelectedShortlistMatch[]) {
  const contactName = lead.contact.name?.trim() || "kunden";
  const propertyTypes = lead.propertyTypes.length > 0 ? lead.propertyTypes.join(", ") : "bolig";
  const locations = lead.locations.preferred.length > 0
    ? lead.locations.preferred.join(", ")
    : lead.locations.flexible
      ? "fleksibelt område"
      : "område ikke avklart";
  const budget = lead.budget.amount
    ? `${formatCurrency(lead.budget.amount)}${lead.budget.includesCosts ? " inkl. omkostninger" : ""}`
    : "må avklares";
  const needBullets = uniquePresentationItems([
    `Boligtype: ${propertyTypes}`,
    `Område: ${locations}${lead.locations.flexible ? " / nærområde vurderes" : ""}`,
    `Budsjett: ${budget}`,
    ...lead.hardRequirements.slice(0, 3).map((criterion) => criterion.sourceText),
  ]);
  const verificationBullets = uniquePresentationItems([
    ...lead.missingInformation.slice(0, 3).map((item) => item.question),
    ...matches.flatMap((match) => match.questionsToVerify.slice(0, 2)),
    ...matches.flatMap((match) => match.concerns.slice(0, 2)),
    "Pris, tilgjengelighet og nøkkelfakta må bekreftes før kunden får endelig anbefaling.",
  ], 8);

  return {
    title: `Kundepresentasjon for ${contactName}`,
    subtitle: `${matches.length} bolig${matches.length === 1 ? "" : "er"} valgt for manuell gjennomgang.`,
    needBullets,
    verificationBullets,
  };
}

export function buildShortlistPresentationText(
  lead: ExtractedLead,
  matches: SelectedShortlistMatch[],
) {
  const presentation = buildShortlistPresentation(lead, matches);
  const propertyLines = matches.map((match, index) => {
    const facts = propertyFactsLine(match);
    const reasons = humanizedMatchReasons(match.reasonsForMatch, 3);
    const verification = uniquePresentationItems([
      ...match.concerns.slice(0, 2),
      ...match.questionsToVerify.slice(0, 2),
    ], 3).join(" ");
    return [
      `${index + 1}. ${propertyDisplayName(match)}${facts ? ` (${facts})` : ""}`,
      `   Status: ${matchReviewDecisionLabel(match.decision)}`,
      `   Hvorfor den passer: ${reasons || "Matcher deler av behovet."}`,
      verification ? `   Må avklares: ${verification}` : "   Må avklares: Pris og tilgjengelighet må bekreftes.",
    ].filter(Boolean).join("\n");
  });

  return [
    presentation.title,
    presentation.subtitle,
    "",
    "Kundens behov:",
    ...presentation.needBullets.map((item) => `- ${item}`),
    "",
    "Boligforslag:",
    ...propertyLines,
    "",
    "Før videre deling må dette avklares:",
    ...presentation.verificationBullets.map((item) => `- ${item}`),
  ].join("\n");
}

export function buildShortlistEmailDraft(
  lead: ExtractedLead,
  matches: SelectedShortlistMatch[],
) {
  const contactName = lead.contact.name?.trim() || "kunden";
  const locationText = lead.locations.preferred.length > 0
    ? lead.locations.preferred.join(", ")
    : lead.locations.flexible
      ? "fleksibelt område"
      : "området vi har snakket om";
  const budgetText = lead.budget.amount
    ? `Budsjett: ca. ${formatCurrency(lead.budget.amount)}${lead.budget.includesCosts ? " inkludert omkostninger" : ""}.`
    : "Budsjett må avklares.";
  const sharedReasons = sharedMatchReasonKeys(matches.map((match) => match.reasonsForMatch));
  const sharedReasonText = sharedMatchReasonSummary(sharedReasons);
  const missingWebsiteLinks = matches.filter((match) => !match.property.publicUrl).length;
  const propertyLines = matches.map((match, index) => {
    const facts = propertyFactsLine(match);
    const reasons = itemSpecificMatchReasons(match.reasonsForMatch, sharedReasons, 2);
    const concerns = uniquePresentationItems([
      ...match.concerns.slice(0, 2),
      ...match.questionsToVerify.slice(0, 1),
    ], 3);
    return [
      `${index + 1}. ${propertyDisplayName(match)}${facts ? ` (${facts})` : ""}`,
      reasons ? `   Aktuelt fordi: ${reasons}` : null,
      concerns.length > 0 ? `   Må avklares: ${concerns.join(" ")}` : null,
      match.property.publicUrl ? `   Se boligen på nettsiden: ${match.property.publicUrl}` : null,
    ].filter(Boolean).join("\n");
  });
  const closingChecks = uniquePresentationItems([
    "Pris, tilgjengelighet og enkelte detaljer må bekreftes før vi går videre.",
    missingWebsiteLinks > 0 ? "Boliglenker kontrolleres før endelig sending." : null,
  ], 2);

  return {
    subject: `Boligforslag: ${matches.length} alternativer i ${locationText}`,
    body: [
      `Hei ${contactName},`,
      "",
      "Jeg har sett gjennom aktuelle boliger opp mot behovene vi har notert så langt.",
      budgetText,
      sharedReasonText,
      "",
      "Jeg ville sett nærmere på disse alternativene:",
      ...propertyLines,
      "",
      ...closingChecks,
      "Gi meg gjerne beskjed om hvilke av disse du ønsker at jeg undersøker nærmere.",
      "",
      "Vennlig hilsen",
      "Freddy",
    ].join("\n"),
  };
}
