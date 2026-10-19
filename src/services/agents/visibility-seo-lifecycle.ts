import { assessVisibilityReleaseEvidence, type VisibilityReleaseEvidence } from "./visibility-release-evidence";
import { compareVisibilityRankingWindows, type VisibilityRankingWindow } from "./visibility-ranking-impact";

/** One read-only, evidence-bound view of an SEO action's status.
 * Does not read from user-editable work-item metadata as proof of publication.
 */
export type VisibilitySeoLifecycle = {
  stage: "INVESTIGATE" | "RELEASE_UNVERIFIED" | "AWAITING_AFTER_MEASUREMENT" | "IMPACT_OBSERVED";
  nextAction: string;
  releaseVerified: boolean;
  impactMeasured: boolean;
  impactCausationVerified: false;
  executionAuthorized: false;
  publicationAuthorized: false;
  deltas: { position: number | null; clicks: number | null; impressions: number | null };
};
export function summarizeVisibilitySeoLifecycle(input: {
  nexusWorkItemId: string | null;
  releaseEvidence: VisibilityReleaseEvidence | null;
  before: VisibilityRankingWindow | null;
  after: VisibilityRankingWindow | null;
}): VisibilitySeoLifecycle {
  const baseline = { position: null, clicks: null, impressions: null };
  const flags = { impactCausationVerified: false as const, executionAuthorized: false as const, publicationAuthorized: false as const };
  if (!input.nexusWorkItemId)
    return { stage: "INVESTIGATE", nextAction: "Opprett en dokumentert Nexus-undersøkelse før endringer vurderes.", releaseVerified: false, impactMeasured: false, deltas: baseline, ...flags };
  const release = input.releaseEvidence ? assessVisibilityReleaseEvidence(input.releaseEvidence) : null;
  if (release?.state !== "RELEASE_VERIFIED")
    return { stage: "RELEASE_UNVERIFIED", nextAction: "Kontroller eksakt deploy-commit, READY-status og uavhengig offentlig etterkontroll.", releaseVerified: false, impactMeasured: false, deltas: baseline, ...flags };
  if (!input.before || !input.after)
    return { stage: "AWAITING_AFTER_MEASUREMENT", nextAction: "Hent sammenlignbare Google-måleperioder for samme søkeord og URL.", releaseVerified: true, impactMeasured: false, deltas: baseline, ...flags };
  const comparison = compareVisibilityRankingWindows(input.before, input.after);
  if (comparison.state !== "COMPARABLE")
    return { stage: "AWAITING_AFTER_MEASUREMENT", nextAction: comparison.note, releaseVerified: true, impactMeasured: false, deltas: baseline, ...flags };
  if (input.releaseEvidence?.deployedAt &&
      (Date.parse(input.before.end + "T23:59:59Z") >= Date.parse(input.releaseEvidence.deployedAt) ||
       Date.parse(input.after.start + "T00:00:00Z") <= Date.parse(input.releaseEvidence.deployedAt)))
    return { stage: "AWAITING_AFTER_MEASUREMENT", nextAction: "Måleperiodene må ligge helt før og etter publisering.", releaseVerified: true, impactMeasured: false, deltas: baseline, ...flags };
  return { stage: "IMPACT_OBSERVED", nextAction: "Vurder resultatet med sesongvariasjon, søkeintensjon og andre samtidige endringer før årsak konkluderes.", releaseVerified: true, impactMeasured: true,
    deltas: { position: comparison.deltaPosition, clicks: comparison.deltaClicks, impressions: comparison.deltaImpressions }, ...flags };
}
