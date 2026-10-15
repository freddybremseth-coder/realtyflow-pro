import type { SEOControlReport } from "@/services/agents/seo-control-report";
import type { BrandPublicationStatus } from "@/services/agents/seo-brand-publisher";
import { planVisibilityReviewItems } from "@/services/agents/visibility-review-items";
import { visibilityPublishingInvestigations } from "@/services/agents/visibility-publishing-investigations";
import { visibilityEvidenceAge } from "@/services/agents/visibility-evidence-age";

export const VISIBILITY_BRANDS: Record<string, { name: string; domain: string }> = {
  zeneco: { name: "Zen Eco Homes", domain: "zenecohomes.com" },
  pinosoecolife: { name: "PinosoEcolife", domain: "pinosoecolife.com" },
  freddyb: { name: "Freddy Bremseth", domain: "freddybremseth.com" },
  freddypublishing: { name: "Books", domain: "books.freddybremseth.com" },
  freddyart: { name: "Art", domain: "art.freddybremseth.com" },
  remasterfreddy: { name: "Re-Master", domain: "remaster.freddybremseth.com" },
  donaanna: { name: "Doña Anna", domain: "donaanna.com" },
  chatgenius: { name: "ChatGenius", domain: "chatgenius.pro" },
  zenecocare: { name: "Care", domain: "care.zenecohomes.com" },
};

export type VisibilityMetric = {
  brandId: string;
  collectedAt?: string | null;
  property?: string;
  period?: { currentStart?: string; currentEnd?: string };
  totals?: { currentClicks?: number; currentImpressions?: number; previousClicks?: number; previousImpressions?: number; currentCtr?: number | null };
  quality?: string;
};
export type VisibilitySource = {
  controlReport?: SEOControlReport | null;
  brandPublishers?: BrandPublicationStatus[];
  metrics?: VisibilityMetric[];
  connectionSummary?: { readable: number; registered: number; measured: number };
  lastGoogleReadAt?: string | null;
  latestReviewAt?: string | null;
};
export type VisibilitySite = {
  id: string; name: string; domain: string; technical: "observed" | "aged" | "unknown";
  pagesChecked: number | null; issues: number | null; sampledPaths: string[];
  checkedAt: string | null; incomplete: boolean;
  publisher: "blocked" | "verified" | "pending" | "monitor" | "rollback" | "unknown";
  publisherReason: string | null; metric: VisibilityMetric | null;
  technicalFindings: Array<{ code: string; evidence: string; url?: string }>;
};
export type VisibilityFinding = {
  id: string; brandId: string; title: string; category: "technical" | "publishing" | "missing-data";
  detail: string; nextStep: string; priority: "high" | "medium" | "unknown"; url: string | null;
  updatedAt: string | null; evidenceAge: "RECENT" | "AGED" | "UNKNOWN";
};
export type VisibilityProduct = { sites: VisibilitySite[]; findings: VisibilityFinding[]; readings: number; measured: number };

