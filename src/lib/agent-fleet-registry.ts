export type AgentFleetId =
  | "marketing"
  | "sales"
  | "seo"
  | "business"
  | "multi-domain"
  | "youtube"
  | "ceo"
  | "scheduling"
  | "email";

export type AgentFleetDefinition = {
  id: AgentFleetId;
  displayName: string;
  role: string;
  aliases: string[];
  ownedAutomationActions: string[];
};

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const AGENT_FLEET: AgentFleetDefinition[] = [
  {
    id: "marketing",
    displayName: "Alex Marketing Pro",
    role: "Marketing Strategist",
    aliases: ["marketing", "alex marketing pro"],
    ownedAutomationActions: [
      "marketing_autopilot",
      "growth_engine",
      "marketing_growth_metrics",
      "social_inbox_sync",
      "property_marketing",
    ],
  },
  {
    id: "sales",
    displayName: "Jordan Sales Master",
    role: "Sales & Conversion Specialist",
    aliases: ["sales", "jordan sales master"],
    ownedAutomationActions: [
      "email_crm_sync",
      "nexus_buyer_profile_sync",
      "nexus_property_feedback",
      "nexus_viewing_coach",
      "nexus_property_match_prep",
      "nexus_shortlist_prep",
      "nexus_presentation_prep",
      "nexus_no_match_followup",
      "nexus_send_preflight",
      "nexus_property_recommendation_send",
    ],
  },
  {
    id: "seo",
    displayName: "Sam SEO Expert",
    role: "SEO & Organic Growth Specialist",
    aliases: ["seo", "sam seo expert"],
    ownedAutomationActions: ["trending_tags"],
  },
  {
    id: "business",
    displayName: "Morgan Business Strategist",
    role: "Business Strategy & Growth Specialist",
    aliases: ["business", "morgan business strategist"],
    ownedAutomationActions: [
      "nexus_revenue_learning",
      "movement_recommendation_snapshot",
      "market_data",
      "weekly_report",
    ],
  },
  {
    id: "multi-domain",
    displayName: "Freddy Business Navigator",
    role: "Multi-Domain Business Expert",
    aliases: ["multi-domain", "multi_domain", "freddy business navigator"],
    ownedAutomationActions: ["nexus_opportunity_sync"],
  },
  {
    id: "youtube",
    displayName: "Nova YouTube Creator",
    role: "YouTube Content & Growth Specialist",
    aliases: ["youtube", "nova youtube creator"],
    ownedAutomationActions: [
      "remaster_source_sync",
      "remaster_health_monitor",
      "remaster_mix_worker",
      "remaster_playlist_recovery",
      "remaster_youtube_public_reconcile",
      "remaster_analytics_snapshot",
      "remaster_growth_loop",
    ],
  },
  {
    id: "ceo",
    displayName: "Victoria CEO",
    role: "CEO & Strategisk Leder",
    aliases: ["ceo", "victoria ceo"],
    ownedAutomationActions: [
      "nexus_mission_autopilot",
      "nexus_commercial_activation",
      "nexus_outcome_snapshot",
    ],
  },
  {
    id: "scheduling",
    displayName: "Sofia Scheduler",
    role: "AI Content Scheduling Strategist",
    aliases: ["scheduling", "scheduler", "sofia scheduler"],
    ownedAutomationActions: ["auto_publish"],
  },
  {
    id: "email",
    displayName: "Elena Email AI",
    role: "E-postassistent for eiendom",
    aliases: ["email", "elena email ai"],
    ownedAutomationActions: [
      "email_ingest",
      "email_auto_draft",
      "communications_learning",
    ],
  },
];

const BY_ID = new Map(AGENT_FLEET.map((agent) => [agent.id, agent]));

export function getAgentFleetDefinition(id: AgentFleetId) {
  return BY_ID.get(id) || null;
}

export function resolveAgentFleetId(value: unknown): AgentFleetId | null {
  const normalized = normalize(value);
  if (!normalized) return null;

  for (const agent of AGENT_FLEET) {
    if (normalize(agent.id) === normalized) return agent.id;
    if (normalize(agent.displayName) === normalized) return agent.id;
    if (agent.aliases.some((alias) => normalize(alias) === normalized)) return agent.id;
    if (agent.aliases.some((alias) => normalized.includes(normalize(alias)))) return agent.id;
  }

  return null;
}

export function resolveAutomationAgentId(action: unknown): AgentFleetId | null {
  const normalized = normalize(action);
  if (!normalized) return null;
  const match = AGENT_FLEET.find((agent) =>
    agent.ownedAutomationActions.some((owned) => normalize(owned) === normalized),
  );
  return match?.id || null;
}
