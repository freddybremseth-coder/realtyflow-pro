export type MarketingSurfaceKind = "destination" | "signal";
export type MarketingActionExecution = "AUTO_READY" | "HUMAN_REQUIRED" | "SYSTEM_WORK" | "WAIT";
export type MarketingActionPriority = "HIGH" | "MEDIUM" | "LOW";

export type MarketingDecisionRow = {
  brandId: string;
  brandName: string;
  platform: string | null;
  connected: boolean;
  brandBrainReady: boolean;
  planned: boolean;
  pilotReady: boolean;
  published: number;
  measuredEligible: number;
  quarantined: number;
  evaluatedRules: number;
  actionableRules: number;
  liveLearning: boolean;
  surfaceKind?: MarketingSurfaceKind;
};

export type MarketingNextAction = {
  id: string;
  kind:
    | "PREPARE_CANARY"
    | "RUN_LEARNING_EVALUATION"
    | "OPTIMIZE_WITH_LEARNING"
    | "REVIEW_QUARANTINE"
    | "COMPLETE_BRAND_BRAIN"
    | "ENABLE_PUBLISHING_GOVERNANCE"
    | "WAIT_FOR_METRICS";
  brandId: string;
  brandName: string;
  channel: string | null;
  sourceChannel: string | null;
  title: string;
  reason: string;
  href: string | null;
  execution: MarketingActionExecution;
  priority: MarketingActionPriority;
  evidence: string[];
};

const SIGNAL_PLATFORMS = new Set([
  "google_search_console",
  "search_console",
  "google_analytics",
  "analytics",
  "search_discovery",
]);

const CONTROLLED_CANARY_ROUTES: Record<string, string> = {
  "zeneco:instagram": "/marketing-canary",
  "zeneco:facebook": "/marketing-canary-facebook",
  "donaanna:instagram": "/marketing-canary-donaanna",
  "chatgenius:instagram": "/marketing-canary-chatgenius",
  "pinosoecolife:facebook": "/marketing-canary-pinoso-facebook",
};

export function marketingSurfaceKind(platform: string | null | undefined): MarketingSurfaceKind {
  return platform && SIGNAL_PLATFORMS.has(platform.toLowerCase()) ? "signal" : "destination";
}

export function controlledCanaryRoute(brandId: string, channel: string | null | undefined): string | null {
  if (!channel) return null;
  return CONTROLLED_CANARY_ROUTES[`${brandId}:${channel.toLowerCase()}`] ?? null;
}

function priorityWeight(priority: MarketingActionPriority) {
  return priority === "HIGH" ? 3 : priority === "MEDIUM" ? 2 : 1;
}

function executionWeight(execution: MarketingActionExecution) {
  if (execution === "HUMAN_REQUIRED") return 4;
  if (execution === "AUTO_READY") return 3;
  if (execution === "SYSTEM_WORK") return 2;
  return 1;
}

