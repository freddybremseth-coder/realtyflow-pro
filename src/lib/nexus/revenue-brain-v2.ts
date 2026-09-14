export type RevenueBrainV2Focus = "CASH_NOW" | "PIPELINE_NEXT" | "RETENTION" | "DEMAND";
export type RevenueBrainV2Readiness = "READY_TO_PREPARE" | "HUMAN_DECISION" | "RESEARCH_REQUIRED" | "BLOCKED";

export type RevenueBrainV2Mission = {
  id: string;
  opportunityId: string;
  brandId: string;
  pipelineId: string;
  stageId: string;
  role: string;
  objective: string;
  title: string;
  nextAction: string;
  whyNow: string;
  desiredOutcome: string;
  priority: string;
  priorityScore: number;
  expectedValue: number | null;
  currency: string | null;
  dueInHours: number;
  href: string;
};

export type RevenueBrainV2Plan = {
  missionId: string;
  capability: string;
  effectiveMode: string;
  guardrailReason: string | null;
  externalSideEffectAllowed: boolean;
};

export type RevenueBrainV2PipelineHealth = {
  brandId: string;
  pipelineId: string;
  health: string;
  staleOpportunities: number;
  staleConversionOpportunities: number;
  unknownFreshness: number;
  reasons: string[];
};

export type RevenueBrainV2Input = {
  generatedAt: string;
  growthMissions: RevenueBrainV2Mission[];
  agenticPlans: RevenueBrainV2Plan[];
  health: RevenueBrainV2PipelineHealth[];
  warnings?: string[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function valueSignal(value: number | null) {
  return value && value > 0 ? Math.min(16, Math.log10(value + 1) * 3) : 0;
}

function focusFor(mission: RevenueBrainV2Mission): RevenueBrainV2Focus {
  if (mission.objective === "close" || mission.role === "closer") return "CASH_NOW";
  if (mission.objective === "retain_expand" || mission.objective === "deliver" || mission.role === "customer_success") return "RETENTION";
  if (mission.objective === "generate_lead" || mission.objective === "create_engagement") return "DEMAND";
  return "PIPELINE_NEXT";
}

function readinessFor(plan: RevenueBrainV2Plan | undefined): RevenueBrainV2Readiness {
  if (!plan) return "BLOCKED";
  if (plan.capability === "recommendation_only") return "RESEARCH_REQUIRED";
  if (plan.effectiveMode === "human-required" || plan.effectiveMode === "manual-review") return "HUMAN_DECISION";
  return "READY_TO_PREPARE";
}

function pipelineSignal(health: RevenueBrainV2PipelineHealth | undefined) {
  if (!health) return 0;
  if (health.health === "CRITICAL") return 15;
  if (health.health === "AT_RISK") return 8;
  return 0;
}

function urgencySignal(hours: number) {
  if (hours <= 2) return 18;
  if (hours <= 8) return 13;
  if (hours <= 24) return 7;
  return 2;
}

export function buildRevenueBrainV2(input: RevenueBrainV2Input, limit = 25) {
  const plans = new Map(input.agenticPlans.map((plan) => [plan.missionId, plan]));
  const health = new Map(input.health.map((row) => [`${row.brandId}:${row.pipelineId}`, row]));
  const deduped = new Map<string, RevenueBrainV2Mission>();
  for (const mission of input.growthMissions) {
    const existing = deduped.get(mission.opportunityId);
    if (!existing || mission.priorityScore > existing.priorityScore) deduped.set(mission.opportunityId, mission);
  }

  const decisions = [...deduped.values()].map((mission) => {
    const plan = plans.get(mission.id);
    const pipeline = health.get(`${mission.brandId}:${mission.pipelineId}`);
    const readiness = readinessFor(plan);
    const focus = focusFor(mission);
    const blockers = [
      ...(!plan ? ["Ingen policyplan er knyttet til mission."] : []),
      ...(plan?.guardrailReason ? [plan.guardrailReason] : []),
      ...(pipeline?.unknownFreshness ? [`${pipeline.unknownFreshness} opportunities har ukjent datoferskhet.`] : []),
    ];
    const evidence = [
      `Mission-prioritet ${mission.priority} · ${mission.priorityScore}/100.`,
      ...(mission.expectedValue && mission.currency ? [`Synlig verdi: ${mission.currency} ${Math.round(mission.expectedValue).toLocaleString("nb-NO")}.`] : ["Kommersiell verdi er ikke dokumentert."]),
      ...(pipeline?.reasons || []),
      `Ønsket resultat: ${mission.desiredOutcome}`,
    ];
    const opportunityScore = clamp(
      mission.priorityScore * 0.55
      + urgencySignal(mission.dueInHours)
      + pipelineSignal(pipeline)
      + valueSignal(mission.expectedValue)
      + (focus === "CASH_NOW" ? 6 : 0)
    );
    const confidence = clamp(
      78
      + (plan ? 8 : -30)
      + (mission.expectedValue ? 6 : -5)
      - Math.min(20, Number(pipeline?.unknownFreshness || 0) * 4)
      - (input.warnings?.length ? 8 : 0)
    );
    return {
      missionId: mission.id,
      opportunityId: mission.opportunityId,
      brandId: mission.brandId,
      pipelineId: mission.pipelineId,
      stageId: mission.stageId,
      title: mission.title,
      focus,
      readiness,
      opportunityScore,
      confidence,
      priority: mission.priority,
      dueInHours: mission.dueInHours,
      expectedValue: mission.expectedValue,
      currency: mission.currency,
      nextAction: mission.nextAction,
      whyNow: mission.whyNow,
      desiredOutcome: mission.desiredOutcome,
      href: mission.href,
      policy: plan ? { capability: plan.capability, effectiveMode: plan.effectiveMode, externalSideEffectAllowed: false } : null,
      blockers,
      evidence,
      automaticExecutionAllowed: false as const,
    };
  }).sort((a, b) =>
    b.opportunityScore - a.opportunityScore
    || a.dueInHours - b.dueInHours
    || Number(b.expectedValue || 0) - Number(a.expectedValue || 0)
  ).slice(0, Math.max(1, Math.min(50, limit))).map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    generatedAt: input.generatedAt,
    mode: "READ_ONLY_V2" as const,
    headline: decisions[0]
      ? `Flytt først: ${decisions[0].title}`
      : "Ingen aktive opportunities er klare for prioritering.",
    decisions,
    summary: {
      considered: input.growthMissions.length,
      ranked: decisions.length,
      cashNow: decisions.filter((row) => row.focus === "CASH_NOW").length,
      pipelineNext: decisions.filter((row) => row.focus === "PIPELINE_NEXT").length,
      retention: decisions.filter((row) => row.focus === "RETENTION").length,
      demand: decisions.filter((row) => row.focus === "DEMAND").length,
      readyToPrepare: decisions.filter((row) => row.readiness === "READY_TO_PREPARE").length,
      humanDecision: decisions.filter((row) => row.readiness === "HUMAN_DECISION").length,
      representedValue: decisions.reduce((sum, row) => sum + Number(row.expectedValue || 0), 0),
    },
    warnings: input.warnings || [],
    safety: {
      readOnly: true,
      canonicalOpportunityStore: true,
      automaticExecution: false,
      automaticSending: false,
      automaticApproval: false,
      automaticPipelineChange: false,
      policyPlanAuthoritative: true,
    },
  };
}
