import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { removeLegacyScheduledRow } from "@/services/marketing/legacy-content-adapter";

export const dynamic = "force-dynamic";

/**
 * Phase 7.1H — dobbel-post-vern for canary. Tar ÉN legacy content_publications-rad
 * ut av legacy-scheduleren (status scheduled→archived). Endrer kun den ene raden;
 * feiler hvis 0 eller >1 rader ble endret.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { publicationId?: string };
  if (!body.publicationId) return NextResponse.json({ error: "publicationId er påkrevd" }, { status: 400 });

  try {
    const res = await removeLegacyScheduledRow(supabase, body.publicationId);
    return NextResponse.json({ status: "LEGACY_SCHEDULER_REMOVED", id: res.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "remove-legacy-schedule feilet" }, { status: 409 });
  }
}
