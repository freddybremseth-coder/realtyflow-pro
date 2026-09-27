const REQUIRED_ASSESSMENT_FIELDS = [
  ["budget_max_eur", "Maksbudsjett"],
  ["expected_users", "Forventede brukere"],
  ["usage_weeks_per_year", "Bruksuker per år"],
  ["preferred_area", "Ønsket område"],
  ["bedrooms_min", "Minimum soverom"],
  ["property_type", "Boligtype"],
] as const;

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function nonEmpty(value: unknown) {
  return Boolean(String(value ?? "").trim());
}

export function evaluateCorporateOpportunityGate(input: {
  status?: string | null;
  evidence?: Record<string, unknown> | null;
  now?: Date;
}) {
  const status = String(input.status || "").toUpperCase();
  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : {};
  const assessment = evidence.corporate_assessment && typeof evidence.corporate_assessment === "object"
    ? evidence.corporate_assessment as Record<string, unknown>
    : {};
  const meeting = evidence.corporate_meeting && typeof evidence.corporate_meeting === "object"
    ? evidence.corporate_meeting as Record<string, unknown>
    : {};

  const missing = REQUIRED_ASSESSMENT_FIELDS
    .filter(([key]) => {
      const value = assessment[key];
      return ["budget_max_eur", "expected_users", "usage_weeks_per_year", "bedrooms_min"].includes(key)
        ? !positiveNumber(value)
        : !nonEmpty(value);
    })
    .map(([, label]) => label);

  const scheduledAt = String(meeting.scheduled_at || "").trim();
  const scheduledMs = Date.parse(scheduledAt);
  const now = input.now || new Date();
  const meetingRegistered = Number.isFinite(scheduledMs);
  const meetingCompletedByTime = meetingRegistered && scheduledMs <= now.getTime();

  return {
    status,
    assessmentReady: missing.length === 0,
    missing,
    meetingRegistered,
    meetingCompletedByTime,
    ready: status === "MEETING" && missing.length === 0 && meetingCompletedByTime,
  };
}

export function buildCorporateOpportunityUpdate(input: {
  status?: string | null;
  evidence?: Record<string, unknown> | null;
  now?: Date;
}) {
  const now = input.now || new Date();
  const gate = evaluateCorporateOpportunityGate({ ...input, now });

  if (gate.status !== "MEETING") {
    throw new Error("Prospektet må stå i MEETING før det kan bli Opportunity.");
  }
  if (!gate.meetingRegistered) {
    throw new Error("Discovery-møtet må være registrert før Opportunity.");
  }
  if (!gate.meetingCompletedByTime) {
    throw new Error("Discovery-møtet ligger fortsatt i fremtiden.");
  }
  if (!gate.assessmentReady) {
    throw new Error(`Discovery mangler: ${gate.missing.join(", ")}.`);
  }

  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : {};
  const meeting = evidence.corporate_meeting && typeof evidence.corporate_meeting === "object"
    ? evidence.corporate_meeting as Record<string, unknown>
    : {};
  const followup = new Date(now);
  followup.setUTCDate(followup.getUTCDate() + 2);

  const opportunity = {
    promoted_at: now.toISOString(),
    source: "completed_discovery",
    assessment_ready: true,
    meeting_completed_at: now.toISOString(),
    automatic_customer_contact: false,
    personal_data_enriched: false,
  };

  return {
    status: "OPPORTUNITY",
    next_followup: followup.toISOString(),
    next_action: "Bygg og kvalitetssikre boligshortlist, styre-/ledercase og konkret neste beslutningssteg.",
    evidence: {
      ...evidence,
      corporate_meeting: {
        ...meeting,
        completed_at: now.toISOString(),
      },
      corporate_opportunity: opportunity,
    },
    opportunity,
  };
}
