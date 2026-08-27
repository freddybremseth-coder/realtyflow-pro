import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { upsertNexusOpportunitySnapshot } from "@/lib/nexus-opportunity-store";
import { contactIdForOpportunity } from "@/lib/nexus-opportunity-sync";
import { runNexusOpportunitySync } from "@/lib/nexus-opportunity-sync-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function forwardedAdminHeaders(request: NextRequest) {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const migrationSecret = request.headers.get("x-remaster-migration-secret");
  const remasterAdmin = request.headers.get("x-remaster-admin");
  if (cookie) headers.set("cookie", cookie);
  if (migrationSecret) headers.set("x-remaster-migration-secret", migrationSecret);
  if (remasterAdmin) headers.set("x-remaster-admin", remasterAdmin);
  return headers;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const headers = forwardedAdminHeaders(request);
  const result = await runNexusOpportunitySync({
    fetchSource: async (_source, path) => {
      const response = await fetch(new URL(path, request.nextUrl.origin), {
        method: "GET",
        cache: "no-store",
        headers,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `${path} failed (${response.status})`);
      return body;
    },
    upsertOpportunity: async (opportunity, source) => upsertNexusOpportunitySnapshot(supabase as never, opportunity, {
      contactId: contactIdForOpportunity(opportunity),
      lastActivityAt: opportunity.updatedAt,
      metadata: { sync_source: source, synced_by: "api/nexus/opportunities/sync" },
    }),
  }, ["real_estate", "publishing", "ai_demosites"]);

  return NextResponse.json(result);
}
