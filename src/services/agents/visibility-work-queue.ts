/**
 * Visibility -> Nexus work-items contract.
 * Planning only: producing a plan NEVER executes a fix or grants publishing consent.
 * The durable work_items table is the single task ledger.
 */
import type { VisibilityFinding } from "@/lib/visibility-product";

export type VisibilityWorkState =
  | "PROPOSED" | "QUEUED" | "RUNNING" | "AWAITING_APPROVAL"
  | "BLOCKED" | "VERIFYING" | "VERIFIED" | "FAILED";

export type VisibilityWorkPlan = {
  source_type: "ai_agent";
  source_id: string;
  brand_id: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  assigned_agent: "sam";
  next_action: string;
  status: "TO_DO";
  metadata: {
    product: "altovena_visibility";
    origin: "visibility_finding";
    finding_id: string;
    evidence_at: string | null;
    evidence_age: VisibilityFinding["evidenceAge"];
    category: VisibilityFinding["category"];
    target_url: string | null;
    execution_state: "PROPOSED";
    publication_authorized: false;
    verification_required: true;
  };
};

const SAFE_ID = /^[a-zA-Z0-9_.:-]{1,180}$/;
const VALID_BRAND = /^[a-z0-9_-]{1,64}$/;

export function planVisibilityWorkItem(finding: VisibilityFinding): VisibilityWorkPlan {
  if (!SAFE_ID.test(finding.id) || !VALID_BRAND.test(finding.brandId)) {
    throw new Error("Invalid visibility finding identity");
  }
  // Repeated scans must map the same finding to the same task. The database
  // writer still needs atomic uniqueness/upsert for true concurrent safety.
  const sourceId = `visibility:${finding.brandId}:${finding.id}`;
  return {
    source_type: "ai_agent",
    source_id: sourceId,
    brand_id: finding.brandId,
    title: finding.title,
    description: finding.detail,
    priority: finding.priority === "high" ? "HIGH" : finding.priority === "medium" ? "MEDIUM" : "LOW",
    assigned_agent: "sam",
    next_action: finding.nextStep,
    status: "TO_DO",
    metadata: {
      product: "altovena_visibility",
      origin: "visibility_finding",
      finding_id: finding.id,
      evidence_at: finding.updatedAt,
      evidence_age: finding.evidenceAge,
      category: finding.category,
      target_url: finding.url,
      execution_state: "PROPOSED",
      publication_authorized: false,
      verification_required: true,
    },
  };
}

export function visibilityWorkDisplayState(status: string, metadata?: Record<string, unknown> | null): VisibilityWorkState {
  const execution = metadata?.execution_state;
  if (execution === "VERIFIED" && status === "DONE") return "VERIFIED";
  if (execution === "VERIFYING") return "VERIFYING";
  if (execution === "AWAITING_APPROVAL") return "AWAITING_APPROVAL";
  if (execution === "BLOCKED") return "BLOCKED";
  if (execution === "FAILED") return "FAILED";
  if (status === "IN_PROGRESS") return "RUNNING";
  if (status === "TO_DO" || status === "REVIEW") return "QUEUED";
  // DONE without verification evidence is not a verified resolution.
  return "PROPOSED";
}
