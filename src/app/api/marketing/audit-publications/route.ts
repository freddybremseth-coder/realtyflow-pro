import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { auditPublications } from "@/services/publishing/publishability-guard";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Phase 7.1F — READ-ONLY audit. Finner eksisterende content_publications i
 * draft/review/approved/scheduled med agent-/meta-/placeholder-signaler, så de
 * kan nøytraliseres kontrollert. Sletter/endrer ALDRI noe.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("content_publications")
    .select("*")
    .in("status", ["draft", "review", "approved", "scheduled", "publishing", "published"])
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hits = auditPublications(
    (data ?? []).map((r: any) => ({
      id: String(r.id), brand_id: r.brand_id, platform: r.platform ?? null, status: r.status,
      body: r.body ?? null, content: r.content ?? null, description: r.description ?? r.ai_description ?? null,
      scheduled_for: r.scheduled_at ?? r.scheduled_for ?? null,
    })),
  );
  // Sorter risikable (ute/på vei ut) først.
  const rank: Record<string, number> = { published: 0, publishing: 1, scheduled: 2, approved: 3, review: 4, draft: 5 };
  hits.sort((a, b) => (rank[a.status ?? "draft"] ?? 9) - (rank[b.status ?? "draft"] ?? 9));

  return NextResponse.json({ scanned: data?.length ?? 0, suspicious: hits.length, hits });
}
