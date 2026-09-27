import { auditSEOPortfolio } from "./seo-audit";
import { getSEOObservedSignals } from "./seo-data";
import { getSEOLeadSignals } from "./seo-leads";
import { checkReferralCollectorPreflight } from "./seo-referral-health";
import { planSEODiagnostics } from "./seo-diagnostics";
import { buildSEOControlReport } from "./seo-control-report";
import type { GSCBrandSnapshot } from "./seo-search-console";

const defaults = {
  signals: getSEOObservedSignals, leads: getSEOLeadSignals,
  audits: auditSEOPortfolio, preflight: checkReferralCollectorPreflight,
};

/** One execution path for daily autopilot and manual refresh. Partial sources
 * stay unknown; refreshing must never silently drop the collector check. */
export async function runSEOControls(
  snapshots: readonly GSCBrandSnapshot[], dependencies = defaults,
) {
  const results = await Promise.allSettled([
    dependencies.signals(), dependencies.leads(), dependencies.audits(),
  ] as const);
  const signals = results[0].status === "fulfilled" ? results[0].value : null;
  const leads = results[1].status === "fulfilled" ? results[1].value : null;
  const audits = results[2].status === "fulfilled" ? results[2].value : [];
  const collectorPreflight = signals?.totals.current === 0 &&
    snapshots.some(snapshot => snapshot.totals.currentClicks > 0)
    ? await dependencies.preflight().catch(() => null) : null;
  return {
    signals, leads, audits, collectorPreflight,
    diagnostics: planSEODiagnostics({ snapshots, signals, leads, audits, collectorPreflight }),
    controlReport: buildSEOControlReport({ audits, referralsAvailable: signals !== null,
      leadsAvailable: leads !== null, collectorPreflight }),
  };
}
