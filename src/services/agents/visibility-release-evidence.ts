/**
 * Read-only SEO release evidence gate. A GitHub PR and its CI results are not
 * proof that the exact version was deployed to the public website.
 */
export type VisibilityReleaseEvidence = {
  brandId: string;
  targetUrl: string;
  repository: string;
  commitSha: string;
  deploymentCommitSha: string | null;
  deploymentState: "READY" | "ERROR" | "PENDING" | "UNKNOWN";
  deployedAt: string | null;
  observedPublicUrl: string | null;
  verifiedPublicAt: string | null;
};
export type VisibilityReleaseAssessment = {
  state: "RELEASE_VERIFIED" | "UNVERIFIED";
  reasons: string[];
  publicationAuthorized: false;
  impactCausationVerified: false;
};
const SHA = /^[a-f0-9]{40}$/i;
export function assessVisibilityReleaseEvidence(e: VisibilityReleaseEvidence): VisibilityReleaseAssessment {
  const reasons: string[] = [];
  if (!SHA.test(e.commitSha) || !e.deploymentCommitSha || e.commitSha !== e.deploymentCommitSha)
    reasons.push("Eksakt kode-commit er ikke bekreftet mot deploy");
  if (e.deploymentState !== "READY") reasons.push("Deploy er ikke dokumentert READY");
  if (!e.deployedAt || !Number.isFinite(Date.parse(e.deployedAt))) reasons.push("Publiseringstidspunkt er ikke dokumentert");
  if (!e.verifiedPublicAt || !Number.isFinite(Date.parse(e.verifiedPublicAt))) reasons.push("Uavhengig etterkontroll mangler");
  try {
    const target = new URL(e.targetUrl);
    const observed = new URL(e.observedPublicUrl || "");
    if (target.protocol !== "https:" || observed.protocol !== "https:" ||
        target.origin !== observed.origin || target.pathname !== observed.pathname ||
        target.search !== observed.search)
      reasons.push("Etterkontroll gjelder ikke eksakt offentlig mål-URL");
  } catch { reasons.push("Ugyldig offentlig mål-URL eller kontroll-URL"); }
  if (e.deployedAt && e.verifiedPublicAt &&
      Date.parse(e.verifiedPublicAt) < Date.parse(e.deployedAt))
    reasons.push("Etterkontroll skjedde før publisering");
  return { state: reasons.length ? "UNVERIFIED" : "RELEASE_VERIFIED", reasons,
    publicationAuthorized: false, impactCausationVerified: false };
}
