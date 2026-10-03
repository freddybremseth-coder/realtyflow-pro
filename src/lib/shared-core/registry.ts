export type SharedCoreStatus = "canonical" | "extracting" | "planned";

export type SharedCoreDomainId =
  | "identity"
  | "finance"
  | "media"
  | "tasks"
  | "audit"
  | "nexus-feedback";

export type SharedCoreDomain = {
  id: SharedCoreDomainId;
  label: string;
  status: SharedCoreStatus;
  canonicalService: string;
  systemOfRecord: string;
  consumers: Array<"sales" | "marketing" | "content" | "finance" | "operations" | "olivia" | "family">;
  sources: string[];
  nextStep: string;
};

export const SHARED_CORE_DOMAINS: readonly SharedCoreDomain[] = [
  {
    id: "identity",
    label: "Identity, brands & customer context",
    status: "canonical",
    canonicalService: "CRM + brand/access-control services",
    systemOfRecord: "contacts + existing brand/workspace access model",
    consumers: ["sales", "marketing", "content", "finance", "operations"],
    sources: ["CRM", "brand context", "workspace memberships"],
    nextStep: "Keep customer and brand identity centralized; work apps may add journeys, never duplicate identities.",
  },
  {
    id: "finance",
    label: "Business finance",
    status: "canonical",
    canonicalService: "Shared Core Finance ledger",
    systemOfRecord: "business_financial_events",
    consumers: ["sales", "marketing", "finance", "operations", "olivia", "family"],
    sources: ["CRM", "KDP", "SaaS", "Olivia", "Family Mondeo", "manual owner entries"],
    nextStep: "Move all finance ingestion through explicit source adapters and reuse billing documents/payments as enrichments.",
  },
  {
    id: "media",
    label: "Media assets & generation jobs",
    status: "canonical",
    canonicalService: "Media Studio",
    systemOfRecord: "media_assets + media_generation_jobs + media_projects",
    consumers: ["marketing", "content", "operations"],
    sources: ["Media Studio", "Content Hub exports", "specialist renderers"],
    nextStep: "Bridge Re-Master outputs into the canonical asset model instead of maintaining parallel asset libraries.",
  },
  {
    id: "tasks",
    label: "Tasks & automation",
    status: "extracting",
    canonicalService: "Nexus work/action layer",
    systemOfRecord: "existing work-item and automation services",
    consumers: ["sales", "marketing", "content", "finance", "operations", "olivia"],
    sources: ["work items", "automation registry", "Care", "Olivia operations"],
    nextStep: "Normalize reusable task, assignment, due-date and outcome primitives before moving specialist workflows.",
  },
  {
    id: "audit",
    label: "Audit & execution evidence",
    status: "canonical",
    canonicalService: "Audit Log + execution evidence",
    systemOfRecord: "existing audit/execution services",
    consumers: ["sales", "marketing", "content", "finance", "operations"],
    sources: ["approvals", "publishing", "CRM writes", "automation", "revenue actions"],
    nextStep: "Require every migrated shared service to retain actor, source, outcome and correlation evidence.",
  },
  {
    id: "nexus-feedback",
    label: "Nexus feedback loop",
    status: "extracting",
    canonicalService: "Cross-app evidence and learning",
    systemOfRecord: "existing revenue, attribution, marketing-learning and execution evidence",
    consumers: ["sales", "marketing", "content", "finance", "operations"],
    sources: ["Content", "Marketing", "Sales", "Finance"],
    nextStep: "Join evidence across Content → Marketing → Sales → Finance without allowing inferred success to replace observed outcomes.",
  },
] as const;

export const SHARED_CORE_DOMAIN_BY_ID = Object.fromEntries(
  SHARED_CORE_DOMAINS.map((domain) => [domain.id, domain]),
) as Record<SharedCoreDomainId, SharedCoreDomain>;

export function sharedCoreProgress() {
  const total = SHARED_CORE_DOMAINS.length;
  const canonical = SHARED_CORE_DOMAINS.filter((domain) => domain.status === "canonical").length;
  const extracting = SHARED_CORE_DOMAINS.filter((domain) => domain.status === "extracting").length;
  const planned = SHARED_CORE_DOMAINS.filter((domain) => domain.status === "planned").length;
  return { total, canonical, extracting, planned };
}
