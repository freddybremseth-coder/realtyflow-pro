export type MultiBrandGrowthStage = "HOLD" | "FOUNDATION" | "PILOT" | "PROVE" | "SCALE";
export type MultiBrandFocus = "INTERVENE" | "ADVANCE" | "PROVE" | "MONITOR";

export type MultiBrandSignal = {
  brandId: string;
  brandName: string;
  kind: string;
  plannedChannels: string[];
  contentPillars: string[];
  active: boolean;
  growthStage: MultiBrandGrowthStage;
  connectedChannels: number;
  readySources: number;
  blockedSources: number;
  quarantined: number;
  actionableRules: number;
  leads: number;
  qualified: number;
  sales: number;
  commissionEur: number;
  attributionCoveragePercent: number;
};

export type MultiBrandRevenueSignal = {
  brandId: string;
  focus: "CASH_NOW" | "PIPELINE_NEXT" | "RETENTION" | "DEMAND";
  readiness: string;
  opportunityScore: number;
  expectedValue: number | null;
};

export type MultiBrandIntelligenceInput = {
  generatedAt: string;
  brands: MultiBrandSignal[];
  revenue: MultiBrandRevenueSignal[];
  warnings?: string[];
};

const stageRank: Record<MultiBrandGrowthStage, number> = {
  HOLD: 0,
  FOUNDATION: 1,
  PILOT: 2,
  PROVE: 3,
  SCALE: 4,
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function brandAction(signal: MultiBrandSignal, revenueCount: number, cashNow: number): { focus: MultiBrandFocus; action: string } {
  if (!signal.active || signal.growthStage === "HOLD" || signal.blockedSources > 0 || signal.quarantined > 0) {
    return { focus: "INTERVENE", action: "Løs dokumenterte brand-, kilde- eller datakvalitetsblokkere før ny skalering." };
  }
  if (cashNow > 0) {
    return { focus: "ADVANCE", action: "Prioriter brandets aggregerte cash-now-kø i Revenue Brain; behold eksisterende approval-policy." };
  }
  if (signal.growthStage === "PILOT" || signal.growthStage === "PROVE") {
    return { focus: "PROVE", action: "Bygg mer kanonisk outcome-evidens før brandet flyttes til neste skaleringstrinn." };
  }
  if (revenueCount > 0) {
    return { focus: "ADVANCE", action: "Arbeid den aggregerte opportunity-køen uten å endre brandets execution boundary." };
  }
  return { focus: "MONITOR", action: "Overvåk canonical attribution og opprett ingen aktivitet uten dokumentert opportunity." };
}

export function buildMultiBrandIntelligence(input: MultiBrandIntelligenceInput) {
  const knownBrands = new Set(input.brands.map((brand) => brand.brandId));
  const ignoredRevenueSignals = input.revenue.filter((row) => !knownBrands.has(row.brandId)).length;

  const brands = input.brands.map((signal) => {
    const revenue = input.revenue.filter((row) => row.brandId === signal.brandId);
    const cashNow = revenue.filter((row) => row.focus === "CASH_NOW").length;
    const highestOpportunityScore = revenue.reduce((max, row) => Math.max(max, row.opportunityScore), 0);
    const representedValue = revenue.reduce((sum, row) => sum + Number(row.expectedValue || 0), 0);
    const portfolioScore = clamp(
      stageRank[signal.growthStage] * 14
      + Math.min(18, signal.sales * 8 + signal.qualified * 3 + signal.leads)
      + signal.attributionCoveragePercent * 0.16
      + Math.min(10, signal.actionableRules * 2)
      - signal.blockedSources * 5
      - signal.quarantined * 12
    );
    const attentionScore = clamp(
      highestOpportunityScore * 0.5
      + (cashNow > 0 ? 22 : 0)
      + (signal.growthStage === "HOLD" ? 18 : 0)
      + Math.min(18, signal.blockedSources * 6 + signal.quarantined * 10)
      + (signal.attributionCoveragePercent < 60 ? 10 : 0)
    );
    const next = brandAction(signal, revenue.length, cashNow);
    return {
      brandId: signal.brandId,
      brandName: signal.brandName,
      kind: signal.kind,
      growthStage: signal.growthStage,
      focus: next.focus,
      portfolioScore,
      attentionScore,
      nextAction: next.action,
      channels: { connected: signal.connectedChannels, planned: signal.plannedChannels.length },
      sourceHealth: { ready: signal.readySources, blocked: signal.blockedSources, quarantined: signal.quarantined },
      outcomes: {
        leads: signal.leads,
        qualified: signal.qualified,
        sales: signal.sales,
        commissionEur: signal.commissionEur,
        attributionCoveragePercent: signal.attributionCoveragePercent,
      },
      revenue: {
        opportunities: revenue.length,
        cashNow,
        representedValue,
        highestOpportunityScore,
      },
      learning: { actionableRules: signal.actionableRules },
      evidence: [
        `Growth stage ${signal.growthStage}; ${signal.connectedChannels}/${signal.plannedChannels.length} planned channels connected.`,
        `Canonical outcomes: ${signal.leads} leads, ${signal.qualified} qualified, ${signal.sales} sales; ${signal.attributionCoveragePercent}% coverage.`,
        `Aggregate Revenue Brain: ${revenue.length} opportunities, ${cashNow} cash-now; score max ${highestOpportunityScore}.`,
      ],
    };
  }).sort((a, b) => b.attentionScore - a.attentionScore || a.brandName.localeCompare(b.brandName));

  const transferReviews: Array<{
    sourceBrandId: string;
    targetBrandId: string;
    type: "AGGREGATE_PATTERN_REVIEW";
    reason: string;
    sharedChannels: string[];
    requiresHumanReview: true;
    automaticTransferAllowed: false;
    evidenceScope: "BRAND_AGGREGATE_ONLY";
  }> = [];

  for (const source of input.brands) {
    if (source.actionableRules < 2 || stageRank[source.growthStage] < 3) continue;
    for (const target of input.brands) {
      if (source.brandId === target.brandId || source.kind !== target.kind) continue;
      if (stageRank[source.growthStage] <= stageRank[target.growthStage]) continue;
      const sharedChannels = source.plannedChannels.filter((channel) => target.plannedChannels.includes(channel));
      const sharedPillars = source.contentPillars.filter((pillar) => target.contentPillars.includes(pillar));
      if (!sharedChannels.length || !sharedPillars.length) continue;
      transferReviews.push({
        sourceBrandId: source.brandId,
        targetBrandId: target.brandId,
        type: "AGGREGATE_PATTERN_REVIEW",
        reason: `Vurder om en aggregert ${sharedPillars[0]}-hypotese kan testes separat for target-brandet.`,
        sharedChannels,
        requiresHumanReview: true,
        automaticTransferAllowed: false,
        evidenceScope: "BRAND_AGGREGATE_ONLY",
      });
    }
  }

  return {
    generatedAt: input.generatedAt,
    mode: "READ_ONLY_PORTFOLIO_INTELLIGENCE" as const,
    headline: brands[0] ? `Porteføljefokus: ${brands[0].brandName}` : "Ingen registrerte brands.",
    brands,
    transferReviews: transferReviews.slice(0, 12),
    summary: {
      brands: brands.length,
      intervene: brands.filter((row) => row.focus === "INTERVENE").length,
      advance: brands.filter((row) => row.focus === "ADVANCE").length,
      prove: brands.filter((row) => row.focus === "PROVE").length,
      monitor: brands.filter((row) => row.focus === "MONITOR").length,
      canonicalLeads: brands.reduce((sum, row) => sum + row.outcomes.leads, 0),
      canonicalSales: brands.reduce((sum, row) => sum + row.outcomes.sales, 0),
      representedValue: brands.reduce((sum, row) => sum + row.revenue.representedValue, 0),
      ignoredRevenueSignals,
    },
    warnings: [
      ...(input.warnings || []),
      ...(ignoredRevenueSignals ? [`${ignoredRevenueSignals} Revenue Brain-signaler ble ignorert fordi brandet ikke finnes i canonical registry.`] : []),
    ],
    safety: {
      readOnly: true,
      brandScopedIdentity: true,
      aggregateOnlyAcrossBrands: true,
      customerDataSharedAcrossBrands: false,
      automaticLearningTransfer: false,
      automaticExecution: false,
      humanReviewRequiredForTransfer: true,
    },
  };
}
