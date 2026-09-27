export type CorporateMeetingMethod = "video" | "phone" | "in_person";

export function buildCorporateMeetingUpdate(input: {
  status?: string | null;
  evidence?: Record<string, unknown> | null;
  scheduledAt: string;
  method: CorporateMeetingMethod;
  now?: Date;
}) {
  const status = String(input.status || "").toUpperCase();
  if (!["ENGAGED", "MEETING"].includes(status)) {
    throw new Error("Prospektet må være ENGAGED før et discovery-møte kan registreres.");
  }

  const scheduledAtMs = Date.parse(input.scheduledAt);
  if (!Number.isFinite(scheduledAtMs)) {
    throw new Error("Ugyldig møtetidspunkt.");
  }

  const now = input.now || new Date();
  if (scheduledAtMs < now.getTime() - 5 * 60 * 1000) {
    throw new Error("Møtetidspunktet må være nå eller i fremtiden.");
  }

  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : {};
  const existingLog = Array.isArray((evidence as any).corporate_meeting_log)
    ? (evidence as any).corporate_meeting_log.filter((item: unknown) => item && typeof item === "object")
    : [];

  const entry = {
    scheduled_at: new Date(scheduledAtMs).toISOString(),
    method: input.method,
    recorded_at: now.toISOString(),
    calendar_invite_sent: false,
    automated_message_sent: false,
    personal_data_enriched: false,
  };

  return {
    status: "MEETING",
    next_followup: entry.scheduled_at,
    next_action: "Forbered Corporate Home discovery: mål, brukere, budsjett, tidslinje, beslutningsprosess og ønsket boligmodell.",
    evidence: {
      ...evidence,
      corporate_meeting: entry,
      corporate_meeting_log: [...existingLog.slice(-19), entry],
    },
    entry,
  };
}
