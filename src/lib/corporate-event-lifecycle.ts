export type CorporateEventParticipantStatus =
  | "REGISTERED"
  | "ATTENDED"
  | "CTA_CLICKED"
  | "ASSESSMENT_REQUESTED"
  | "NO_SHOW"
  | "CANCELLED";

export type CorporateEventSignal = "ATTENDED" | "CTA_CLICKED" | "NO_SHOW" | "CANCELLED";

const ACTIVE_PROGRESS: CorporateEventParticipantStatus[] = [
  "REGISTERED",
  "ATTENDED",
  "CTA_CLICKED",
  "ASSESSMENT_REQUESTED",
];

function progressRank(status: CorporateEventParticipantStatus) {
  return ACTIVE_PROGRESS.indexOf(status);
}

export function applyCorporateEventSignal(params: {
  currentStatus: CorporateEventParticipantStatus;
  signal: CorporateEventSignal;
  occurredAt: string;
}) {
  const { currentStatus, signal, occurredAt } = params;

  if (signal === "NO_SHOW" || signal === "CANCELLED") {
    if (progressRank(currentStatus) >= progressRank("ATTENDED")) {
      throw new Error("Kan ikke nedgradere dokumentert event-engasjement til NO_SHOW eller CANCELLED.");
    }
    return {
      status: signal as CorporateEventParticipantStatus,
      attended_at: null,
      cta_clicked_at: null,
    };
  }

  if (signal === "ATTENDED") {
    const status = progressRank(currentStatus) > progressRank("ATTENDED")
      ? currentStatus
      : "ATTENDED";
    return {
      status,
      attended_at: occurredAt,
      cta_clicked_at: undefined,
    };
  }

  const status = currentStatus === "ASSESSMENT_REQUESTED"
    ? currentStatus
    : "CTA_CLICKED";
  return {
    status,
    attended_at: undefined,
    cta_clicked_at: occurredAt,
  };
}

export const CORPORATE_EVENT_SIGNAL_GUARDRAILS = {
  automaticPipelineChange: false,
  automaticProspectQualification: false,
  automaticOutreach: false,
  automaticWorkItemCreation: false,
} as const;