export function buildMarketingNextActions(
  rows: MarketingDecisionRow[],
  requiredObservations = 10,
): MarketingNextAction[] {
  const destinations = rows.filter((row) => (row.surfaceKind ?? marketingSurfaceKind(row.platform)) === "destination");
  const actions: MarketingNextAction[] = [];

  for (const row of destinations) {
    const channel = row.platform?.toLowerCase() ?? null;
    if (!channel) continue;

    if (row.quarantined > 0) {
      actions.push({
        id: `review-quarantine:${row.brandId}:${channel}`,
        kind: "REVIEW_QUARANTINE",
        brandId: row.brandId,
        brandName: row.brandName,
        channel,
        sourceChannel: null,
        title: `${row.brandName} · datakvalitet i karantene`,
        reason: `${row.quarantined} måling(er) er allerede ekskludert fra læringen. Systemet beholder dem som audit/data-hygiene uten at de får påvirke nye regler.`,
        href: "/analytics",
        execution: "SYSTEM_WORK",
        priority: "LOW",
        evidence: [`quarantined=${row.quarantined}`, `published=${row.published}`],
      });
    }

    if (row.connected && !row.brandBrainReady) {
      actions.push({
        id: `brand-brain:${row.brandId}:${channel}`,
        kind: "COMPLETE_BRAND_BRAIN",
        brandId: row.brandId,
        brandName: row.brandName,
        channel,
        sourceChannel: null,
        title: `${row.brandName} · Brand Brain må ferdigstilles`,
        reason: "Kanalen er koblet, men brandets identitet, claims og arbeidsgrenser er ikke klare nok til trygg autonom produksjon.",
        href: "/nexus-os/brand-brain",
        execution: "HUMAN_REQUIRED",
        priority: "HIGH",
        evidence: ["connected=true", "brandBrainReady=false"],
      });
      continue;
    }

    if (row.connected && row.brandBrainReady && row.planned && !row.pilotReady) {
      actions.push({
        id: `governance:${row.brandId}:${channel}`,
        kind: "ENABLE_PUBLISHING_GOVERNANCE",
        brandId: row.brandId,
        brandName: row.brandName,
        channel,
        sourceChannel: null,
        title: `${row.brandName} · ${channel} trenger publisher-governance`,
        reason: "Kanal og Brand Brain finnes, men write-governance/publisher er ikke pilotklar. Dette er systemarbeid, ikke en daglig brukeroppgave.",
        href: "/marketing-readiness",
        execution: "SYSTEM_WORK",
        priority: "LOW",
        evidence: ["connected=true", "brandBrainReady=true", "planned=true", "pilotReady=false"],
      });
      continue;
    }

    if (!row.pilotReady) continue;

    if (row.measuredEligible >= requiredObservations && row.evaluatedRules === 0) {
      actions.push({
        id: `learning-evaluation:${row.brandId}:${channel}`,
        kind: "RUN_LEARNING_EVALUATION",
        brandId: row.brandId,
        brandName: row.brandName,
        channel,
        sourceChannel: channel,
        title: `${row.brandName} · evaluer læringen`,
        reason: "Kanalen har nok modne, learning-eligible observasjoner, men Learning Engine har ennå ikke skrevet kanalregler.",
        href: "/analytics",
        execution: "AUTO_READY",
        priority: "HIGH",
        evidence: [`eligible=${row.measuredEligible}/${requiredObservations}`, "evaluatedRules=0"],
      });
      continue;
    }

    if (row.liveLearning) {
      actions.push({
        id: `optimize:${row.brandId}:${channel}`,
        kind: "OPTIMIZE_WITH_LEARNING",
        brandId: row.brandId,
        brandName: row.brandName,
        channel,
        sourceChannel: channel,
        title: `${row.brandName} · bruk dokumentert læring`,
        reason: row.actionableRules > 0
          ? `Learning Engine har ${row.actionableRules} handlingsregler. Marketing Autopilot bruker dem automatisk ved neste planlagte generering.`
          : "Kanalen har tilstrekkelig læring. Marketing Autopilot fortsetter kontrollert produksjon og samler business-outcomes automatisk.",
        href: "/content-studio",
        execution: "SYSTEM_WORK",
        priority: "MEDIUM",
        evidence: [
          `eligible=${row.measuredEligible}`,
          `evaluatedRules=${row.evaluatedRules}`,
          `actionableRules=${row.actionableRules}`,
        ],
      });
      continue;
    }

    const source = destinations
      .filter((candidate) =>
        candidate.brandId === row.brandId
        && candidate.platform
        && candidate.platform !== row.platform
        && candidate.liveLearning,
      )
      .sort((a, b) =>
        b.actionableRules - a.actionableRules
        || b.measuredEligible - a.measuredEligible,
      )[0];

    const canaryHref = controlledCanaryRoute(row.brandId, channel);
    if (source && canaryHref && row.measuredEligible < requiredObservations) {
      actions.push({
        id: `prepare-canary:${row.brandId}:${channel}`,
        kind: "PREPARE_CANARY",
        brandId: row.brandId,
        brandName: row.brandName,
        channel,
        sourceChannel: source.platform,
        title: `${row.brandName} · klargjør ${channel}-canary`,
        reason: `${source.platform} har dokumentert live learning. ${channel} er pilotklar, men trenger egne modne observasjoner før kanalen kan lære selv.`,
        href: canaryHref,
        execution: "AUTO_READY",
        priority: "MEDIUM",
        evidence: [
          `source=${source.platform}`,
          `sourceEligible=${source.measuredEligible}`,
          `sourceRules=${source.evaluatedRules}/${source.actionableRules}`,
          `targetEligible=${row.measuredEligible}/${requiredObservations}`,
        ],
      });
      continue;
    }

    if (row.measuredEligible < requiredObservations) {
      actions.push({
        id: `wait-metrics:${row.brandId}:${channel}`,
        kind: "WAIT_FOR_METRICS",
        brandId: row.brandId,
        brandName: row.brandName,
        channel,
        sourceChannel: channel,
        title: `${row.brandName} · vent på modne data`,
        reason: `Kanalen har ${row.measuredEligible}/${requiredObservations} learning-eligible observasjoner. Ingen ekstra brukerhandling er nødvendig før nye metrics er modne.`,
        href: null,
        execution: "WAIT",
        priority: "LOW",
        evidence: [`eligible=${row.measuredEligible}/${requiredObservations}`, `published=${row.published}`],
      });
    }
  }

  return actions.sort((a, b) =>
    priorityWeight(b.priority) - priorityWeight(a.priority)
    || executionWeight(b.execution) - executionWeight(a.execution)
    || a.brandName.localeCompare(b.brandName)
    || String(a.channel).localeCompare(String(b.channel)),
  );
}
