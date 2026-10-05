import type { CorporateAdvisorRecommendation } from "./corporate-account-advisor";

export type CorporateStageGateCriterion = {
  id: string;
  label: string;
  met: boolean;
  evidence?: string | null;
};

export type CorporateStageGate = {
  currentStage: string;
  nextStage: string | null;
  readyToAdvance: boolean;
  completionPercent: number;
  criteria: CorporateStageGateCriterion[];
};

type Input = {
  strategy?: Record<string, unknown> | null;
  advisor: CorporateAdvisorRecommendation;
  contacts?: Array<Record<string, unknown>>;
  touchpoints?: Array<Record<string, unknown>>;
};

const NEXT_STAGE: Record<string, string | null> = {
  TARGET: "RESEARCH",
  RESEARCH: "STRATEGY_READY",
  STRATEGY_READY: "OUTREACH",
  OUTREACH: "ENGAGED",
  ENGAGED: "MEETING",
  MEETING: "BUSINESS_CASE",
  BUSINESS_CASE: "SHORTLIST",
  SHORTLIST: "DECISION",
  DECISION: "NEGOTIATION",
  NEGOTIATION: "WON",
  WON: null,
  LOST: null,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function upper(value: unknown) {
  return text(value).toUpperCase();
}

function yes(value: unknown) {
  return Boolean(text(value));
}

function criterion(id: string, label: string, met: boolean, evidence?: string | null): CorporateStageGateCriterion {
  return { id, label, met, evidence: evidence || null };
}

export function evaluateCorporateStageGate(input: Input): CorporateStageGate {
  const strategy = input.strategy || {};
  const contacts = input.contacts || [];
  const touchpoints = input.touchpoints || [];
  const currentStage = upper(strategy.stage) || upper(input.advisor.stage) || "TARGET";
  const nextStage = Object.prototype.hasOwnProperty.call(NEXT_STAGE, currentStage) ? NEXT_STAGE[currentStage] : null;

  const completedExternal = touchpoints.some(item =>
    upper(item.status) === "COMPLETED" &&
    ["EMAIL","LINKEDIN","CALL","MEETING"].includes(upper(item.channel)),
  );
  const completedExternalWithOutcome = touchpoints.some(item =>
    upper(item.status) === "COMPLETED" &&
    ["EMAIL","LINKEDIN","CALL","MEETING"].includes(upper(item.channel)) &&
    yes(item.summary),
  );
  const completedMeeting = touchpoints.some(item =>
    upper(item.status) === "COMPLETED" &&
    (upper(item.channel) === "MEETING" || /MEETING|DISCOVERY/.test(upper(item.activity_type))),
  );
  const decisionMaker = contacts.some(item =>
    upper(item.influence_level) === "DECISION_MAKER" ||
    /CEO|CFO|OWNER|EIER|DIRECTOR|DIREKTØR|LEDER|BOARD|STYRE/.test(
      `${upper(item.buying_role)} ${upper(item.title)}`,
    ),
  );

  const problemAccepted = upper(strategy.problem_acceptance_status) === "CONFIRMED";
  const solutionAccepted = upper(strategy.solution_acceptance_status) === "CONFIRMED";
  const criteriaByStage: Record<string, CorporateStageGateCriterion[]> = {
    TARGET: [
      criterion("fit", "Kontoen er innenfor målgruppen", input.advisor.scores.fit >= 40, `Fit ${input.advisor.scores.fit}/100`),
      criterion("relevance", "En første relevanshypotese er formulert", yes(strategy.primary_model) || yes(strategy.objective) || yes(strategy.entry_angle)),
    ],
    RESEARCH: [
      criterion("entry_role", "Minst én relevant inngangsrolle er identifisert", yes(strategy.recommended_entry_role) || yes(input.advisor.recommendedEntryRole), text(strategy.recommended_entry_role) || input.advisor.recommendedEntryRole),
      criterion("why_now", "Hvorfor nå / problemhypotese er dokumentert", yes(strategy.problem_hypothesis) || input.advisor.whyNow.length > 0),
    ],
    STRATEGY_READY: [
      criterion("problem", "Problemhypotesen er definert", yes(strategy.problem_hypothesis)),
      criterion("message", "Kjernebudskap eller inngangsvinkel er definert", yes(strategy.core_message) || yes(strategy.entry_angle)),
      criterion("next_action", "Neste beste handling er konkret", yes(strategy.next_best_action) || yes(input.advisor.nextAction), text(strategy.next_best_action) || input.advisor.nextAction),
    ],
    OUTREACH: [
      criterion("contact_done", "Menneskelig godkjent kontakt er gjennomført", completedExternal),
      criterion("outcome_logged", "Utfallet er loggført", completedExternalWithOutcome),
    ],
    ENGAGED: [
      criterion("problem_acceptance", "Kunden har eksplisitt bekreftet problemet", problemAccepted, text(strategy.problem_acceptance_evidence)),
      criterion("problem_evidence", "Problemaksepten har dokumentert evidens", yes(strategy.problem_acceptance_evidence)),
    ],
    MEETING: [
      criterion("meeting_done", "Discovery/møte er gjennomført", completedMeeting),
      criterion("problem_confirmed", "Problem er bekreftet før løsning", problemAccepted, text(strategy.problem_acceptance_evidence)),
      criterion("solution_hypothesis", "Løsningshypotesen er dokumentert", yes(strategy.solution_hypothesis)),
    ],
    BUSINESS_CASE: [
      criterion("business_case", "Business case er minst 70 % komplett", input.advisor.businessCaseCompleteness >= 70, `${input.advisor.businessCaseCompleteness}%`),
      criterion("solution_defined", "Løsningen er konkret nok til å vurderes", yes(strategy.solution_hypothesis)),
    ],
    SHORTLIST: [
      criterion("business_case", "Business case er minst 80 % komplett", input.advisor.businessCaseCompleteness >= 80, `${input.advisor.businessCaseCompleteness}%`),
      criterion("solution_acceptance", "Kunden har bekreftet løsningsfit", solutionAccepted, text(strategy.solution_acceptance_evidence)),
    ],
    DECISION: [
      criterion("decision_maker", "Beslutningstaker er identifisert", decisionMaker),
      criterion("solution_acceptance", "Løsningsaksept er dokumentert", solutionAccepted, text(strategy.solution_acceptance_evidence)),
    ],
    NEGOTIATION: [
      criterion("decision_maker", "Beslutningstaker er identifisert", decisionMaker),
      criterion("solution_acceptance", "Løsningsaksept er dokumentert", solutionAccepted, text(strategy.solution_acceptance_evidence)),
      criterion("next_action", "Neste kommersielle steg er dokumentert", yes(strategy.next_best_action)),
    ],
    WON: [],
    LOST: [],
  };

  const criteria = criteriaByStage[currentStage] || [];
  const metCount = criteria.filter(item => item.met).length;
  const completionPercent = criteria.length ? Math.round((metCount / criteria.length) * 100) : 100;

  return {
    currentStage,
    nextStage,
    readyToAdvance: criteria.length === 0 || criteria.every(item => item.met),
    completionPercent,
    criteria,
  };
}

export function stageIndex(stage: string) {
  const order = ["TARGET","RESEARCH","STRATEGY_READY","OUTREACH","ENGAGED","MEETING","BUSINESS_CASE","SHORTLIST","DECISION","NEGOTIATION","WON"];
  return order.indexOf(stage.toUpperCase());
}
