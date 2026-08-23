/**
 * Marketing Growth OS — Phase 5: Learning Engine.
 *
 * Lukker lærings-sløyfen: hva SLAGS innhold gir kunder? Vi aggregerer
 * content-observasjoner (genome × canonical business-verdi fra attribution)
 * til læringsregler per genome-dimensjon, med LIFT mot baseline og
 * EVIDENCELEVEL basert på utvalgsstørrelse. Content-agentene henter reglene
 * FØR de genererer (recommendGenome), så systemet dobler ned på det som
 * faktisk konverterer — ikke på vanity-metrics.
 *
 * Ren logikk (DI/byggetrygg). Persistens ligger i adapteret.
 */

import type { ContentGenome } from "./genome";
import {
  businessValueScore,
  evidenceLevel,
  qualifiedLeadRate,
  type ContentMetrics,
} from "./value-score";

/** Én observasjon = ett innhold med sin genome + canonical business-metrics. */
export interface LearningObservation {
  genome: ContentGenome;
  /** Canonical outcomes (fra attribution), ikke observed vanity-metrics. */
  metrics: ContentMetrics;
  contentId?: string | null;
  /** Kilde: observasjonell content vs eksperiment-bevis (default observational). */
  source?: "observational" | "experiment";
}

/**
 * Genome-dimensjonene vi lærer på. Marginal analyse per dimensjon er mer
 * handlingsrettet enn full signatur ("hook=price_first løfter 2.1×" > "hele
 * kombinasjonen X løfter"). Rekkefølge = prioritet i anbefalinger.
 */
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
] as const;
export type LearningDimension = (typeof LEARNING_DIMENSIONS)[number];

export type LearningVerdict = "favor" | "avoid" | "neutral";

export interface LearningRule {
  /** Stabil nøkkel: scope|dimension|value — idempotent upsert. */
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
  /** avgBusinessValue for gruppen / baseline (1.0 = som snittet). */
  lift: number;
  evidence: ReturnType<typeof evidenceLevel>;
  verdict: LearningVerdict;
  finding: string;
  /** Bekreftet av en kontrollert A/B-test (høyere troverdighet enn observasjonell). */
  experimentBacked?: boolean;
  /** Normalisert løft fra eksperimentet (per-observasjon), hvis testet. */
  experimentLift?: number;
}

/**
 * Eksperiment-bevis om én dimensjon-verdi — matet fra Experiment Engine.
 * IKKE revenue-metrics (unngår dobbelttelling); kun en troverdighets-oppgradering
 * + normalisert løft for den testede dimensjonen.
 */
export interface ExperimentEvidence {
  scope: string;
  dimension: LearningDimension;
  value: string;
  normalizedLift: number;
  evidence: ReturnType<typeof evidenceLevel>;
  experimentId: string;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Verdien av en genome-dimensjon (string), eller undefined. Delt med Experiment Engine. */
export function genomeDimensionValue(g: ContentGenome, dim: LearningDimension): string | undefined {
  const v = (g as unknown as Record<string, unknown>)[dim];
  return typeof v === "string" && v.trim() ? v : undefined;
}
const dimValue = genomeDimensionValue;

/** Baseline = snitt business value per observasjon (samme populasjon reglene måles mot). */
export function baselineBusinessValue(obs: LearningObservation[]): number {
  if (obs.length === 0) return 0;
  const sum = obs.reduce((a, o) => a + businessValueScore(o.metrics), 0);
  return sum / obs.length;
}

export interface DeriveOptions {
  scope?: string;
  /** Minste utvalg for at en regel skal få verdict favor/avoid (ikke overtilpass). */
  minSample?: number;
  favorLift?: number;
  avoidLift?: number;
}

/**
 * Utled læringsregler: for hver genome-dimensjon, grupper observasjoner på
 * verdi og mål lift mot baseline. Regler under minSample forblir "neutral"
 * (retningsgivende men ikke handlingsutløsende) — brukerens råd: ikke
 * optimalisér for tidlig.
 */
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
      const val = dimValue(o.genome, dimension);
      if (!val) continue;
      (groups.get(val) ?? groups.set(val, []).get(val)!).push(o);
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
      const enough = sample >= minSample && evidence !== "insufficient";
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
  // Sterkest evidens + høyest lift først.
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
  const base = `${dimension}=${value}: ${dir} forretningsverdi over ${sample} innhold (${evidence}${sales ? `, ${sales} salg` : ""})`;
  if (verdict === "favor") return `✅ Doble ned — ${base}`;
  if (verdict === "avoid") return `⛔ Nedprioritér — ${base}`;
  return `◽ Følg med — ${base}`;
}

/**
 * Slå eksperiment-bevis inn i regelsettet. Eksperiment-bevis oppgraderer
 * TROVERDIGHET (verdict + experimentBacked-flagg + normalisert løft) for en
 * dimensjon-verdi, men rører ALDRI revenue-totaler — så samme underliggende
 * performance telles aldri to ganger. En kontrollert vinner (reliable+) kan løfte
 * en regel til "favor" selv om den observasjonelle samplen er tynn; en klar taper
 * kan sette "avoid". Returnerer et nytt regelsett.
 */
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
      // Ingen observasjonell regel ennå — opprett en ren eksperiment-regel (uten revenue-totaler).
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
    // Troverdighets-oppgradering basert på det kontrollerte løftet.
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

/**
 * Det content-agentene kaller FØR generering: gitt læringsreglene (evt. filtrert
 * på kanal), returnér beste verdi per dimensjon + hva som bør unngås. Kun
 * regler med handlingsutløsende verdict teller — ingen gjetting på tynt grunnlag.
 */
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
    // Eksperiment-bekreftede regler foretrekkes foran rent observasjonelle.
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
