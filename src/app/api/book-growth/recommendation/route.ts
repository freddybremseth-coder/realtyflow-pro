import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const recommendationId = typeof body?.recommendationId === "string" ? body.recommendationId.trim() : "";
  const decision = body?.decision === "approved" || body?.decision === "rejected" ? body.decision : null;
  if (!recommendationId || !decision) return NextResponse.json({ error: "recommendationId og gyldig decision er påkrevd" }, { status: 400 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: current, error: readError } = await supabase
    .from("book_growth_recommendations")
    .select("id,status")
    .eq("id", recommendationId)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
  if (current.status !== "pending") return NextResponse.json({ error: `Recommendation er allerede ${current.status}` }, { status: 409 });

  const patch = decision === "approved"
    ? { status: "approved", approved_by: "admin_ui", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { status: "rejected", approved_by: null, approved_at: null, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from("book_growth_recommendations")
    .update(patch)
    .eq("id", recommendationId)
    .eq("status", "pending")
    .select("id,status,approved_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Recommendation ble endret av en annen prosess" }, { status: 409 });

  return NextResponse.json({ ok: true, recommendation: data, note: "Approval/rejection endrer kun anbefalingsstatus. Ingen kanaldata er applied." });
}
