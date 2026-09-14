export type GrowthScalingStage = "HOLD" | "FOUNDATION" | "PILOT" | "PROVE" | "SCALE";

export type GrowthScalingInput = {
  active: boolean;
  connectedChannels: number;
  pilotReadyChannels: number;
  readySources: number;
  blockedSources: number;
  published30d: number;
  eligibleObservations: number;
  evaluatedRules: number;
  actionableRules: number;
  quarantined: number;
  leads: number;
  qualified: number;
  sales: number;
  attributionCoveragePercent: number;
};

export type GrowthScalingDecision = {
  stage: GrowthScalingStage;
  score: number;
  canScale: boolean;
  blockers: string[];
  evidence: string[];
  nextAction: string;
};

export const GROWTH_SCALING_THRESHOLDS = {
  readySources: 20,
  published30d: 10,
  eligibleObservations: 10,
  attributionCoveragePercent: 70,
  leads: 3,
  qualified: 1,
} as const;

export function decideGrowthScaling(input: GrowthScalingInput): GrowthScalingDecision {
  const blockers: string[] = [];
  const evidence: string[] = [];
  if (!input.active) blockers.push("Brandets Growth OS-plan er ikke aktiv.");
  if (input.connectedChannels < 1) blockers.push("Ingen aktiv kanal er koblet.");
  if (input.pilotReadyChannels < 1) blockers.push("Ingen kanal har godkjent pilot-governance.");
  if (input.readySources < GROWTH_SCALING_THRESHOLDS.readySources) blockers.push(`For få publiseringsklare kilder (${input.readySources}/${GROWTH_SCALING_THRESHOLDS.readySources}).`);
  if (input.blockedSources > 0) evidence.push(`${input.blockedSources} kilder er blokkert og skal ikke brukes.`);
  if (input.quarantined > 0) blockers.push(`${input.quarantined} målinger er i karantene.`);

  const foundationReady = input.active && input.connectedChannels > 0 && input.pilotReadyChannels > 0
    && input.readySources >= GROWTH_SCALING_THRESHOLDS.readySources && input.quarantined === 0;
  const learningReady = foundationReady
    && input.published30d >= GROWTH_SCALING_THRESHOLDS.published30d
    && input.eligibleObservations >= GROWTH_SCALING_THRESHOLDS.eligibleObservations
    && input.evaluatedRules > 0;
  const revenueReady = learningReady
    && input.attributionCoveragePercent >= GROWTH_SCALING_THRESHOLDS.attributionCoveragePercent
    && input.leads >= GROWTH_SCALING_THRESHOLDS.leads
    && input.qualified >= GROWTH_SCALING_THRESHOLDS.qualified;

  if (foundationReady) evidence.push("Brand, kanal-governance og kildeforsyning er klare.");
  if (learningReady) evidence.push("Minste læringsutvalg og evaluerte regler er dokumentert.");
  if (revenueReady) evidence.push("Kanonisk attribusjon dokumenterer leads og kvalifiserte muligheter.");
  if (input.sales > 0) evidence.push(`${input.sales} attribuerte salg gir sterk kommersiell evidens.`);

  let stage: GrowthScalingStage;
  let nextAction: string;
  if (!input.active || input.connectedChannels < 1 || input.quarantined > 0) {
    stage = "HOLD";
    nextAction = "Løs plan-, kanal- eller datakvalitetsblokkeringen før ny produksjon.";
  } else if (!foundationReady) {
    stage = "FOUNDATION";
    nextAction = input.pilotReadyChannels < 1
      ? "Fullfør Brand Brain, kanaltilkobling og kontrollert pilot-governance."
      : "Bygg en større beholdning av verifiserte, publiseringsklare kilder.";
  } else if (!learningReady) {
    stage = "PILOT";
    nextAction = "Kjør bare eksisterende pilot til 10 modne, learning-eligible observasjoner og minst én evaluert regel.";
  } else if (!revenueReady) {
    stage = "PROVE";
    nextAction = "Behold dagens omfang og dokumenter attribuerte leads, kvalifisering og minst 70 % attribusjonsdekning.";
  } else {
    stage = "SCALE";
    nextAction = "Åpne én ny kontrollert canary-kanal eller øk frekvensen ett trinn; behold approval, claim-guard og rollback.";
  }

  const score = Math.round(
    Math.min(input.readySources / GROWTH_SCALING_THRESHOLDS.readySources, 1) * 20
    + Math.min(input.eligibleObservations / GROWTH_SCALING_THRESHOLDS.eligibleObservations, 1) * 20
    + Math.min(input.published30d / GROWTH_SCALING_THRESHOLDS.published30d, 1) * 15
    + Math.min(input.attributionCoveragePercent / GROWTH_SCALING_THRESHOLDS.attributionCoveragePercent, 1) * 15
    + Math.min(input.leads / GROWTH_SCALING_THRESHOLDS.leads, 1) * 15
    + Math.min(input.qualified / GROWTH_SCALING_THRESHOLDS.qualified, 1) * 15
  );

  return { stage, score: input.quarantined > 0 ? Math.min(score, 39) : score, canScale: stage === "SCALE", blockers, evidence, nextAction };
}
