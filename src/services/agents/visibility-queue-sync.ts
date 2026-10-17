/**
 * Shared, bounded and inert Visibility -> Nexus work-items sync.
 *
 * Both the owner's manual sync button and Sam's daily SEO cycle use this
 * implementation. The source MUST be a server-produced SEOControlReport,
 * never a request body. This module does not execute repairs or publish.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SEOControlReport } from "./seo-control-report";
import { planVisibilityReviewItems } from "./visibility-review-items";
import { visibilityEvidenceAge } from "./visibility-evidence-age";
import { planVisibilityWorkItem, type VisibilityWorkPlan } from "./visibility-work-queue";
import { VISIBILITY_BRANDS, type VisibilityFinding } from "@/lib/visibility-product";

export const VISIBILITY_REVIEW_BATCH_LIMIT = 30;

export type VisibilityQueueSyncResult = {
  state: "registered" | "stale" | "unavailable" | "partial";
  examined: number;
  accepted: number;
  workItemIds: string[];
  rejected: number;
  errors: number;
  truncated: boolean;
  publicationAuthorized: false;
  executionStarted: false;
};

function validTargetHost(value: string | null, brandId: string): boolean {
  if (value === null) return true;
  const domain = VISIBILITY_BRANDS[brandId]?.domain;
  if (!domain) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === domain || hostname === `www.${domain}`;
  } catch {
    return false;
  }
}

export function planVisibilityQueue(
  report: SEOControlReport | null | undefined,
  now: Date = new Date(),
) {
  if (!report || !Array.isArray(report.sites) || visibilityEvidenceAge(report.checkedAt, now) !== "RECENT") {
    return { available: false as const, examined: 0, rejected: 0, truncated: false, plans: [] as VisibilityWorkPlan[] };
  }
  const items = planVisibilityReviewItems(report);
  const plans: VisibilityWorkPlan[] = [];
  let rejected = 0;
  for (const item of items) {
    if (!Object.prototype.hasOwnProperty.call(VISIBILITY_BRANDS, item.brandId) ||
        visibilityEvidenceAge(item.checkedAt, now) !== "RECENT" ||
        !validTargetHost(item.affectedUrl, item.brandId)) {
      rejected++;
      continue;
    }
    if (plans.length >= VISIBILITY_REVIEW_BATCH_LIMIT) continue;
    const finding: VisibilityFinding = {
      id: item.key, brandId: item.brandId, title: item.title,
      category: item.type === "DATA_GAP" ? "missing-data" : "technical",
      detail: item.evidence, nextStep: item.nextStep,
      priority: item.priority === "HIGH" ? "high" : item.priority === "MEDIUM" ? "medium" : "unknown",
      url: item.affectedUrl, updatedAt: item.checkedAt, evidenceAge: "RECENT",
    };
    try {
      plans.push(planVisibilityWorkItem(finding));
    } catch {
      rejected++;
    }
  }
  return { available: true as const, examined: items.length, rejected,
    truncated: items.length - rejected > VISIBILITY_REVIEW_BATCH_LIMIT, plans };
}

export async function syncVisibilityReviewQueue(
  supabase: SupabaseClient,
  report: SEOControlReport | null | undefined,
  now: Date = new Date(),
): Promise<VisibilityQueueSyncResult> {
  const proposed = planVisibilityQueue(report, now);
  const base = {
    examined: proposed.examined, rejected: proposed.rejected, truncated: proposed.truncated,
    publicationAuthorized: false as const, executionStarted: false as const,
  };
  if (!proposed.available) {
    return { ...base, state: "stale", accepted: 0, workItemIds: [], errors: 0 };
  }
  const workItemIds: string[] = [];
  let errors = 0;
  for (const plan of proposed.plans) {
    try {
      const { data, error } = await supabase.rpc("enqueue_visibility_review", {
        p_brand_id: plan.brand_id, p_finding_id: plan.metadata.finding_id,
        p_title: plan.title, p_description: plan.description,
        p_next_action: plan.next_action, p_priority: plan.priority,
        p_evidence_at: plan.metadata.evidence_at,
        p_evidence_age: plan.metadata.evidence_age,
        p_category: plan.metadata.category,
        p_target_url: plan.metadata.target_url,
      });
      if (error || typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data)) {
        errors++;
        break; // fail closed on storage errors; do not claim successful creation
      }
      workItemIds.push(data);
    } catch {
      errors++;
      break;
    }
  }
  return {
    ...base,
    state: errors ? "partial" : proposed.rejected ? "partial" : "registered",
    accepted: workItemIds.length, workItemIds, errors,
  };
}
