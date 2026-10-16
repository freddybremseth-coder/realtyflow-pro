/** Deterministic, non-executing intake contract for Nexus AI development work. */
export type DevelopmentWorkStatus =
  | "requested"
  | "triaging"
  | "needs_approval"
  | "in_progress"
  | "in_review"
  | "verified"
  | "deployed"
  | "blocked";

export type DevelopmentWorkScope =
  | "bug"
  | "feature"
  | "content"
  | "access"
  | "deployment"
  | "investigation";

export interface DevelopmentIntake {
  request: string;
  scope: DevelopmentWorkScope;
  brandKey: string | null;
  pagePath: string | null;
  status: "requested";
  executionAuthorized: false;
}

const ALLOWED_BRANDS = new Set([
  "zeneco", "pinosoecolife", "care", "soleada", "donaanna", "altovena",
]);

export function normalizeDevelopmentPagePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const withoutQuery = value.split(/[?#]/, 1)[0];
  return withoutQuery.length <= 512 && !/[\\\r\n]/.test(withoutQuery) ? withoutQuery : null;
}

export function prepareDevelopmentIntake(input: {
  request: unknown;
  scope: DevelopmentWorkScope;
  brandKey?: unknown;
  pagePath?: unknown;
}): DevelopmentIntake | null {
  if (typeof input.request !== "string") return null;
  const request = input.request.trim();
  if (!request || request.length > 5000) return null;
  const brand = typeof input.brandKey === "string" ? input.brandKey.trim().toLowerCase() : "";
  return {
    request,
    scope: input.scope,
    brandKey: ALLOWED_BRANDS.has(brand) ? brand : null,
    pagePath: normalizeDevelopmentPagePath(input.pagePath),
    status: "requested",
    executionAuthorized: false,
  };
}

export function canAdvanceDevelopmentWork(
  status: DevelopmentWorkStatus,
  next: DevelopmentWorkStatus,
  explicitApproval: boolean,
): boolean {
  const allowed: Record<DevelopmentWorkStatus, DevelopmentWorkStatus[]> = {
    requested: ["triaging", "blocked"],
    triaging: ["needs_approval", "blocked"],
    needs_approval: ["in_progress", "blocked"],
    in_progress: ["in_review", "blocked"],
    in_review: ["verified", "in_progress", "blocked"],
    verified: ["deployed", "blocked"],
    deployed: [],
    blocked: ["triaging"],
  };
  if (!allowed[status].includes(next)) return false;
  if (status === "needs_approval" && next === "in_progress") return explicitApproval;
  if (status === "verified" && next === "deployed") return explicitApproval;
  return true;
}