export function buildVisibilityProduct(input: VisibilitySource): VisibilityProduct {
  const auditSites = input.controlReport?.sites ?? [];
  const statuses = input.brandPublishers ?? [];
  const metrics = input.metrics ?? [];
  const ids = new Set<string>([
    ...auditSites.map(s => s.brandId),
    ...statuses.map(s => s.brandId),
    ...metrics.map(s => s.brandId),
  ]);
  const sites: VisibilitySite[] = [...ids].filter(Boolean).map(id => {
    const site = auditSites.find(s => s.brandId === id);
    const publisher = statuses.find(s => s.brandId === id);
    const metric = metrics.find(s => s.brandId === id);
    const age = visibilityEvidenceAge(site?.checkedAt);
    return {
      id, name: VISIBILITY_BRANDS[id]?.name ?? id, domain: VISIBILITY_BRANDS[id]?.domain ?? id,
      technical: !site || age === "UNKNOWN" ? "unknown" : age === "AGED" ? "aged" : "observed",
      pagesChecked: site?.pagesChecked ?? null,
      issues: site?.visibilityDiagnostic?.issues.length ?? null,
      sampledPaths: site?.sampledPaths ?? [],
      checkedAt: site?.checkedAt ?? null,
      incomplete: !site || site.incomplete || !site.visibilityDiagnostic || site.visibilityDiagnostic.incomplete,
      publisher: publisher?.status ?? "unknown", publisherReason: publisher?.reason ?? null,
      metric: metric ?? null,
      technicalFindings: (site?.visibilityDiagnostic?.issues ?? []).map(i => ({
        code: i.code, evidence: i.evidence, url: i.affectedUrl,
      })),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "nb"));

  const findings: VisibilityFinding[] = planVisibilityReviewItems(input.controlReport).map(i => ({
    id: i.key, brandId: i.brandId, title: i.title,
    category: i.type === "DATA_GAP" ? "missing-data" : "technical",
    detail: i.evidence, nextStep: i.nextStep,
    priority: i.priority === "HIGH" ? "high" : i.priority === "MEDIUM" ? "medium" : "unknown",
    url: i.affectedUrl, updatedAt: i.checkedAt, evidenceAge: visibilityEvidenceAge(i.checkedAt),
  }));
  for (const p of visibilityPublishingInvestigations(statuses)) {
    findings.push({ id: p.key, brandId: p.brandId, title: p.title,
      category: "publishing", detail: p.evidence, nextStep: p.nextStep,
      priority: "medium", url: null, updatedAt: null, evidenceAge: "UNKNOWN" });
  }
  const weight = { high: 0, medium: 1, unknown: 2 };
  findings.sort((a,b) => weight[a.priority]-weight[b.priority] || a.brandId.localeCompare(b.brandId) || a.id.localeCompare(b.id));
  return { sites, findings,
    readings: input.connectionSummary?.readable ?? 0,
    measured: metrics.length,
  };
}

/** Illustrative data ONLY for the product showcase. Never persisted or mixed with live reporting. */
export const VISIBILITY_DEMO: VisibilitySource = {
  controlReport: { checkedAt: "2026-10-15T08:00:00Z", referralsAvailable: false, leadsAvailable: false, collector: null,
    sites: [
      { brandId: "zeneco", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 12, findings: 2, incomplete: false,
        sampledPaths: ["/", "/guide/kjope-bolig-i-spania", "/omrader"], accessibilityFindings: 0, invalidStructuredData: 0,
        pagesWithContactOrForm: 2, qualityPagesChecked: 12, visibilityDiagnostic: { brandId: "zeneco", sampledOnly: true, incomplete: false, publicationEligible: false, diagnosticStatus: "ACTION_REQUIRED",
          issues: [{ code: "CANONICAL_MISMATCH", evidence: "Illustrasjon: mulig avvik mellom canonical og offentlig URL", affectedUrl: "https://www.zenecohomes.com/guide/kjope-bolig-i-spania" }] } },
      { brandId: "donaanna", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 6, findings: 0, incomplete: false,
        sampledPaths: ["/", "/om-oss"], accessibilityFindings: 0, invalidStructuredData: 0,
        pagesWithContactOrForm: 1, qualityPagesChecked: 6, visibilityDiagnostic: { brandId: "donaanna", sampledOnly: true, incomplete: false, publicationEligible: false, diagnosticStatus: "OBSERVED_NO_BLOCKERS", issues: [] } },
      { brandId: "remasterfreddy", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 4, findings: 1, incomplete: false,
        sampledPaths: ["/"], accessibilityFindings: 0, invalidStructuredData: 0,
        pagesWithContactOrForm: 0, qualityPagesChecked: 4, visibilityDiagnostic: { brandId: "remasterfreddy", sampledOnly: true, incomplete: false, publicationEligible: false, diagnosticStatus: "REVIEW_RECOMMENDED", issues: [{ code: "HEADING_STRUCTURE", evidence: "Illustrasjon: H1 mangler i serverlevert HTML", affectedUrl: "https://remaster.freddybremseth.com/" }] } },
    ] },
  brandPublishers: [{ brandId:"donaanna", status:"blocked", reason:"Illustrasjon: publiseringskilden samsvarer ikke med offentlig HTML", published: 0, page:"/" }],
  metrics: [{brandId:"zeneco",collectedAt:"2026-10-15T08:00:00Z",property:"sc-domain:zenecohomes.com",period:{currentStart:"2026-09-15",currentEnd:"2026-10-14"},totals:{currentClicks:24,currentImpressions:1890,currentCtr:0.0127}},
    {brandId:"donaanna",collectedAt:"2026-10-15T08:00:00Z",property:"sc-domain:donaanna.com",totals:{currentClicks:1,currentImpressions:96,currentCtr:0.0104}}],
  connectionSummary:{readable:2,registered:3,measured:2},lastGoogleReadAt:"2026-10-15T08:00:00Z",
};
