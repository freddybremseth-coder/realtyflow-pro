import {
  evaluateNexusActionPolicy,
  type NexusActionPolicyEvaluation,
} from "@/lib/nexus/action-policy-registry";

const DEFAULT_MAX_PREFLIGHT_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30 * 1000;

const EXPLICIT_APPROVAL_ACTIONS = new Set([
  "property_recommendation_send_preapproved",
  "social_publish_approved",
  "marketing_autopilot_publish_preapproved",
]);

export interface NexusExecutionBoundaryContext {
  executorEnabled: boolean;
  evidenceSatisfied: boolean;
  auditTrailReady: boolean;
  idempotencyKey: string | null | undefined;
  freshPreflight?: {
    passed: boolean;
    checkedAt: string | Date;
    maxAgeMs?: number;
  };
  explicitApprovalSatisfied?: boolean;
  now?: string | Date;
}

export interface NexusExecutionBoundaryEvaluation extends NexusActionPolicyEvaluation {
  auditTrailReady: boolean;
  idempotencyProtected: boolean;
  preflightFresh: boolean;
  explicitApprovalSatisfied: boolean;
  evaluatedAt: string;
}

function validDate(value: string | Date | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function freshPreflight(context: NexusExecutionBoundaryContext, now: Date) {
  const preflight = context.freshPreflight;
  const checkedAt = validDate(preflight?.checkedAt);
  if (!preflight?.passed || !checkedAt) return false;
  const age = now.getTime() - checkedAt.getTime();
  const maxAge = Math.max(1, preflight.maxAgeMs ?? DEFAULT_MAX_PREFLIGHT_AGE_MS);
  return age >= -MAX_CLOCK_SKEW_MS && age <= maxAge;
}

export function evaluateNexusExecutionBoundary(
  actionType: string,
  context: NexusExecutionBoundaryContext,
): NexusExecutionBoundaryEvaluation {
  const now = validDate(context.now) ?? new Date();
  const preflightFresh = freshPreflight(context, now);
  const policy = evaluateNexusActionPolicy(actionType, {
    executorEnabled: context.executorEnabled,
    evidenceSatisfied: context.evidenceSatisfied,
    freshSafetyCheckPassed: preflightFresh,
  });
  const blockers = [...policy.blockers];
  const auditTrailReady = context.auditTrailReady === true;
  const idempotencyProtected = Boolean(String(context.idempotencyKey || "").trim());
  const approvalRequired = EXPLICIT_APPROVAL_ACTIONS.has(actionType);
  const explicitApprovalSatisfied = !approvalRequired || context.explicitApprovalSatisfied === true;

  if (!auditTrailReady) blockers.push("audit_trail_required");
  if (!idempotencyProtected) blockers.push("idempotency_key_required");
  if (!explicitApprovalSatisfied) blockers.push("explicit_approval_required");

  const uniqueBlockers = [...new Set(blockers)];
  return {
    ...policy,
    automaticExecutionAllowed: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    auditTrailReady,
    idempotencyProtected,
    preflightFresh,
    explicitApprovalSatisfied,
    evaluatedAt: now.toISOString(),
  };
}

export function requireNexusExecutionBoundary(
  actionType: string,
  context: NexusExecutionBoundaryContext,
) {
  const evaluation = evaluateNexusExecutionBoundary(actionType, context);
  if (!evaluation.automaticExecutionAllowed) {
    throw new Error(`NEXUS_EXECUTION_BOUNDARY_BLOCKED:${actionType}:${evaluation.blockers.join(",")}`);
  }
  return evaluation;
}
