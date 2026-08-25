export type CreativeEvidence = "none" | "limited" | "moderate" | "strong";

export type CreativeFunnelMetrics = {
  impressions: number;
  clicks: number;
  landings: number;
  ctas: number;
  formSubmits: number;
  leads: number;
  qualified: number;
  viewings: number;
  offers: number;
  sales: number;
  commissionEur: number;
};

export function emptyCreativeMetrics(): CreativeFunnelMetrics {
  return {
    impressions: 0,
    clicks: 0,
    landings: 0,
    ctas: 0,
    formSubmits: 0,
    leads: 0,
    qualified: 0,
    viewings: 0,
    offers: 0,
    sales: 0,
    commissionEur: 0,
  };
}

export function addCreativeTouch(metrics: CreativeFunnelMetrics, touch: { touch_type?: string; commission_eur?: number | null }) {
  const type = String(touch.touch_type || "");
  if (type === "impression") metrics.impressions += 1;
  else if (type === "click") metrics.clicks += 1;
  else if (type === "landing") metrics.landings += 1;
  else if (type === "cta") metrics.ctas += 1;
  else if (type === "form_submit") metrics.formSubmits += 1;
  else if (type === "lead_created") metrics.leads += 1;
  else if (type === "qualified") metrics.qualified += 1;
  else if (type === "viewing") metrics.viewings += 1;
  else if (type === "offer") metrics.offers += 1;
  else if (type === "sale") {
    metrics.sales += 1;
    metrics.commissionEur += Number(touch.commission_eur || 0);
  }
  return metrics;
}

export function creativeEvidence(metrics: CreativeFunnelMetrics): CreativeEvidence {
  if (metrics.sales >= 2 || metrics.qualified >= 15 || metrics.leads >= 30) return "strong";
  if (metrics.sales >= 1 || metrics.qualified >= 5 || metrics.leads >= 12) return "moderate";
  if (metrics.leads >= 3 || metrics.clicks >= 50 || metrics.impressions >= 1000) return "limited";
  return "none";
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export function creativeRates(metrics: CreativeFunnelMetrics) {
  return {
    ctrPct: rate(metrics.clicks, metrics.impressions),
    landingToLeadPct: rate(metrics.leads, metrics.landings),
    clickToLeadPct: rate(metrics.leads, metrics.clicks),
    qualifiedLeadPct: rate(metrics.qualified, metrics.leads),
    leadToSalePct: rate(metrics.sales, metrics.leads),
  };
}

/**
 * Sorterer på faktiske downstream outcomes først. Dette er med vilje ikke en
 * "winner score": uten spend/CPM/CPL/ROAS skal RealtyFlow ikke late som en
 * creative med flest events nødvendigvis er økonomisk best.
 */
export function compareCreativeOutcomeSignal(a: CreativeFunnelMetrics, b: CreativeFunnelMetrics) {
  return (
    b.sales - a.sales ||
    b.offers - a.offers ||
    b.viewings - a.viewings ||
    b.qualified - a.qualified ||
    b.leads - a.leads ||
    b.clicks - a.clicks ||
    b.impressions - a.impressions
  );
}
