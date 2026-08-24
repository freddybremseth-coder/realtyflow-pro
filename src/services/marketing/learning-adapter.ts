/**
 * Phase 5 — Learning Engine-adapter (bak DI, byggetrygg).
 *
 * refreshLearningRules: par sammen content-genomes (marketing_content) med
 * observed metrics (marketing_events) + canonical outcomes (attribution),
 * utled læringsregler og persistér dem idempotent i marketing_learning_rules.
 * loadLearningRules / recommendForGeneration: det content-agentene henter FØR
 * de lager nytt innhold.
 */

import { combineMetrics } from "@/lib/marketing/analytics";
import {
  applyExperimentEvidence,
  deriveLearningRules,
  recommendGenome,
  type LearningObservation,
  type LearningRule,
  type GenomeRecommendation,
} from "@/lib/marketing/learning";
import { loadExperimentEvidence } from "@/services/marketing/experiment-adapter";
import type { ContentGenome } from "@/lib/marketing/genome";
import type { ContentMetrics } from "@/lib/marketing/value-score";
import { attributeAll } from "@/services/marketing/attribution-adapter";
import type { AttributionModel } from "@/lib/marketing/attribution";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

interface ObservedMetricRow {
  metrics?: ContentMetrics | null;
  eventType?: string | null;
  metadata?: Record<string, unknown> | null;
}

function learningEligible(row: ObservedMetricRow): boolean {
  if (row.eventType !== "metrics_snapshot") return true;
  return row.metadata?.learning_eligible !== false;
}

function sumObserved(rows: ObservedMetricRow[]): ContentMetrics {
  const acc: ContentMetrics = {};
  const add = (k: keyof ContentMetrics, v: unknown) => {
    (acc as Record<string, number>)[k] = num(acc[k]) + num(v);
  };
  for (const r of rows) {
    if (!learningEligible(r)) continue;
    const m = r.metrics ?? {};
    add("views", m.views);
    add("engagedViews", m.engagedViews);
    add("saves", m.saves);
    add("shares", m.shares);
    add("clicks", m.clicks);
  }
  return acc;
}

export async function refreshLearningRules(
  supabase: MarketingSupabaseLike,
  opts: { brandId: string; scope?: string; model?: AttributionModel },
): Promise<{ rulesWritten: number; observations: number }> {
  if (!opts.brandId?.trim()) throw new Error("LEARNING_BRAND_REQUIRED: brandId mangler");
  const scope = opts.scope ?? opts.brandId;

  // 1) Genomes per content — always brand-scoped.
  const { data: contentRows } = await supabase
    .from("marketing_content")
    .select("content_id, brand_id, genome")
    .eq("brand_id", opts.brandId);
  const genomes = new Map<string, ContentGenome>();
  for (const r of contentRows ?? []) {
    if (r.content_id && r.genome) genomes.set(String(r.content_id), r.genome as ContentGenome);
  }

  // 2) Observed metrics per content — always brand-scoped.
  const { data: evRows } = await supabase
    .from("marketing_events")
    .select("content_id, metrics, event_type, metadata")
    .eq("brand_id", opts.brandId);
  const observedByContent = new Map<string, ObservedMetricRow[]>();
  for (const r of evRows ?? []) {
    if (!r.content_id) continue;
    const key = String(r.content_id);
    (observedByContent.get(key) ?? observedByContent.set(key, []).get(key)!).push({
      metrics: r.metrics ?? null,
      eventType: r.event_type ? String(r.event_type) : null,
      metadata: r.metadata && typeof r.metadata === "object" ? r.metadata as Record<string, unknown> : null,
    });
  }

  // 3) Canonical outcomes per content — brand-isolated attribution.
  const canonical = await attributeAll(supabase, { model: opts.model ?? "last_touch", brandId: opts.brandId });

  // 4) Par sammen til observasjoner. combineMetrics: canonical vinner.
  const observations: LearningObservation[] = [];
  for (const [contentId, genome] of genomes) {
    const observed = sumObserved(observedByContent.get(contentId) ?? []);
    const biz = canonical.get(contentId);
    const canonicalMetrics: Partial<ContentMetrics> | undefined = biz
      ? { leads: biz.leads, qualifiedLeads: biz.qualifiedLeads, viewings: biz.viewings, offers: biz.offers, sales: biz.sales, commissionEur: biz.commissionEur }
      : undefined;
    const metrics = combineMetrics({ observed: [observed], canonical: canonicalMetrics });
    observations.push({ genome, metrics, contentId });
  }

  // 5) Utled + persistér idempotent.
  const rules = deriveLearningRules(observations, { scope });
  if (rules.length > 0) {
    const rows = rules.map((r) => ({
      rule_key: r.ruleKey,
      scope: r.scope,
      dimension: r.dimension,
      value: r.value,
      sample: r.sample,
      avg_business_value: r.avgBusinessValue,
      avg_qualified_lead_rate: r.avgQualifiedLeadRate,
      total_leads: r.totalLeads,
      total_qualified: r.totalQualified,
      total_sales: r.totalSales,
      total_commission_eur: r.totalCommissionEur,
      lift: r.lift,
      evidence: r.evidence,
      verdict: r.verdict,
      finding: r.finding,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("marketing_learning_rules").upsert(rows, { onConflict: "rule_key" });
    if (error) throw new Error(`refreshLearningRules failed: ${error.message}`);
  }
  return { rulesWritten: rules.length, observations: observations.length };
}

function rowToRule(r: any): LearningRule {
  return {
    ruleKey: r.rule_key,
    scope: r.scope,
    dimension: r.dimension,
    value: r.value,
    sample: num(r.sample),
    avgBusinessValue: num(r.avg_business_value),
    avgQualifiedLeadRate: num(r.avg_qualified_lead_rate),
    totalLeads: num(r.total_leads),
    totalQualified: num(r.total_qualified),
    totalSales: num(r.total_sales),
    totalCommissionEur: num(r.total_commission_eur),
    lift: num(r.lift),
    evidence: r.evidence,
    verdict: r.verdict,
    finding: r.finding,
  };
}

export async function loadLearningRules(supabase: MarketingSupabaseLike, opts: { scope?: string } = {}): Promise<LearningRule[]> {
  let q = supabase.from("marketing_learning_rules").select("*").order("lift", { ascending: false });
  if (opts.scope) q = q.eq("scope", opts.scope);
  const { data } = await q;
  return (data ?? []).map(rowToRule);
}

/**
 * Det content-agentene kaller FØR generering. Slår eksperiment-bevis inn i
 * de observasjonelle reglene, uten å dobbelttelle revenue.
 */
export async function recommendForGeneration(supabase: MarketingSupabaseLike, opts: { scope?: string } = {}): Promise<GenomeRecommendation> {
  const [rules, evidence] = await Promise.all([
    loadLearningRules(supabase, opts),
    loadExperimentEvidence(supabase, opts).catch(() => []),
  ]);
  const merged = applyExperimentEvidence(rules, evidence);
  return recommendGenome(merged);
}
