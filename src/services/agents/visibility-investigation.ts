/**
 * Sam's independently re-measured, READ-ONLY Visibility investigations.
 * Fixed audit origins only; no client URLs, site edits, permissions, or task status mutations.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SEOControlReport } from "./seo-control-report";
import { SEO_AUDIT_TARGETS, SEO_SUPPLEMENTAL_AUDIT_TARGETS, auditOneSite, type SiteAudit } from "./seo-audit";
import { visibilityAuditSummary } from "./visibility-audit-adapter";
import { planVisibilityReviewItems, type VisibilityReviewItem } from "./visibility-review-items";
import { planVisibilityWorkItem } from "./visibility-work-queue";
import { visibilityEvidenceAge } from "./visibility-evidence-age";
import type { VisibilityFinding } from "@/lib/visibility-product";

const ALLOWED_TARGETS = [...SEO_AUDIT_TARGETS, ...SEO_SUPPLEMENTAL_AUDIT_TARGETS];
export const MAX_INVESTIGATED_SITES = 2;
export const MAX_INVESTIGATED_TASKS = 4;
export const INVESTIGATION_ACTION = "visibility_independent_investigation";
const RECHECK_COOLDOWN_MS = 20 * 60 * 60_000;

export type InvestigationResult = "OBSERVED_AGAIN" | "NOT_REPRODUCED" |
  "DATA_STILL_INCOMPLETE" | "DATA_NOW_AVAILABLE" | "INCONCLUSIVE";

export function evaluateInvestigation(item: VisibilityReviewItem, audit: SiteAudit): {
  result: InvestigationResult;
  issueCode: string;
  checkedAt: string;
  evidence: { homepageStatus: number | null; h1Count: number | null;
    robotsStatus: number | null; sitemapStatus: number | null; issues: string[];
    incomplete: boolean; };
} {
  const summary = visibilityAuditSummary(audit);
  const originalIssueCode = item.type === "DATA_GAP" ? "DATA_GAP" : item.key.split(":")[2] || "UNKNOWN";
  // The existing bounded SEO audit verifies the homepage and fixed robots/sitemap.
  // Never present a homepage probe as proof for a different path.
  const path = item.affectedUrl ? new URL(item.affectedUrl).pathname : "/";
  const onHome = path === "/" || path === "";
  const reproduced = onHome && summary.issues.some(issue => issue.code === originalIssueCode);
  const result: InvestigationResult = item.type === "DATA_GAP"
    ? (summary.incomplete ? "DATA_STILL_INCOMPLETE" : "DATA_NOW_AVAILABLE")
    : !onHome ? "INCONCLUSIVE"
    : reproduced ? "OBSERVED_AGAIN"
    : summary.incomplete ? "INCONCLUSIVE" : "NOT_REPRODUCED";
  return {
    result, issueCode: originalIssueCode, checkedAt: audit.checkedAt,
    evidence: {
      homepageStatus: audit.home.status, h1Count: audit.home.h1Count,
      robotsStatus: audit.robots.status, sitemapStatus: audit.sitemap.status,
      issues: summary.issues.map(x => x.code), incomplete: summary.incomplete,
    },
  };
}

function makeFinding(item: VisibilityReviewItem): VisibilityFinding {
  return {
    id: item.key, brandId: item.brandId, title: item.title, detail: item.evidence,
    category: item.type === "DATA_GAP" ? "missing-data" : "technical",
    nextStep: item.nextStep,
    priority: item.priority === "HIGH" ? "high" : item.priority === "MEDIUM" ? "medium" : "unknown",
    url: item.affectedUrl, updatedAt: item.checkedAt, evidenceAge: "RECENT",
  };
}

export async function investigateVisibilityTasks(
  db: SupabaseClient,
  report: SEOControlReport | null,
  now: Date = new Date(),
  auditSite: typeof auditOneSite = auditOneSite,
): Promise<{ investigated: number; failed: number; skipped: number; results: Array<{brandId:string; result:InvestigationResult}>; publicationAuthorized:false }> {
  const none = { investigated: 0, failed: 0, skipped: 0, results: [], publicationAuthorized: false as const };
  // Observations must come from today's server-owned report, never arbitrary task metadata.
  if (!report || !Array.isArray(report.sites) || visibilityEvidenceAge(report.checkedAt, now) !== "RECENT" ||
      Math.abs(now.getTime() - Date.parse(report.checkedAt)) > 48 * 60 * 60_000) return none;

  const targets = new Map(ALLOWED_TARGETS.map(x => [x.brandId, x]));
  const candidates: Array<{item: VisibilityReviewItem; sourceId:string}> = [];
  for (const item of planVisibilityReviewItems(report)) {
    const target = targets.get(item.brandId);
    if (!target || visibilityEvidenceAge(item.checkedAt, now) !== "RECENT") continue;
    // Only the allowlisted homepage may be probed and compared. Unknown paths
    // are deferred to a future route-specific bounded audit.
    try {
      const url = item.affectedUrl && new URL(item.affectedUrl);
      if (url && (url.protocol !== "https:" || url.username || url.password || url.port ||
        ![new URL(target.base).hostname,new URL(target.base).hostname.replace(/^www\./, ""),
          "www." + new URL(target.base).hostname.replace(/^www\./, "")].includes(url.hostname) ||
        url.pathname !== "/")) continue;
      const plan = planVisibilityWorkItem(makeFinding(item));
      candidates.push({ item, sourceId: plan.source_id });
    } catch { continue; }
  }
  if (!candidates.length) return none;
  const { data: tasks, error: taskError } = await db.from("work_items")
    .select("id,brand_id,source_id,status,metadata")
    .eq("source_type", "ai_agent")
    .in("source_id", candidates.map(x => x.sourceId).slice(0, 30))
    .limit(30);
  if (taskError) throw new Error("Visibility work queue unavailable");
  const saved = new Map((tasks || []).filter(x =>
    x.metadata?.product === "altovena_visibility" &&
    x.status !== "CANCELLED" && x.status !== "DONE").map(x => [x.source_id, x]));
  const { data: recent, error: recentError } = await db.from("automation_logs")
    .select("created_at,details").eq("action", INVESTIGATION_ACTION)
    .order("created_at", { ascending: false }).limit(100);
  if (recentError) throw new Error("Visibility investigation log unavailable");
  const inCooldown = new Set((recent || []).filter(x =>
    Number.isFinite(Date.parse(x.created_at)) && now.getTime()-Date.parse(x.created_at) < RECHECK_COOLDOWN_MS)
    .map(x => x.details?.source_id).filter(Boolean));

  const pending = candidates.filter(x => saved.has(x.sourceId) && !inCooldown.has(x.sourceId));
  const selectedBrands = new Set<string>();
  const auditCache = new Map<string, SiteAudit>();
  let investigated = 0, failed = 0;
  const results: Array<{brandId:string; result:InvestigationResult}> = [];
  for (const candidate of pending) {
    if (investigated + failed >= MAX_INVESTIGATED_TASKS) break;
    const { item, sourceId } = candidate;
    if (!selectedBrands.has(item.brandId) && selectedBrands.size >= MAX_INVESTIGATED_SITES) continue;
    const target = targets.get(item.brandId)!;
    selectedBrands.add(item.brandId);
    try {
      const audit = auditCache.get(item.brandId) ?? await auditSite(target);
      auditCache.set(item.brandId, audit);
      const check = evaluateInvestigation(item, audit);
      // Independent evidence is stored separately from editable work-item
      // metadata. It is a follow-up observation, NOT proof of resolution.
      const { error } = await db.from("automation_logs").insert({
        action: INVESTIGATION_ACTION, agent_name: "Sam SEO Expert",
        status: check.result === "INCONCLUSIVE" || check.result === "DATA_STILL_INCOMPLETE" ? "partial" : "success",
        details: { work_item_id: saved.get(sourceId).id, brand_id: item.brandId,
          source_id: sourceId, checked_at: check.checkedAt,
          result: check.result, issue_code: check.issueCode,
          evidence: check.evidence, target_origin: target.base,
          read_only: true, publication_authorized: false, execution_started: false,
          resolution_verified: false },
      });
      if (error) { failed++; continue; }
      investigated++;
      results.push({ brandId: item.brandId, result: check.result });
    } catch {
      failed++;
      // A fetch failure must not become a false observed defect or verified fix.
    }
  }
  return { investigated, failed,
    skipped: candidates.length - investigated - failed,
    results, publicationAuthorized: false };
}
