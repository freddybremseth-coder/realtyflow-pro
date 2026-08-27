import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { getAdminEmails } from "@/lib/admin-auth";
import { upsertNexusOpportunitySnapshot } from "@/lib/nexus-opportunity-store";
import { contactIdForOpportunity } from "@/lib/nexus-opportunity-sync";
import {
  runNexusOpportunitySync,
  scheduledNexusOpportunitySources,
} from "@/lib/nexus-opportunity-sync-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function ownerProxyHeaders() {
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  const ownerEmail = getAdminEmails()[0];
  if (!secret || !ownerEmail) return null;
  const headers = new Headers();
  headers.set("x-remaster-migration-secret", secret);
  headers.set("x-remaster-admin", ownerEmail);
  return headers;
}

export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const headers = ownerProxyHeaders();
  if (!headers) {
    return NextResponse.json({
      error: "Internal owner proxy not configured",
      required: "REALTYFLOW_MIGRATION_SECRET + at least one RealtyFlow admin email",
    }, { status: 503 });
  }

  const sources = scheduledNexusOpportunitySources(new Date());
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
      metadata: { sync_source: source, synced_by: "api/cron/nexus-opportunity-sync" },
    }),
  }, sources);

  return NextResponse.json({ ...result, schedule: { sources } });
}
