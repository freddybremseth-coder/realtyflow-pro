import { AUTOMATION_REGISTRY } from "@/lib/automation/registry";

export type AgentFleetBinding = {
  id: string;
  displayName: string;
  role: string;
  agentRunIds: string[];
  automationPaths: string[];
};

export const AGENT_FLEET_BINDINGS: AgentFleetBinding[] = [
  {
    id: "marketing",
    displayName: "Alex Marketing Pro",
    role: "Marketing Strategist",
    agentRunIds: ["marketing-growth-os"],
    automationPaths: [
      "/api/cron/marketing-autopilot",
      "/api/cron/growth-engine",
      "/api/cron/marketing-growth-metrics",
    ],
  },
  {
    id: "sales",
    displayName: "Jordan Sales Master",
    role: "Sales & Conversion Specialist",
    agentRunIds: ["nexus_sales_sdr"],
    automationPaths: [
      "/api/cron/nexus-opportunity-sync",
      "/api/cron/nexus-commercial-activation",
      "/api/cron/nexus-buyer-profile-sync",
      "/api/cron/nexus-property-match-prep",
      "/api/cron/nexus-shortlist-prep",
      "/api/cron/nexus-presentation-prep",
      "/api/cron/nexus-send-preflight",
      "/api/cron/nexus-property-recommendation-send",
    ],
  },
  {
    id: "seo",
    displayName: "Sam SEO Expert",
    role: "SEO & Organic Growth Specialist",
    agentRunIds: [],
    automationPaths: [
      "/api/cron/trending-tags",
      "/api/cron/property-editorial",
    ],
  },
  {
    id: "business",
    displayName: "Morgan Business Strategist",
    role: "Business Strategy & Growth",
    agentRunIds: [],
    automationPaths: [
      "/api/cron/market-data",
      "/api/cron/weekly-report",
      "/api/cron/nexus-revenue-learning",
    ],
  },
  {
    id: "multi-domain",
    displayName: "Freddy Business Navigator",
    role: "Multi-Domain Business Expert",
    agentRunIds: [],
    automationPaths: [
      "/api/cron/movement-recommendation-snapshot",
      "/api/cron/communications-learning",
    ],
  },
  {
    id: "youtube",
    displayName: "Nova YouTube Creator",
    role: "YouTube Content & Growth",
    agentRunIds: [],
    automationPaths: [
      "/api/neural-beat/cron",
      "/api/cron/remaster-source-sync",
      "/api/cron/remaster-health-monitor",
      "/api/cron/remaster-analytics-snapshot",
      "/api/cron/remaster-growth-loop",
      "/api/cron/remaster-youtube-public-reconcile",
    ],
  },
  {
    id: "ceo",
    displayName: "Victoria CEO",
    role: "CEO & Strategic Leader",
    agentRunIds: [],
    automationPaths: [
      "/api/cron/nexus-mission-autopilot",
      "/api/cron/nexus-outcome-snapshot",
    ],
  },
  {
    id: "scheduling",
    displayName: "Sofia Scheduler",
    role: "AI Content Scheduling Strategist",
    agentRunIds: [],
    automationPaths: [
      "/api/cron/auto-publish",
      "/api/cron/book-distribution",
    ],
  },
];

export const WORKER_OWNED_AGENTS = [
  {
    id: "email",
    displayName: "Elena Email AI",
    role: "Communications worker",
    agentRunIds: [],
    automationPaths: [
      "/api/cron/email-auto-draft",
      "/api/cron/email-crm-sync",
    ],
  },
] satisfies AgentFleetBinding[];

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function automationActionKeysForBinding(binding: AgentFleetBinding) {
  const keys = new Set<string>();
  for (const path of binding.automationPaths) {
    const metadata = AUTOMATION_REGISTRY[path];
    if (!metadata) continue;
    keys.add(normalize(metadata.name));
    for (const key of metadata.actionKeys || []) keys.add(normalize(key));
  }
  return keys;
}

export function bindingForAutomationAction(action: unknown) {
  const normalized = normalize(action);
  if (!normalized) return null;
  return [...AGENT_FLEET_BINDINGS, ...WORKER_OWNED_AGENTS].find((binding) =>
    automationActionKeysForBinding(binding).has(normalized),
  ) || null;
}

const OUTPUT_KEYS = [
  "processed",
  "drafted",
  "created",
  "prepared",
  "sent",
  "generated",
  "published",
  "changed",
  "upserted",
  "reconciled",
  "recorded",
  "moved_to_review",
  "succeeded",
  "analyzed",
  "work_created",
  "source_marked",
  "publication_results",
  "actions_created",
  "updated",
  "written",
] as const;

export function automationOutputUnits(details: unknown) {
  if (!details || typeof details !== "object") return 0;
  const row = details as Record<string, unknown>;
  let units = 0;
  for (const key of OUTPUT_KEYS) {
    const value = Number(row[key] || 0);
    if (Number.isFinite(value) && value > units) units = value;
  }
  const totals = row.totals;
  if (totals && typeof totals === "object") {
    for (const value of Object.values(totals as Record<string, unknown>)) {
      const numeric = Number(value || 0);
      if (Number.isFinite(numeric) && numeric > units) units = numeric;
    }
  }
  return units;
}

export function isAutomationSuccess(status: unknown) {
  return ["success", "completed", "done", "partial"].includes(normalize(status));
}

export function isAutomationFailure(status: unknown) {
  return ["failed", "error"].includes(normalize(status));
}
