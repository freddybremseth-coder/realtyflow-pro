export type LeadWorklistNextActionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface LeadWorklistNextActionInput {
  analysisRunId: string | null;
  contactLinked: boolean;
  criterionCount: number;
  shortlistCount: number;
  latestShortlistStatus: string | null;
  latestShortlistItemCount: number;
  latestPresentationId: string | null;
  latestPresentationStatus: string | null;
  latestMessageDraftId: string | null;
  latestMessageDraftStatus: string | null;
  purchaseReadiness: string | null;
}

export interface LeadWorklistNextAction {
  priority: LeadWorklistNextActionPriority;
  label: string;
  reason: string;
}

const PRIORITY_RANK: Record<LeadWorklistNextActionPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function normalized(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isHotLead(value: string | null | undefined) {
  return /hot|ready|klar|high|urgent|nå|now/i.test(String(value || ""));
}

export function buildLeadWorklistNextAction(input: LeadWorklistNextActionInput): LeadWorklistNextAction {
  if (!input.analysisRunId) {
    return {
      priority: "HIGH",
      label: "Analyser henvendelsen på nytt",
      reason: "profilen mangler analyse-run og kan ikke brukes trygt videre",
    };
  }

  if (!input.contactLinked) {
    return {
      priority: "CRITICAL",
      label: "Koble til CRM-kontakt",
      reason: "kunden må kobles før oppfølging, shortlist og salgsflyt kan stole på samme person",
    };
  }

  if (input.criterionCount <= 0) {
    return {
      priority: "HIGH",
      label: "Kvalitetssikre kjøpskriterier",
      reason: "profilen mangler aktive kriterier, så matching og anbefalinger blir svake",
    };
  }

  if (input.shortlistCount <= 0) {
    return {
      priority: isHotLead(input.purchaseReadiness) ? "CRITICAL" : "HIGH",
      label: "Lag bolig-shortlist",
      reason: "kunden har godkjent profil, men mangler konkrete boliger å reagere på",
    };
  }

  if (normalized(input.latestShortlistStatus) === "draft") {
    return {
      priority: "HIGH",
      label: "Godkjenn shortlist",
      reason: "shortlisten finnes, men er fortsatt utkast og bør kvalitetssikres før sending",
    };
  }

  if (!input.latestPresentationId) {
    return {
      priority: "MEDIUM",
      label: "Lag kundepresentasjon",
      reason: "kunden har shortlist, men mangler en ryddig presentasjon som kan sendes",
    };
  }

  if (normalized(input.latestPresentationStatus) === "draft") {
    return {
      priority: "MEDIUM",
      label: "Godkjenn kundepresentasjon",
      reason: "presentasjonen er laget, men står fortsatt som utkast",
    };
  }

  if (!input.latestMessageDraftId) {
    return {
      priority: "HIGH",
      label: "Lag e-postutkast",
      reason: "kunden har presentasjon, men ingen klar melding for neste salgskontakt",
    };
  }

  if (normalized(input.latestMessageDraftStatus) === "draft") {
    return {
      priority: "HIGH",
      label: "Godkjenn og send e-postutkast",
      reason: "utkastet er klart nok til manuell vurdering, men ikke ferdig håndtert",
    };
  }

  if (normalized(input.latestMessageDraftStatus) === "approved") {
    return {
      priority: "LOW",
      label: "Planlegg oppfølging",
      reason: "kunden har fått en ferdig salgsflyt; neste verdi ligger i respons og timing",
    };
  }

  return {
    priority: "LOW",
    label: "Hold varm og følg signaler",
    reason: "profilen har ingen åpen blokkering i Lead Intelligence-flyten",
  };
}

export function leadWorklistNextActionPriorityRank(priority: LeadWorklistNextActionPriority) {
  return PRIORITY_RANK[priority] || 0;
}

export function compareLeadWorklistNextActionPriority(
  a: LeadWorklistNextAction,
  b: LeadWorklistNextAction,
) {
  return leadWorklistNextActionPriorityRank(b.priority) - leadWorklistNextActionPriorityRank(a.priority);
}
