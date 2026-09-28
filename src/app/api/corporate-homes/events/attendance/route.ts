import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ATTENDANCE_STATUSES = new Set(["ATTENDED", "NO_SHOW", "LEFT_EARLY"]);

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
  const contactId = clean(body.contact_id || body.contactId, 120);
  const eventId = clean(body.event_id || body.eventId, 160);
  const eventName = clean(body.event_name || body.eventName, 240);
  const status = clean(body.status, 40).toUpperCase();
  const note = clean(body.note, 500);

  if (!contactId || !eventId || !eventName || !ATTENDANCE_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "contact_id, event_id, event_name and a valid attendance status are required" },
      { status: 400 },
    );
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id,interactions,brand_id")
    .eq("id", contactId)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Corporate event contact not found" }, { status: 404 });

  const now = new Date().toISOString();
  const current = Array.isArray(contact.interactions) ? contact.interactions : [];
  const otherInteractions = current.filter((item: any) => {
    const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    return !(
      metadata.request_type === "corporate-event-attendance" &&
      String(metadata.event_id || "") === eventId
    );
  });

  const attendanceInteraction = {
    id: `corporate-event-attendance-${eventId}-${Date.now()}`,
    type: "note",
    content: [
      `Corporate-event: ${eventName}`,
      `Oppmøte: ${status}`,
      note ? `Notat: ${note}` : "",
    ].filter(Boolean).join("\n"),
    date: now,
    direction: "internal",
    brand_id: "zeneco",
    metadata: {
      request_type: "corporate-event-attendance",
      event_id: eventId,
      event_name: eventName,
      event_action: status,
      recorded_manually: true,
      automatic_pipeline_change: false,
      automatic_outreach: false,
    },
  };

  const { error: updateError } = await supabase
    .from("contacts")
    .update({
      interactions: [attendanceInteraction, ...otherInteractions],
      updated_at: now,
    })
    .eq("id", contactId)
    .eq("brand_id", "zeneco");

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    attendance: {
      contactId,
      eventId,
      eventName,
      status,
      recordedAt: now,
    },
    automation: {
      pipelineChanged: false,
      prospectChanged: false,
      workItemCreated: false,
      messageSent: false,
      note: "Oppmøte er kun registrert som dokumentert eventsignal. Det kvalifiserer ikke kontakten automatisk.",
    },
  });
}
