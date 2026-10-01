/**
 * Marketing Growth OS — Phase 5: Learning Engine.
 *
 * Lukker lærings-sløyfen: hva SLAGS innhold gir kunder? Vi aggregerer
 * content-observasjoner (genome × canonical business-verdi fra attribution)
 * til læringsregler per genome-dimensjon, med LIFT mot baseline og
 * EVIDENCELEVEL basert på utvalgsstørrelse. Content-agentene henter reglene
 * FØR de genererer (recommendGenome), så systemet dobler ned på det som
 * faktisk konverterer — ikke på vanity-metrics.
 */

import type { ContentGenome } from "./genome";
import {
  businessValueScore,
  evidenceLevel,
  qualifiedLeadRate,
  type ContentMetrics,
} from "./value-score";

export interface LearningObservation {
  genome: ContentGenome;
  metrics: ContentMetrics;
  contentId?: string | null;
  source?: "observational" | "experiment";
  evidenceFirstAt?: string | null;
  evidenceLastAt?: string | null;
}

export const LEARNING_DIMENSIONS = [
  "channel",
  "format",
  "hookType",
  "ctaType",
  "goal",
  "contentPillar",
  "topic",
  "area",
  "propertyType",
  "priceBand",
  "audience",
  "creativeStyle",
  "language",
  "publishHour",
  "publishWeekday",
  "publishDaypart",
  "headlineLengthBand",
  "headlineShape",
  "imageClass",
  /** Exact observed combination used for outcome-aware exploit recipes. */
  "recipe",
  /** Each published hashtag is evaluated individually. */
  "tag",
] as const;
export type LearningDimension = (typeof LEARNING_DIMENSIONS)[number];

export type LearningVerdict = "favor" | "avoid" | "neutral";

export const OUTCOME_TIERS = ["none", "reach", "traffic", "lead", "qualified_pipeline", "sale"] as const;
export type OutcomeTier = (typeof OUTCOME_TIERS)[number];

export function outcomeTierRank(tier: OutcomeTier | null | undefined): number {
  return tier ? OUTCOME_TIERS.indexOf(tier) : 0;
}

export function classifyOutcomeTier(metrics: ContentMetrics): OutcomeTier {
  if (n(metrics.sales) > 0 || n(metrics.commissionEur) > 0) return "sale";
  if (n(metrics.qualifiedLeads) > 0 || n(metrics.viewings) > 0 || n(metrics.offers) > 0) return "qualified_pipeline";
  if (n(metrics.leads) > 0) return "lead";
  if (n(metrics.clicks) > 0) return "traffic";
  if (Math.max(n(metrics.views), n(metrics.impressions), n(metrics.engagedViews)) > 0) return "reach";
  return "none";
}

export interface LearningRule {
  ruleKey: string;
  scope: string;
  dimension: LearningDimension;
  value: string;
  sample: number;
  avgBusinessValue: number;
  avgQualifiedLeadRate: number;
  totalLeads: number;
  totalQualified: number;
  totalViewings?: number;
  totalOffers?: number;
  totalSales: number;
  totalCommissionEur: number;
  totalClicks?: number;
  totalExposure?: number;
  outcomeTier?: OutcomeTier;
  lift: number;
  evidence: ReturnType<typeof evidenceLevel>;
  verdict: LearningVerdict;
  finding: string;
  evidenceFirstAt?: string | null;
  evidenceLastAt?: string | null;
  experimentBacked?: boolean;
  experimentLift?: number;
}

