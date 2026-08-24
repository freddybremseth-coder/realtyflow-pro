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
  /** Each published hashtag is evaluated individually. */
  "tag",
] as const;
export type LearningDimension = (typeof LEARNING_DIMENSIONS)[number];

export type LearningVerdict = "favor" | "avoid" | "neutral";

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
  totalSales: number;
  totalCommissionEur: number;
  lift: number;
  evidence: ReturnType<typeof evidenceLevel>;
  verdict: LearningVerdict;
  finding: string;
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

/** Scalar genome dimensions used by the Experiment Engine. `tag` is multi-value
 * and therefore intentionally returns undefined here; controlled hashtag tests
 * should pass explicit experiment evidence instead of pretending one tag is the
 * whole genome value. */
export function genomeDimensionValue(g: ContentGenome, dim: LearningDimension): string | undefined {
  if (dim === "tag") return undefined;
  const v = (g as unknown as Record<string, unknown>)[dim];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function dimensionValues(g: ContentGenome, dim: LearningDimension): string[] {
  if (dim === "tag") return Array.isArray(g.tags) ? Array.from(new Set(g.tags.filter(Boolean))) : [];
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

/**
 * Hashtags are noisier than most scalar genome dimensions and may co-occur with
 * several other tags. Require at least 10 observations before a tag can become
 * actionable, even though other dimensions keep the default five-observation
 * floor. This prevents early hashtag overfitting and stuffing.
 */
function actionableMinSample(dimension: LearningDimension, defaultMinSample: number): number {
  return dimension === "tag" ? Math.max(10, defaultMinSample) : defaultMinSample;
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
      const totalSales = group.reduce((a, o) => a + n(o.metrics.sales), 0);
      const totalCommission = group.reduce((a, o) => a + n(o.metrics.commissionEur), 0);
      const lift = baseline > 0 ? Number((avgBv / baseline).toFixed(2)) : 0;
      const evidence = evidenceLevel(sample);
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
        totalSales,
        totalCommissionEur: Math.round(totalCommission),
        lift,
        evidence,
        verdict,
        finding: buildFinding(dimension, value, lift, sample, verdict, evidence, totalSales),
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
  const label = dimension === "tag" ? `#${value}` : `${dimension}=${value}`;
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
        totalLeads: 0, totalQualified: 0, totalSales: 0, totalCommissionEur: 0,
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
  favor: Partial<Record<LearningDimension, { value: string; lift: number; evidence: string; experimentBacked?: boolean }>>;
  avoid: Array<{ dimension: LearningDimension; value: string; lift: number }>;
  notes: string[];
}

export function recommendGenome(
  rules: LearningRule[],
  filter?: { dimensions?: LearningDimension[] },
): GenomeRecommendation {
  const dims = filter?.dimensions ?? LEARNING_DIMENSIONS;
  const favor: GenomeRecommendation["favor"] = {};
  const avoid: GenomeRecommendation["avoid"] = [];
  const notes: string[] = [];

  for (const dim of dims) {
    const inDim = rules.filter((r) => r.dimension === dim);
    const favored = inDim
      .filter((r) => r.verdict === "favor")
      .sort((a, b) => Number(!!b.experimentBacked) - Number(!!a.experimentBacked) || b.lift - a.lift)[0];
    if (favored) {
      favor[dim] = { value: favored.value, lift: favored.lift, evidence: favored.evidence, experimentBacked: favored.experimentBacked };
      notes.push(favored.finding);
    }
    for (const r of inDim.filter((r) => r.verdict === "avoid")) {
      avoid.push({ dimension: dim, value: r.value, lift: r.lift });
    }
  }
  if (Object.keys(favor).length === 0) notes.push("Ikke nok evidens ennå — generér variert og la systemet lære.");
  return { favor, avoid, notes };
}
