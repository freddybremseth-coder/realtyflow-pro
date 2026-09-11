import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBuyerCriteriaLines } from "@/services/email/buyer-profile-confirmation";
import { sendBrandEmail } from "@/services/email/send-brand-email";

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

export type NoMatchClarificationPlan = {
  action: "send_clarification" | "human_review";
  reason: string;
  currentCriteriaLines: string[];
  missingFields: Array<"location" | "budget" | "property_type" | "bedrooms">;
  questions: string[];
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
  const questions: string[] = [];
  if (locationNeedsSpecificity) {
    missingFields.push("location");
    questions.push("Hvilke byer eller områder er mest aktuelle for dere?");
  }
  if (!hasBudget) {
    missingFields.push("budget");
    questions.push("Hva er omtrent maksimal kjøpsramme i EUR?");
  }
  if (!hasPropertyType) {
    missingFields.push("property_type");
    questions.push("Hvilke boligtyper er aktuelle, for eksempel leilighet, rekkehus eller villa?");
  }
  if (!hasBedrooms) {
    missingFields.push("bedrooms");
    questions.push("Hvor mange soverom trenger dere minimum?");
  }

  const currentCriteriaLines = buildBuyerCriteriaLines(analysisForCriteriaLines(profile, criteria));
  if (missingFields.length === 0) {
    return {
      action: "human_review",
      reason: "NO_MATCHES_WITH_SPECIFIC_PROFILE",
      currentCriteriaLines,
      missingFields,
      questions: [],
    };
  }

  return {
    action: "send_clarification",
    reason: locationNeedsSpecificity ? "SEARCH_CRITERIA_TOO_BROAD_OR_INCOMPLETE" : "SEARCH_CRITERIA_INCOMPLETE",
    currentCriteriaLines,
    missingFields,
    questions,
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
  const questionBlock = input.plan.questions.map((question) => `– ${question}`).join("\n");
  return {
    subject: "Litt mer informasjon til boligsøket",
    bodyText: [
      greeting,
      "",
      "Takk for informasjonen. Jeg har nå kjørt et nytt søk, men fant ingen boliger som jeg synes er gode nok treff med kriteriene vi har registrert.",
      "",
      "Dette har jeg registrert nå:",
      currentBlock,
      "",
      "For å gjøre søket mer presist, kan du svare kort på følgende:",
      questionBlock,
      "",
      "Du kan bare svare direkte på denne e-posten. Når jeg har svaret, oppdaterer jeg søket og kjører matching på nytt.",
      "",
      "Vennlig hilsen",
      "Freddy",
    ].join("\n"),
  };
}

export async function handleNoMatchClarification(
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
    supabase.from("contacts").select("id,name,email").eq("id", input.contactId).maybeSingle(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (criteriaResult.error) throw criteriaResult.error;
  if (contactResult.error) throw contactResult.error;
  if (!profileResult.data) return { status: "skipped" as const, reason: "BUYER_PROFILE_NOT_FOUND" };

  const profile = profileResult.data as BuyerProfileRow;
  const criteria = (criteriaResult.data || []) as CriterionRow[];
  const plan = buildNoMatchClarificationPlan({ profile, criteria });
  if (plan.action === "human_review") {
    return { status: "human_review" as const, reason: plan.reason, plan };
  }

  const recipient = String(contactResult.data?.email || "").trim().toLowerCase();
  if (!recipient) return { status: "skipped" as const, reason: "CONTACT_MISSING_EMAIL", plan };
  const email = buildNoMatchClarificationEmail({ customerName: contactResult.data?.name, plan });
  const sent = await sendBrandEmail(supabase, {
    brandId: input.brandId,
    to: [recipient],
    subject: email.subject,
    bodyText: email.bodyText,
  });
  if (!sent.success) {
    return {
      status: sent.skipped ? "skipped" as const : "failed" as const,
      reason: sent.error || "SEND_FAILED",
      plan,
    };
  }

  return {
    status: "sent" as const,
    reason: plan.reason,
    messageId: sent.messageId || null,
    recipient,
    plan,
  };
}
