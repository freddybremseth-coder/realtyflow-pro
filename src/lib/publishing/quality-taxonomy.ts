export type BibleRecord = {
  bible_type: "series_bible" | "work_canon" | "style_guide" | "research_standard";
  version: number;
  status: string;
};

export type QualityCheck = {
  check_type: string;
  attempt: number;
  result: string;
  decision: string;
};

export type TaxonomyAssignment = {
  assignment_type: "category" | "keyword" | "audience" | "theme";
  status: string;
  code: string;
};

const COMMON_AI_CHECKS = ["canon_consistency", "editorial"] as const;
const NONFICTION_AI_CHECKS = ["factual", "citations"] as const;
const TECHNICAL_AND_METADATA_CHECKS = ["epub_validation", "accessibility", "metadata"] as const;
const TECHNICAL_CHECKS = new Set(["epub_validation", "accessibility"]);

export function inferBookKind(...values: unknown[]): "fiction" | "nonfiction" {
  const text = values.map((value) => String(value ?? "").toLocaleLowerCase()).join(" ");
  return /\b(fiction|thriller|novel|mystery|romance|fantasy|sci[ -]?fi|crime|roman|krim|skjønnlitter)/.test(text)
    ? "fiction"
    : "nonfiction";
}

export function requiredQualityChecks(kind: "fiction" | "nonfiction") {
  return kind === "nonfiction"
    ? [...COMMON_AI_CHECKS, ...NONFICTION_AI_CHECKS, ...TECHNICAL_AND_METADATA_CHECKS]
    : [...COMMON_AI_CHECKS, ...TECHNICAL_AND_METADATA_CHECKS];
}

function latestChecks(checks: QualityCheck[]) {
  const latest = new Map<string, QualityCheck>();
  for (const check of checks) {
    const current = latest.get(check.check_type);
    if (!current || check.attempt > current.attempt) latest.set(check.check_type, check);
  }
  return latest;
}

function checkAccepted(check: QualityCheck | undefined) {
  if (!check) return false;
  if (check.decision === "approved" || check.decision === "waived") return true;
  return TECHNICAL_CHECKS.has(check.check_type) && check.result === "pass";
}

export function qualityTaxonomyReadiness(input: {
  kind: "fiction" | "nonfiction";
  seriesBook: boolean;
  bibles: BibleRecord[];
  checks: QualityCheck[];
  taxonomy: TaxonomyAssignment[];
}) {
  const approvedBibleTypes = new Set(input.bibles.filter((row) => row.status === "approved").map((row) => row.bible_type));
  const requiredBibles = input.seriesBook ? ["series_bible", "work_canon"] : ["work_canon"];
  const missingBibles = requiredBibles.filter((type) => !approvedBibleTypes.has(type as BibleRecord["bible_type"]));

  const latest = latestChecks(input.checks);
  const requiredChecks = requiredQualityChecks(input.kind);
  const missingChecks = requiredChecks.filter((type) => !checkAccepted(latest.get(type)));

  const approved = input.taxonomy.filter((row) => row.status === "approved" || row.status === "applied");
  const categoryCount = new Set(approved.filter((row) => row.assignment_type === "category").map((row) => row.code)).size;
  const keywordCount = new Set(approved.filter((row) => row.assignment_type === "keyword").map((row) => row.code.toLocaleLowerCase())).size;
  const taxonomyIssues = [
    ...(categoryCount < 1 ? ["missing_approved_category"] : []),
    ...(keywordCount < 5 ? ["needs_5_approved_keywords"] : []),
    ...(keywordCount > 7 ? ["too_many_approved_keywords"] : []),
  ];

  return {
    ready: missingBibles.length === 0 && missingChecks.length === 0 && taxonomyIssues.length === 0,
    missingBibles,
    missingChecks,
    taxonomyIssues,
    categoryCount,
    keywordCount,
  };
}
