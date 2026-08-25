import { creativeEvidence, type CreativeEvidence, type CreativeFunnelMetrics, emptyCreativeMetrics } from "./creative-performance";

export type CreativeInsightInput = {
  dimensionValue: string | null | undefined;
  metrics: CreativeFunnelMetrics;
  economics?: {
    state?: string;
    comparableRawSpend?: number | null;
    singleCurrency?: string | null;
    spendEur?: number | null;
  } | null;
};

export type CreativeDimensionInsight = {
  value: string;
  creatives: number;
  metrics: CreativeFunnelMetrics;
  evidence: CreativeEvidence;
  status: "observe" | "promising";
  economics: {
    comparable: boolean;
    spend: number | null;
    currency: string | null;
    spendEur: number | null;
    cpl: number | null;
    cpql: number | null;
  };
};

function r2(n: number) { return Math.round(n * 100) / 100; }
function divide(a: number, b: number) { return b > 0 ? r2(a / b) : null; }

export function aggregateCreativeDimension(rows: CreativeInsightInput[]): CreativeDimensionInsight[] {
  const grouped = new Map<string, CreativeInsightInput[]>();
  for (const row of rows) {
    const value = String(row.dimensionValue || "unknown").trim() || "unknown";
    grouped.set(value, [...(grouped.get(value) || []), row]);
  }

  return [...grouped.entries()].map(([value, group]) => {
    const metrics = emptyCreativeMetrics();
    for (const row of group) {
      for (const key of Object.keys(metrics) as Array<keyof CreativeFunnelMetrics>) metrics[key] += Number(row.metrics[key] || 0);
    }
    const evidence = creativeEvidence(metrics);
    const economicRows = group.filter((row) => row.economics?.state === "comparable" && row.economics.comparableRawSpend != null);
    const currencies = new Set(economicRows.map((row) => row.economics?.singleCurrency).filter(Boolean));
    const rawComparable = economicRows.length === group.length && currencies.size === 1;
    const currency = rawComparable ? String([...currencies][0]) : null;
    const spend = rawComparable ? r2(economicRows.reduce((sum, row) => sum + Number(row.economics?.comparableRawSpend || 0), 0)) : null;
    const eurRows = group.filter((row) => row.economics?.spendEur != null);
    const spendEur = eurRows.length === group.length ? r2(eurRows.reduce((sum, row) => sum + Number(row.economics?.spendEur || 0), 0)) : null;
    return {
      value,
      creatives: group.length,
      metrics,
      evidence,
      status: (["moderate", "strong"] as CreativeEvidence[]).includes(evidence) ? "promising" : "observe",
      economics: {
        comparable: rawComparable,
        spend,
        currency,
        spendEur,
        cpl: spend != null ? divide(spend, metrics.leads) : null,
        cpql: spend != null ? divide(spend, metrics.qualified) : null,
      },
    };
  }).sort((a, b) => b.metrics.sales - a.metrics.sales || b.metrics.qualified - a.metrics.qualified || b.metrics.leads - a.metrics.leads || b.creatives - a.creatives);
}
