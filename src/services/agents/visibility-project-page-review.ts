/**
 * Evidence-aware project page review for Altovena Visibility.
 * Pure diagnostic: no network, no content mutation, no publication rights.
 * Editor supplies verified facts and provenance; absent evidence is UNKNOWN, not passed.
 */
export type ProjectFact = {
  key: "price" | "construction" | "delivery" | "energyClass" | "included" | "taxes" | "location";
  value: string;
  sourceUrl?: string;
  checkedAt?: string;
  verifiedByHuman?: boolean;
};

export type ProjectPageReviewInput = {
  pageUrl: string;
  type: "property" | "development" | "houseModel";
  directAnswer?: string;
  facts: readonly ProjectFact[];
  faqCount?: number;
  authorName?: string;
  nextStepUrl?: string;
};

export type ProjectReviewFinding = {
  code: "DIRECT_ANSWER_MISSING" | "FACT_NOT_SOURCED" | "FACT_NOT_HUMAN_VERIFIED" |
    "CRITICAL_FACT_MISSING" | "FAQ_MISSING" | "AUTHOR_MISSING" | "NEXT_STEP_MISSING";
  severity: "BLOCK" | "WARN";
  detail: string;
  key?: ProjectFact["key"];
};

const critical: readonly ProjectFact["key"][] = ["price", "delivery", "energyClass", "taxes"];
const validHttps = (url?: string) => !!url && /^https:\/\/[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/i.test(url);
const validDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Reviews supplied assertions, never infers a fact to be true from formatting. */
export function reviewProjectPage(input: ProjectPageReviewInput) {
  const findings: ProjectReviewFinding[] = [];
  if (!input.directAnswer?.trim()) findings.push({
    code: "DIRECT_ANSWER_MISSING", severity: "WARN", detail: "Page lacks a concise first answer.",
  });
  if (!input.authorName?.trim()) findings.push({
    code: "AUTHOR_MISSING", severity: "WARN", detail: "Identify a responsible editor/adviser.",
  });
  if (!validHttps(input.nextStepUrl)) findings.push({
    code: "NEXT_STEP_MISSING", severity: "WARN", detail: "Add a valid HTTPS next-step URL.",
  });
  if (!input.faqCount || input.faqCount < 1) findings.push({
    code: "FAQ_MISSING", severity: "WARN", detail: "Check genuine buyer questions; do not invent FAQs.",
  });
  const known = new Set(input.facts.map(f => f.key));
  for (const key of critical) {
    if (!known.has(key)) findings.push({
      code: "CRITICAL_FACT_MISSING", severity: "WARN", key,
      detail: "No asserted " + key + " fact; mark not available rather than inventing one.",
    });
  }
  for (const fact of input.facts) {
    // Price, construction, delivery, energy grade, inclusions and taxes may create commercial or legal reliance.
    if (!fact.value.trim() || !validHttps(fact.sourceUrl) || !validDate(fact.checkedAt)) findings.push({
      code: "FACT_NOT_SOURCED", severity: "BLOCK", key: fact.key,
      detail: "Claim requires a source URL, ISO verification date and non-empty value.",
    });
    if (fact.verifiedByHuman !== true) findings.push({
      code: "FACT_NOT_HUMAN_VERIFIED", severity: "BLOCK", key: fact.key,
      detail: "Claim is unverified by a responsible human.",
    });
  }
  return {
    pageUrl: input.pageUrl,
    findings,
    status: findings.some(f => f.severity === "BLOCK") ? "REVIEW_BLOCKED" as const :
      findings.length ? "REVIEW_WARNINGS" as const : "REVIEW_PASSED" as const,
    // Independent release controls are mandatory even for a clean editorial report.
    canPublish: false as const,
    publicationEligible: false as const,
    checkedAutomatically: false as const,
  };
}
