import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildCorporateMeetingUpdate,
  type CorporateMeetingMethod,
} from "@/lib/corporate-meeting";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const METHODS = new Set<CorporateMeetingMethod>(["video", "phone", "in_person"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { prospect: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const scheduledAt = String(body?.scheduled_at || "").trim();
  const method = String(body?.method || "").trim() as CorporateMeetingMethod;

  if (!METHODS.has(method)) {
    return NextResponse.json({ error: "Ugyldig møteform." }, { status: 400 });
  }

  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("*")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  let update;
  try {
    update = buildCorporateMeetingUpdate({
      status: prospect.status,
      evidence: prospect.evidence,
      scheduledAt,
      method,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke registrere møtet." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      status: update.status,
      next_followup: update.next_followup,
      next_action: update.next_action,
      evidence: update.evidence,
      updated_at: now,
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: existingWorkItem } = await supabase
    .from("work_items")
    .select("id")
    .eq("brand_id", "zeneco")
    .eq("source_type", "corporate_discovery_meeting")
    .eq("source_id", id)
    .maybeSingle();

  const workItemPayload = {
    title: `Corporate discovery · ${String(prospect.company_name || "Selskap")}`,
    description: "Discovery-møte er registrert manuelt. Forbered mål, brukere, budsjett, tidslinje, beslutningsprosess og aktuell boligmodell.",
    status: "TO_DO",
    priority: String(prospect.fit_tier || "").toUpperCase() === "A" ? "HIGH" : "MEDIUM",
    brand_id: "zeneco",
    source_type: "corporate_discovery_meeting",
    source_id: id,
    assigned_agent: "sales",
    due_date: update.entry.scheduled_at.slice(0, 10),
    next_action: update.next_action,
    ai_score: Math.max(75, Number(prospect.fit_score || 0)),
    metadata: {
      segment: "corporate_homes",
      prospect_id: id,
      meeting_method: update.entry.method,
      scheduled_at: update.entry.scheduled_at,
      calendar_invite_sent: false,
      automatic_send: false,
      personal_data_enriched: false,
    },
    updated_at: now,
  };

  if (existingWorkItem?.id) {
    await supabase.from("work_items").update(workItemPayload).eq("id", existingWorkItem.id);
  } else {
    await supabase.from("work_items").insert({ ...workItemPayload, created_at: now });
  }

  return NextResponse.json({
    prospect: updatedProspect,
    meeting: update.entry,
    automation: {
      calendar_invite_sent: false,
      message_sent: false,
      personal_enrichment: false,
      note: "Møtet ble bare registrert internt. Ingen invitasjon eller melding ble sendt.",
    },
  });
}
