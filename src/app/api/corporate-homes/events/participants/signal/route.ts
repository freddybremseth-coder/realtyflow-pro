import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  applyCorporateEventSignal,
  CORPORATE_EVENT_SIGNAL_GUARDRAILS,
  type CorporateEventParticipantStatus,
  type CorporateEventSignal,
} from "@/lib/corporate-event-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_SIGNALS = new Set<CorporateEventSignal>([
  "ATTENDED",
  "CTA_CLICKED",
  "NO_SHOW",
  "CANCELLED",
]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request, { participant: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const eventId = String(body?.event_id || body?.eventId || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const signal = String(body?.signal || "").trim().toUpperCase() as CorporateEventSignal;
  const note = String(body?.note || "").trim().slice(0, 1000);
  const occurredAt = String(body?.occurred_at || body?.occurredAt || new Date().toISOString()).trim();

  if (!eventId || !email || !ALLOWED_SIGNALS.has(signal)) {
    return NextResponse.json({ error: "event_id, email and a valid signal are required." }, { status: 400 });
  }
  if (Number.isNaN(Date.parse(occurredAt))) {
    return NextResponse.json({ error: "occurred_at must be a valid timestamp." }, { status: 400 });
  }

  const { data: participant, error: participantError } = await supabase
    .from("corporate_event_participants")
    .select("*")
    .eq("brand_id", "zeneco")
    .eq("event_id", eventId)
    .eq("email", email)
    .maybeSingle();

  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 });
  if (!participant) return NextResponse.json({ error: "Event participant not found." }, { status: 404 });

  let transition;
  try {
    transition = applyCorporateEventSignal({
      currentStatus: String(participant.status || "REGISTERED") as CorporateEventParticipantStatus,
      signal,
      occurredAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ugyldig event-signal." },
      { status: 409 },
    );
  }

  const currentEvidence = participant.evidence && typeof participant.evidence === "object"
    ? participant.evidence
    : {};
  const history = Array.isArray(currentEvidence.signal_history)
    ? currentEvidence.signal_history.slice(-19)
    : [];

  const update: Record<string, unknown> = {
    status: transition.status,
    evidence: {
      ...currentEvidence,
      signal_history: [
        ...history,
        {
          signal,
          occurred_at: occurredAt,
          note: note || null,
          recorded_manually: true,
        },
      ],
      sales_qualified: false,
      automatic_pipeline_change: false,
      automatic_prospect_qualification: false,
      automatic_outreach: false,
    },
    updated_at: new Date().toISOString(),
  };
  if (transition.attended_at !== undefined) update.attended_at = transition.attended_at;
  if (transition.cta_clicked_at !== undefined) update.cta_clicked_at = transition.cta_clicked_at;

  const { data: updated, error: updateError } = await supabase
    .from("corporate_event_participants")
    .update(update)
    .eq("id", participant.id)
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    participant: updated,
    guardrails: CORPORATE_EVENT_SIGNAL_GUARDRAILS,
    automation: {
      pipelineChanged: false,
      prospectQualified: false,
      workItemCreated: false,
      messageSent: false,
    },
  });
}
