import type { SEOControlReport } from "./seo-control-report";
import type { VisibilityIssueCode } from "./visibility-quality-gate";

/**
 * Read-only investigation proposals sourced from bounded SEO observations.
 * These are NOT work_items, editor approvals, proof of an actual SEO defect,
 * or permission to publish. A missing diagnostic is a data gap, not a pass.
 */
export type VisibilityReviewItem = {
  key: string;
  brandId: string;
  checkedAt: string;
  affectedUrl: string | null;
  priority: "HIGH" | "MEDIUM" | "UNKNOWN";
  type: "OBSERVED_SIGNAL" | "DATA_GAP";
  title: string;
  evidence: string;
  nextStep: string;
  requiresApproval: false;
  publicationEligible: false;
};

const nextSteps: Partial<Record<VisibilityIssueCode, { title: string; nextStep: string }>> = {
  HTTP_ERROR: {
    title: "Kontroller HTTP-respons på offentlig side",
    nextStep: "Gjenta kontrollen på offentlig canonical URL og undersøk om statusen er tilsiktet før endring.",
  },
  INDEXING_BLOCKED: {
    title: "Undersøk robots- og noindex-direktiver",
    nextStep: "Verifiser om siden faktisk skal indekseres. Ikke fjern tilsiktet noindex på private tjenester eller kundeområder.",
  },
  CANONICAL_MISMATCH: {
    title: "Kontroller canonical-URL",
    nextStep: "Sammenlign nettstedets hensikt, omdirigeringer og publisert canonical før et eventuelt korrigeringsforslag.",
  },
  HEADING_STRUCTURE: {
    title: "Vurder struktur eller JSON-LD",
    nextStep: "Bekreft dokumentert strukturproblem i HTML og synlig innhold. Foreslå kun endringer som samsvarer med siden.",
  },
};
const significant = new Set<VisibilityIssueCode>([
  "HTTP_ERROR", "INDEXING_BLOCKED", "CANONICAL_MISMATCH",
  "BROKEN_INTERNAL_LINK", "REDIRECT_MISSING", "CONTENT_NOT_RENDERED",
]);

export function planVisibilityReviewItems(report: SEOControlReport | null | undefined): VisibilityReviewItem[] {
  const proposals = new Map<string, VisibilityReviewItem>();
  for (const site of report?.sites ?? []) {
    const diagnostic = site.visibilityDiagnostic;
    const brandId = site.brandId;
    const checkedAt = site.checkedAt;
    const gap = !diagnostic || diagnostic.incomplete || site.incomplete;
    if (gap) {
      const key = "visibility:" + brandId + ":data-gap";
      proposals.set(key, {
        key, brandId, checkedAt, affectedUrl: null, priority: "UNKNOWN",
        type: "DATA_GAP",
        title: diagnostic ? "Fullfør teknisk kontroll" : "Oppdater eldre Visibility-rapport",
        evidence: diagnostic
          ? "Nettstedskontrollen var ufullstendig. Ukjente resultater sier ikke at nettstedet er feilfritt."
          : "Lagret SEO-rapport mangler Visibility-diagnostikk.",
        nextStep: "Kjør en ny begrenset offentlig kontroll og undersøk eventuelle manglende svar før tiltak vurderes.",
        requiresApproval: false, publicationEligible: false,
      });
    }
    for (const issue of diagnostic?.issues ?? []) {
      const affectedUrl = issue.affectedUrl || null;
      // Stable across repeated checks, independent of timestamps or transient evidence.
      const key = "visibility:" + brandId + ":" + issue.code + ":" + (affectedUrl || "site");
      if (proposals.has(key)) continue;
      const rule = nextSteps[issue.code];
      const isCareIndex = brandId === "zenecocare" && issue.code === "INDEXING_BLOCKED";
      proposals.set(key, {
        key, brandId, checkedAt, affectedUrl,
        priority: isCareIndex ? "MEDIUM" : significant.has(issue.code) ? "HIGH" : "MEDIUM",
        type: "OBSERVED_SIGNAL",
        title: rule?.title || "Undersøk mulig teknisk SEO-avvik",
        evidence: issue.evidence,
        nextStep: rule?.nextStep || "Verifiser observasjonen på faktisk offentlig side. Dokumenter kontekst og eventuell ønsket endring.",
        requiresApproval: false, publicationEligible: false,
      });
    }
  }
  const order = { HIGH: 0, MEDIUM: 1, UNKNOWN: 2 };
  return [...proposals.values()].sort((a, b) =>
    order[a.priority] - order[b.priority] || a.brandId.localeCompare(b.brandId) || a.key.localeCompare(b.key));
}
