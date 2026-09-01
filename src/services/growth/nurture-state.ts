export const NURTURE_STATES = ["eligible", "enrolled", "paused", "completed", "stopped"] as const;

export type NurtureState = (typeof NURTURE_STATES)[number];

export interface NurtureStateInput {
  nurture_status?: string | null;
  nurture_sequence?: string | null;
  nurture_enrolled_at?: string | null;
}

export function normalizeNurtureState(input: NurtureStateInput): NurtureState {
  const raw = String(input.nurture_status || "").trim().toLowerCase();

  if (raw === "paused") return "paused";
  if (raw === "completed") return "completed";
  if (["stopped", "stop", "unsubscribed", "opted_out", "opted-out"].includes(raw)) return "stopped";
  if (raw === "enrolled") return "enrolled";
  if (raw === "eligible") return "eligible";

  // Backward compatibility for the old overloaded `active` value.
  if (raw === "active") {
    return input.nurture_sequence || input.nurture_enrolled_at ? "enrolled" : "eligible";
  }

  // Missing/unknown legacy values are safe-by-default: eligible for evaluation,
  // never implicitly enrolled in an outbound sequence.
  return "eligible";
}

export function canEvaluateForNurture(state: NurtureState) {
  return state === "eligible" || state === "enrolled";
}

export function shouldPersistCompletedWhenIneligible(state: NurtureState) {
  return state === "enrolled";
}

export function nurtureStateAfterSuccessfulSend() : NurtureState {
  return "enrolled";
}

export const NURTURE_STATE_LABELS: Record<NurtureState, string> = {
  eligible: "Kan vurderes",
  enrolled: "Aktiv sekvens",
  paused: "Midlertidig pauset",
  completed: "Fullført",
  stopped: "Stoppet",
};
