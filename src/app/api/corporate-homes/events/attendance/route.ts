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

const LEGACY_STATUSES = new Set(["ATTENDED", "NO_SHOW", "LEFT_EARLY", "CANCELLED"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function clean(value: unknown, max = 240) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request, { attendance: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const eventId = clean(body.event_id || body.eventId, 160);
  const email = clean(body.email, 320).toLowerCase();
  const contactId = clean(body.contact_id || body.contactId, 120);
  const status = clean(body.status, 40).toUpperCase();
  const note = clean(body.note, 500);

  if (!eventId || (!email && !contactId) || !LEGACY_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "event_id, email or contact_id, and a valid attendance status are required" },
      { status: 400 },
    );
  }

  let query = supabase
    .from("corporate_event_participants")
    .select("*")
    .eq("brand_id", "zeneco")
    .eq("event_id", eventId);
  query = email ? query.eq("email", email) : query.eq("contact_id", contactId);

  const { data: participant, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!participant) return NextResponse.json({ error: "Corporate event participant not found" }, { status: 404 });

  const signal = (status === "LEFT_EARLY" ? "ATTENDED" : status) as CorporateEventSignal;
  const occurredAt = new Date().toISOString();

  let transition;
  try {
    transition = applyCorporateEventSignal({
      currentStatus: String(participant.status || "REGISTERED") as CorporateEventParticipantStatus,
      signal,
      occurredAt,
    });
  } catch (transitionError) {
    return NextResponse.json(
      { error: transitionError instanceof Error ? transitionError.message : "Ugyldig event-signal." },
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
          legacy_status: status === "LEFT_EARLY" ? "LEFT_EARLY" : null,
          occurred_at: occurredAt,
          note: note || null,
          recorded_manually: true,
          compatibility_route: true,
        },
      ],
      sales_qualified: false,
      automatic_pipeline_change: false,
      automatic_prospect_qualification: false,
      automatic_outreach: false,
    },
    updated_at: occurredAt,
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
    attendance: {
      participantId: updated.id,
      eventId,
      email: updated.email,
      requestedStatus: status,
      participantStatus: updated.status,
      recordedAt: occurredAt,
    },
    guardrails: CORPORATE_EVENT_SIGNAL_GUARDRAILS,
    automation: {
      pipelineChanged: false,
      prospectChanged: false,
      workItemCreated: false,
      messageSent: false,
    },
  });
}
