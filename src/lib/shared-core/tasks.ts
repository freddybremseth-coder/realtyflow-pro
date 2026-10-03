export const WORK_ITEM_STATUSES = [
  "TO_DO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
  "CANCELLED",
] as const;

export const WORK_ITEM_ACTIVE_STATUSES = [
  "TO_DO",
  "IN_PROGRESS",
  "REVIEW",
] as const;

export const WORK_ITEM_TERMINAL_STATUSES = [
  "DONE",
  "CANCELLED",
] as const;

export const WORK_ITEM_PRIORITIES = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;

export const WORK_ITEM_SOURCE_TYPES = [
  "manual",
  "crm",
  "content",
  "automation",
  "ai_agent",
  "website_lead",
  "chatbot",
  "saas",
  "publishing",
  "kdp",
  "brand",
  "property",
  "market_intelligence",
] as const;

export const AUTOMATION_RULE_STATUSES = ["active", "paused", "disabled"] as const;
export const AUTOMATION_RUN_STATUSES = ["running", "success", "error", "cancelled"] as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];
export type WorkItemSource = (typeof WORK_ITEM_SOURCE_TYPES)[number];
export type AutomationRuleStatus = (typeof AUTOMATION_RULE_STATUSES)[number];
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

const ACTIVE_STATUS_SET = new Set<string>(WORK_ITEM_ACTIVE_STATUSES);
const STATUS_ALIASES: Record<string, WorkItemStatus> = {
  TODO: "TO_DO",
  OPEN: "TO_DO",
  PENDING: "TO_DO",
  COMPLETE: "DONE",
  COMPLETED: "DONE",
  CLOSED: "DONE",
  CANCELED: "CANCELLED",
};

export function normalizeWorkItemStatus(value: unknown): WorkItemStatus {
  const raw = String(value || "TO_DO").trim().toUpperCase();
  if ((WORK_ITEM_STATUSES as readonly string[]).includes(raw)) return raw as WorkItemStatus;
  return STATUS_ALIASES[raw] || "TO_DO";
}

export function isActiveWorkItemStatus(value: unknown) {
  return ACTIVE_STATUS_SET.has(normalizeWorkItemStatus(value));
}

export function isTerminalWorkItemStatus(value: unknown) {
  return (WORK_ITEM_TERMINAL_STATUSES as readonly string[]).includes(normalizeWorkItemStatus(value));
}

export function normalizeWorkItemPriority(value: unknown): WorkItemPriority {
  const raw = String(value || "MEDIUM").trim().toUpperCase();
  return (WORK_ITEM_PRIORITIES as readonly string[]).includes(raw)
    ? raw as WorkItemPriority
    : "MEDIUM";
}

export function normalizeWorkItemSourceType(value: unknown): WorkItemSource {
  const raw = String(value || "manual").trim().toLowerCase();
  return (WORK_ITEM_SOURCE_TYPES as readonly string[]).includes(raw)
    ? raw as WorkItemSource
    : "manual";
}

export function normalizeExternalTaskStatus(value: unknown): WorkItemStatus {
  return normalizeWorkItemStatus(value);
}

export type SharedWorkBoundary = {
  id: "realtyflow" | "workspace_joint" | "olivia" | "automation";
  owner: "shared-core" | "workspace" | "olivia" | "operations";
  systemOfRecord: string;
  mode: "canonical" | "isolated" | "specialist" | "execution-evidence";
  mirrorIntoWorkItems: boolean;
  description: string;
};

export const SHARED_WORK_BOUNDARIES: readonly SharedWorkBoundary[] = [
  {
    id: "realtyflow",
    owner: "shared-core",
    systemOfRecord: "public.work_items",
    mode: "canonical",
    mirrorIntoWorkItems: true,
    description: "Canonical internal human/operational work for RealtyFlow apps and governed Nexus actions.",
  },
  {
    id: "workspace_joint",
    owner: "workspace",
    systemOfRecord: "core.zeneco_joint_work_items",
    mode: "isolated",
    mirrorIntoWorkItems: false,
    description: "Joint workspace tasks remain intentionally isolated from legacy/global customer work and are never auto-copied.",
  },
  {
    id: "olivia",
    owner: "olivia",
    systemOfRecord: "olivia.tasks",
    mode: "specialist",
    mirrorIntoWorkItems: false,
    description: "Farm tasks remain in Olivia with parcel/category context; Shared Core may project them read-only through adapters.",
  },
  {
    id: "automation",
    owner: "operations",
    systemOfRecord: "public.automation_rules + public.automation_runs + public.automation_logs",
    mode: "execution-evidence",
    mirrorIntoWorkItems: false,
    description: "Automation definitions and run evidence are not work items. Create a work item only when explicit human action is required.",
  },
] as const;

export const SHARED_WORK_BOUNDARY_BY_ID = Object.fromEntries(
  SHARED_WORK_BOUNDARIES.map((boundary) => [boundary.id, boundary]),
) as Record<SharedWorkBoundary["id"], SharedWorkBoundary>;