export interface ExperimentEvidence {
  scope: string;
  dimension: LearningDimension;
  value: string;
  normalizedLift: number;
  evidence: ReturnType<typeof evidenceLevel>;
  experimentId: string;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const CONTENT_RECIPE_FIELDS = [
  "channel",
  "format",
  "hookType",
  "ctaType",
  "contentPillar",
  "topic",
  "area",
  "propertyType",
] as const;

export type ContentRecipeField = (typeof CONTENT_RECIPE_FIELDS)[number];

export function contentRecipeValue(genome: ContentGenome): string | undefined {
  const params = new URLSearchParams();
  for (const field of CONTENT_RECIPE_FIELDS) {
    const value = genome[field];
    if (typeof value === "string" && value.trim()) params.set(field, value.trim());
  }
  return Array.from(params.keys()).length >= 3 ? params.toString() : undefined;
}

export function parseContentRecipe(value: string | null | undefined): Partial<ContentGenome> | null {
  if (!value) return null;
  try {
    const params = new URLSearchParams(value);
    const recipe: Partial<ContentGenome> = {};
    for (const field of CONTENT_RECIPE_FIELDS) {
      const fieldValue = params.get(field);
      if (fieldValue) (recipe as Record<string, string>)[field] = fieldValue;
    }
    return Object.keys(recipe).length >= 3 ? recipe : null;
  } catch {
    return null;
  }
}

/** Scalar genome dimensions used by the Experiment Engine. `tag` is multi-value
 * / `recipe` are multi-field dimensions and therefore intentionally return undefined here; controlled hashtag tests
 * should pass explicit experiment evidence instead of pretending one tag is the
 * whole genome value. */
export function genomeDimensionValue(g: ContentGenome, dim: LearningDimension): string | undefined {
  if (dim === "tag" || dim === "recipe") return undefined;
  const v = (g as unknown as Record<string, unknown>)[dim];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function dimensionValues(g: ContentGenome, dim: LearningDimension): string[] {
  if (dim === "tag") return Array.isArray(g.tags) ? Array.from(new Set(g.tags.filter(Boolean))) : [];
  if (dim === "recipe") {
    const recipe = contentRecipeValue(g);
    return recipe ? [recipe] : [];
  }
  const value = genomeDimensionValue(g, dim);
  return value ? [value] : [];
}

export function baselineBusinessValue(obs: LearningObservation[]): number {
  if (obs.length === 0) return 0;
  const sum = obs.reduce((a, o) => a + businessValueScore(o.metrics), 0);
  return sum / obs.length;
}

export interface DeriveOptions {
  scope?: string;
  minSample?: number;
  favorLift?: number;
  avoidLift?: number;
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function observationEvidenceWindow(group: LearningObservation[]): { firstAt: string | null; lastAt: string | null } {
  const first = group
    .map((observation) => validIso(observation.evidenceFirstAt ?? observation.evidenceLastAt))
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const last = group
    .map((observation) => validIso(observation.evidenceLastAt ?? observation.evidenceFirstAt))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  return { firstAt: first, lastAt: last };
}

/**
 * Hashtags are noisier than most scalar genome dimensions and may co-occur with
 * several other tags. Require at least 10 observations before a tag can become
 * actionable, even though other dimensions keep the default five-observation
 * floor. Timing/image rules also require a little more evidence to reduce false
 * winners caused by one unusually strong listing.
 */
function actionableMinSample(dimension: LearningDimension, defaultMinSample: number): number {
  if (dimension === "tag" || dimension === "recipe") return Math.max(10, defaultMinSample);
  if (["publishHour", "publishWeekday", "publishDaypart", "imageClass"].includes(dimension)) {
    return Math.max(8, defaultMinSample);
  }
  return defaultMinSample;
}

export function deriveLearningRules(obs: LearningObservation[], opts: DeriveOptions = {}): LearningRule[] {
  const scope = opts.scope ?? "global";
  const minSample = opts.minSample ?? 5;
  const favorLift = opts.favorLift ?? 1.2;
  const avoidLift = opts.avoidLift ?? 0.6;
  const baseline = baselineBusinessValue(obs);

  const rules: LearningRule[] = [];
  for (const dimension of LEARNING_DIMENSIONS) {
    const groups = new Map<string, LearningObservation[]>();
    for (const o of obs) {
      for (const value of dimensionValues(o.genome, dimension)) {
        (groups.get(value) ?? groups.set(value, []).get(value)!).push(o);
      }
    }
    for (const [value, group] of groups) {
      const sample = group.length;
      const avgBv = group.reduce((a, o) => a + businessValueScore(o.metrics), 0) / sample;
      const avgQlr = group.reduce((a, o) => a + qualifiedLeadRate(o.metrics), 0) / sample;
      const totalLeads = group.reduce((a, o) => a + n(o.metrics.leads), 0);
      const totalQualified = group.reduce((a, o) => a + n(o.metrics.qualifiedLeads), 0);
      const totalViewings = group.reduce((a, o) => a + n(o.metrics.viewings), 0);
      const totalOffers = group.reduce((a, o) => a + n(o.metrics.offers), 0);
      const totalSales = group.reduce((a, o) => a + n(o.metrics.sales), 0);
      const totalCommission = group.reduce((a, o) => a + n(o.metrics.commissionEur), 0);
      const totalClicks = group.reduce((a, o) => a + n(o.metrics.clicks), 0);
      const totalExposure = group.reduce((a, o) => a + Math.max(n(o.metrics.views), n(o.metrics.impressions)), 0);
      const outcomeTier = classifyOutcomeTier({
        clicks: totalClicks,
        leads: totalLeads,
        qualifiedLeads: totalQualified,
        viewings: totalViewings,
        offers: totalOffers,
        sales: totalSales,
        commissionEur: totalCommission,
        impressions: totalExposure,
      });
      const lift = baseline > 0 ? Number((avgBv / baseline).toFixed(2)) : 0;
      const evidence = evidenceLevel(sample);
      const evidenceWindow = observationEvidenceWindow(group);
      const enough = sample >= actionableMinSample(dimension, minSample) && evidence !== "insufficient";
      const verdict: LearningVerdict = !enough ? "neutral" : lift >= favorLift ? "favor" : lift <= avoidLift ? "avoid" : "neutral";
      rules.push({
        ruleKey: `${scope}|${dimension}|${value}`,
        scope,
        dimension,
        value,
        sample,
        avgBusinessValue: Math.round(avgBv),
        avgQualifiedLeadRate: Number(avgQlr.toFixed(2)),
        totalLeads,
        totalQualified,
        totalViewings,
        totalOffers,
        totalSales,
        totalCommissionEur: Math.round(totalCommission),
        totalClicks,
        totalExposure,
        outcomeTier,
        lift,
        evidence,
        verdict,
        finding: buildFinding(dimension, value, lift, sample, verdict, evidence, totalSales),
        evidenceFirstAt: evidenceWindow.firstAt,
        evidenceLastAt: evidenceWindow.lastAt,
      });
    }
  }
  const evidenceRank: Record<string, number> = { insufficient: 0, directional: 1, promising: 2, reliable: 3, strong: 4 };
  return rules.sort((a, b) => evidenceRank[b.evidence] - evidenceRank[a.evidence] || b.lift - a.lift);
}

function buildFinding(
  dimension: LearningDimension,
  value: string,
  lift: number,
  sample: number,
  verdict: LearningVerdict,
  evidence: LearningRule["evidence"],
  sales: number,
): string {
  const dir = lift >= 1 ? `${lift.toFixed(2)}× baseline` : `${lift.toFixed(2)}× (under baseline)`;
  const label = dimension === "tag" ? `#${value}` : dimension === "recipe" ? `recipe=${decodeURIComponent(value).slice(0, 180)}` : `${dimension}=${value}`;
  const base = `${label}: ${dir} forretningsverdi over ${sample} innhold (${evidence}${sales ? `, ${sales} salg` : ""})`;
  if (verdict === "favor") return `✅ Doble ned — ${base}`;
  if (verdict === "avoid") return `⛔ Nedprioritér — ${base}`;
  return `◽ Følg med — ${base}`;
}

export function applyExperimentEvidence(
  rules: LearningRule[],
  evidence: ExperimentEvidence[],
  opts: { favorLift?: number; avoidLift?: number } = {},
): LearningRule[] {
  const favorLift = opts.favorLift ?? 1.2;
  const avoidLift = opts.avoidLift ?? 0.6;
  const byKey = new Map(rules.map((r) => [r.ruleKey, { ...r }]));
  for (const ev of evidence) {
    const ruleKey = `${ev.scope}|${ev.dimension}|${ev.value}`;
    let rule = byKey.get(ruleKey);
    if (!rule) {
      rule = {
        ruleKey, scope: ev.scope, dimension: ev.dimension, value: ev.value,
        sample: 0, avgBusinessValue: 0, avgQualifiedLeadRate: 0,
        totalLeads: 0, totalQualified: 0, totalViewings: 0, totalOffers: 0,
        totalSales: 0, totalCommissionEur: 0, totalClicks: 0, totalExposure: 0, outcomeTier: "none",
        lift: 0, evidence: ev.evidence, verdict: "neutral", finding: "",
      };
      byKey.set(ruleKey, rule);
    }
    rule.experimentBacked = true;
    rule.experimentLift = ev.normalizedLift;
    if (ev.normalizedLift >= favorLift) rule.verdict = "favor";
    else if (ev.normalizedLift <= avoidLift) rule.verdict = "avoid";
    rule.finding = `🧪 Eksperiment (${ev.evidence}): ${ev.dimension}=${ev.value} ${ev.normalizedLift.toFixed(2)}× kontroll (per observasjon) — exp ${ev.experimentId}`;
  }
  return Array.from(byKey.values());
}

export interface GenomeRecommendation {
  favor: Partial<Record<LearningDimension, { value: string; lift: number; evidence: string; outcomeTier?: OutcomeTier; experimentBacked?: boolean }>>;
  avoid: Array<{ dimension: LearningDimension; value: string; lift: number }>;
  notes: string[];
}

export const LEARNING_FRESHNESS_DECAY = {
  fullWeightDays: 14,
  recentWeightDays: 30,
  maxActionableDays: 60,
  recentWeight: 0.85,
  agingWeight: 0.6,
} as const;

export function learningEvidenceAgeDays(
  rule: Pick<LearningRule, "evidenceLastAt">,
  now = new Date(),
): number | null {
  if (!rule.evidenceLastAt) return null;
  const evidenceMs = Date.parse(rule.evidenceLastAt);
  if (!Number.isFinite(evidenceMs)) return null;
  return Math.max(0, Math.floor((now.getTime() - evidenceMs) / 86_400_000));
}

export function learningFreshnessWeight(
  rule: Pick<LearningRule, "evidenceLastAt" | "experimentBacked">,
  now = new Date(),
): number {
  if (rule.experimentBacked) return 1;
  const ageDays = learningEvidenceAgeDays(rule, now);
  // Migration grace: legacy rows without evidence timestamps retain their
  // current weight until the normal learning refresh populates evidenceLastAt.
  if (ageDays == null) return 1;
  if (ageDays <= LEARNING_FRESHNESS_DECAY.fullWeightDays) return 1;
  if (ageDays <= LEARNING_FRESHNESS_DECAY.recentWeightDays) return LEARNING_FRESHNESS_DECAY.recentWeight;
  if (ageDays <= LEARNING_FRESHNESS_DECAY.maxActionableDays) return LEARNING_FRESHNESS_DECAY.agingWeight;
  return 0;
}

export function recommendGenome(
  rules: LearningRule[],
  filter?: { dimensions?: LearningDimension[]; now?: Date },
): GenomeRecommendation {
  const dims = filter?.dimensions ?? LEARNING_DIMENSIONS;
  const now = filter?.now ?? new Date();
  const favor: GenomeRecommendation["favor"] = {};
  const avoid: GenomeRecommendation["avoid"] = [];
  const notes: string[] = [];
  let staleIgnored = 0;

  for (const dim of dims) {
    const weighted = rules
      .filter((rule) => rule.dimension === dim)
      .map((rule) => ({ rule, freshnessWeight: learningFreshnessWeight(rule, now) }));

    staleIgnored += weighted.filter(({ rule, freshnessWeight }) =>
      freshnessWeight === 0
      && !rule.experimentBacked
      && (rule.verdict === "favor" || rule.verdict === "avoid"),
    ).length;

    const favored = weighted
      .filter(({ rule, freshnessWeight }) => rule.verdict === "favor" && freshnessWeight > 0)
      .sort((a, b) =>
        Number(!!b.rule.experimentBacked) - Number(!!a.rule.experimentBacked)
        || outcomeTierRank(b.rule.outcomeTier) - outcomeTierRank(a.rule.outcomeTier)
        || (b.rule.lift * b.freshnessWeight) - (a.rule.lift * a.freshnessWeight)
        || b.rule.lift - a.rule.lift,
      )[0];

    if (favored) {
      favor[dim] = {
        value: favored.rule.value,
        lift: favored.rule.lift,
        evidence: favored.rule.evidence,
        outcomeTier: favored.rule.outcomeTier,
        experimentBacked: favored.rule.experimentBacked,
      };
      notes.push(
        favored.freshnessWeight < 1
          ? `${favored.rule.finding} · ferskhetsvekt ${favored.freshnessWeight.toFixed(2)}`
          : favored.rule.finding,
      );
    }

    const avoided = weighted
      .filter(({ rule, freshnessWeight }) => rule.verdict === "avoid" && freshnessWeight > 0)
      .sort((a, b) =>
        ((1 - b.rule.lift) * b.freshnessWeight) - ((1 - a.rule.lift) * a.freshnessWeight),
      );
    for (const { rule } of avoided) {
      avoid.push({ dimension: dim, value: rule.value, lift: rule.lift });
    }
  }

  if (staleIgnored > 0) {
    notes.push(`${staleIgnored} eldre observasjonelle læringsregler (> ${LEARNING_FRESHNESS_DECAY.maxActionableDays} dager) holdes ute til ny evidens kommer.`);
  }
  if (Object.keys(favor).length === 0) {
    notes.push("Ikke nok evidens som er fersk nok — generér variert og la systemet lære.");
  }
  return { favor, avoid, notes };
}
