import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBuyerCriteriaLines } from "@/services/email/buyer-profile-confirmation";

type CriterionRow = {
  criterion_type: string | null;
  key: string | null;
  value: unknown;
  source_text: string | null;
  confidence: number | string | null;
};

type BuyerProfileRow = {
  id: string;
  brand: string;
  status: string;
  budget_amount: number | string | null;
  budget_currency: string | null;
  budget_includes_costs: boolean | null;
  budget_approximate: boolean | null;
  location_flexible: boolean | null;
};

export type NoMatchConstraintFocus = "location" | "budget" | "property_type" | "bedrooms" | "market_fit";

export type NoMatchClarificationPlan = {
  action: "prepare_clarification" | "human_review";
  reason: string;
  currentCriteriaLines: string[];
  missingFields: Array<"location" | "budget" | "property_type" | "bedrooms">;
  questions: string[];
  primaryQuestion: string;
  constraintFocus: NoMatchConstraintFocus;
};

const BROAD_LOCATIONS = new Set([
  "spain",
  "spania",
  "espana",
  "españa",
  "costa blanca",
  "alicante",
  "valencia",
  "comunidad valenciana",
  "valencian community",
]);

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function criterionValues(criteria: CriterionRow[], key: string) {
  return criteria
    .filter((item) => item.key === key)
    .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function finitePositive(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function analysisForCriteriaLines(profile: BuyerProfileRow, criteria: CriterionRow[]) {
  const grouped = (type: string) => criteria
    .filter((item) => item.criterion_type === type)
    .map((item) => ({ key: item.key, value: item.value }));
  const locationValues = criterionValues(criteria, "location");
  const propertyTypes = criterionValues(criteria, "property_type");
  return {
    budget: finitePositive(profile.budget_amount)
      ? { amount: Number(profile.budget_amount), currency: profile.budget_currency || "EUR" }
      : {},
    locations: { preferred: locationValues },
    propertyTypes,
    hardRequirements: grouped("hard_requirement"),
    preferences: grouped("preference"),
    exclusions: grouped("exclusion"),
  };
}

function questionForMissingField(field: NoMatchClarificationPlan["missingFields"][number]) {
  if (field === "location") return "Hvilket konkret område eller hvilke 2–3 steder skal jeg prioritere i søket?";
  if (field === "budget") return "Hva er omtrent maksimal kjøpsramme i EUR?";
  if (field === "property_type") return "Hvilken boligtype skal jeg prioritere: leilighet, rekkehus eller villa?";
  return "Hvor mange soverom trenger dere minimum?";
}

function specificProfileQuestion(profile: BuyerProfileRow, criteria: CriterionRow[]) {
  const locations = criterionValues(criteria, "location");
  if (profile.location_flexible !== true && locations.length > 0) {
    const locationLabel = locations.slice(0, 2).join(" / ");
    return {
      constraintFocus: "location" as const,
      primaryQuestion: `Hvis vi fortsatt ikke finner et godt treff i ${locationLabel}, skal området være helt fast, eller kan jeg også vurdere nærliggende områder?`,
    };
  }

  if (finitePositive(profile.budget_amount)) {
    const amount = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Number(profile.budget_amount));
    return {
      constraintFocus: "budget" as const,
      primaryQuestion: `Er kjøpsrammen på ca. ${amount} ${profile.budget_currency || "EUR"} et absolutt tak, eller ønsker dere at jeg viser et svært godt treff litt over rammen for vurdering?`,
    };
  }

  const propertyTypes = criterionValues(criteria, "property_type");
  if (propertyTypes.length > 0) {
    return {
      constraintFocus: "property_type" as const,
      primaryQuestion: `Skal jeg holde søket strengt til ${propertyTypes.slice(0, 2).join(" / ")}, eller kan nærliggende boligtyper vurderes hvis resten treffer svært godt?`,
    };
  }

  const bedrooms = criterionValues(criteria, "bedrooms");
  if (bedrooms.length > 0) {
    return {
      constraintFocus: "bedrooms" as const,
      primaryQuestion: `Er minimum ${bedrooms[0]} soverom et absolutt krav, eller kan en svært god bolig med færre soverom vurderes?`,
    };
  }

  return {
    constraintFocus: "market_fit" as const,
    primaryQuestion: "Hvilket enkelt kriterium er dere mest fleksible på dersom markedet ikke har et godt nok treff akkurat nå?",
  };
}

export function buildNoMatchClarificationPlan(input: {
  profile: BuyerProfileRow;
  criteria: CriterionRow[];
}): NoMatchClarificationPlan {
  const { profile, criteria } = input;
  const locations = criterionValues(criteria, "location");
  const normalizedLocations = locations.map(normalizeText);
  const locationNeedsSpecificity = locations.length === 0 || normalizedLocations.every((value) => BROAD_LOCATIONS.has(value));
  const hasBudget = finitePositive(profile.budget_amount)
    || ["total_budget", "purchase_price", "estimated_total_cost"].some((key) => criterionValues(criteria, key).some(finitePositive));
  const hasPropertyType = criterionValues(criteria, "property_type").length > 0;
  const hasBedrooms = criterionValues(criteria, "bedrooms").length > 0;

  const missingFields: NoMatchClarificationPlan["missingFields"] = [];
  if (locationNeedsSpecificity) missingFields.push("location");
  if (!hasBudget) missingFields.push("budget");
  if (!hasPropertyType) missingFields.push("property_type");
  if (!hasBedrooms) missingFields.push("bedrooms");

  const currentCriteriaLines = buildBuyerCriteriaLines(analysisForCriteriaLines(profile, criteria));
  if (missingFields.length > 0) {
    const primaryField = missingFields[0];
    const primaryQuestion = questionForMissingField(primaryField);
    return {
      action: "prepare_clarification",
      reason: locationNeedsSpecificity ? "SEARCH_CRITERIA_TOO_BROAD_OR_INCOMPLETE" : "SEARCH_CRITERIA_INCOMPLETE",
      currentCriteriaLines,
      missingFields,
      questions: [primaryQuestion],
      primaryQuestion,
      constraintFocus: primaryField,
    };
  }

  const specific = specificProfileQuestion(profile, criteria);
  return {
    action: "human_review",
    reason: "NO_MATCHES_WITH_SPECIFIC_PROFILE",
    currentCriteriaLines,
    missingFields: [],
    questions: [specific.primaryQuestion],
    primaryQuestion: specific.primaryQuestion,
    constraintFocus: specific.constraintFocus,
  };
}

export function buildNoMatchClarificationEmail(input: {
  customerName?: string | null;
  plan: NoMatchClarificationPlan;
}) {
  const firstName = String(input.customerName || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hei ${firstName},` : "Hei,";
  const currentBlock = input.plan.currentCriteriaLines.length
    ? input.plan.currentCriteriaLines.map((line) => `– ${line}`).join("\n")
    : "– Vi har foreløpig for få konkrete søkekriterier registrert.";
  return {
    subject: "Boligsøket – én avklaring før jeg søker videre",
    bodyText: [
      greeting,
      "",
      "Jeg har kjørt et nytt søk, men fant ingen boliger som jeg synes er gode nok treff med kriteriene vi har registrert.",
      "",
      "Dette har jeg registrert nå:",
      currentBlock,
      "",
      "For at jeg skal prioritere riktig videre, kan du svare kort på én ting:",
      `– ${input.plan.primaryQuestion}`,
      "",
      "Når jeg har svaret, kan jeg vurdere neste søk uten å endre noen av kriteriene før du har bekreftet det.",
      "",
      "Vennlig hilsen",
      "Freddy",
    ].join("\n"),
  };
}

export async function prepareNoMatchCoach(
  supabase: SupabaseClient,
  input: {
    brandId: string;
    contactId: string;
    buyerProfileId: string;
  },
) {
  const [profileResult, criteriaResult, contactResult] = await Promise.all([
    supabase
      .from("buyer_profiles")
      .select("id,brand,status,budget_amount,budget_currency,budget_includes_costs,budget_approximate,location_flexible")
      .eq("id", input.buyerProfileId)
      .eq("brand", input.brandId)
      .eq("status", "approved")
      .maybeSingle(),
    supabase
      .from("buyer_profile_criteria")
      .select("criterion_type,key,value,source_text,confidence")
      .eq("buyer_profile_id", input.buyerProfileId)
      .eq("active", true)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("id,name,do_not_contact,email_suppressed")
      .eq("id", input.contactId)
      .maybeSingle(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (criteriaResult.error) throw criteriaResult.error;
  if (contactResult.error) throw contactResult.error;
  if (!profileResult.data) return { status: "skipped" as const, reason: "BUYER_PROFILE_NOT_FOUND" };
  if (!contactResult.data) return { status: "skipped" as const, reason: "CONTACT_NOT_FOUND" };
  if (contactResult.data.do_not_contact || contactResult.data.email_suppressed) {
    return { status: "skipped" as const, reason: "CONTACT_SUPPRESSED" };
  }

  const profile = profileResult.data as BuyerProfileRow;
  const criteria = (criteriaResult.data || []) as CriterionRow[];
  const plan = buildNoMatchClarificationPlan({ profile, criteria });
  const draft = buildNoMatchClarificationEmail({ customerName: contactResult.data.name, plan });

  return {
    status: plan.action === "human_review" ? "human_review" as const : "prepared" as const,
    reason: plan.reason,
    plan,
    draft,
    customerMessageSent: false as const,
  };
}
