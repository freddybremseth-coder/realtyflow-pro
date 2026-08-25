import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const recommendationId = typeof body?.recommendationId === "string" ? body.recommendationId.trim() : "";
  const confirmedExternalChange = body?.confirmedExternalChange === true;
  const appliedBy = typeof body?.appliedBy === "string" && body.appliedBy.trim() ? body.appliedBy.trim() : "admin_ui";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (!recommendationId) {
    return NextResponse.json({ error: "recommendationId er påkrevd" }, { status: 400 });
  }
  if (!confirmedExternalChange) {
    return NextResponse.json({ error: "Applied krever eksplisitt bekreftelse på at endringen faktisk er utført i målkanalen." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const confirmation = {
    confirmedExternalChange: true,
    note,
    confirmedAt: new Date().toISOString(),
    source: "book_growth_admin_ui",
  };

  const { data, error } = await supabase.rpc("book_growth_mark_applied", {
    p_recommendation_id: recommendationId,
    p_applied_by: appliedBy,
    p_confirmation: confirmation,
    p_applied_value: null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const result = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    ok: true,
    recommendation: result,
    note: "Applied er registrert som en separat, auditerbar bekreftelse. Endpointet utfører ingen automatisk KDP/Amazon-endring.",
  });
}
