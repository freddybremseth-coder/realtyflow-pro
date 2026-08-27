import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { createAdminSession, getAdminEmails } from "@/lib/admin-auth";
import { bestEffortNexusAutomationAudit } from "@/lib/nexus-automation-audit";
import { nexusInternalApiErrorMessage } from "@/lib/nexus-internal-api-error";
import {
  loadAiDemositesOpportunityPayload,
  loadRealEstateOpportunityPayload,
} from "@/lib/nexus-opportunity-direct-readers";
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

async function internalOwnerHeaders() {
  const ownerEmail = getAdminEmails()[0];
  if (!ownerEmail) return null;
  try {
    const session = await createAdminSession(ownerEmail, "OWNER");
    const headers = new Headers();
    headers.set("cookie", `realtyflow_admin=${session}`);
    return headers;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;

  const startedAt = new Date().toISOString();
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const sources = scheduledNexusOpportunitySources(new Date());
  let publishingHeaders: Headers | null | undefined;

  const result = await runNexusOpportunitySync({
    fetchSource: async (source, path) => {
      if (source === "real_estate") {
        return loadRealEstateOpportunityPayload(supabase);
      }
      if (source === "ai_demosites") {
        return loadAiDemositesOpportunityPayload(supabase);
      }

      if (publishingHeaders === undefined) publishingHeaders = await internalOwnerHeaders();
      if (!publishingHeaders) {
        throw new Error("Publishing source requires an internal owner session, but one could not be created");
      }

      const response = await fetch(new URL(path, request.nextUrl.origin), {
        method: "GET",
        cache: "no-store",
        headers: publishingHeaders,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(nexusInternalApiErrorMessage(path, response.status, body));
      return body;
    },
    upsertOpportunity: async (opportunity, source) => upsertNexusOpportunitySnapshot(supabase as never, opportunity, {
      contactId: contactIdForOpportunity(opportunity),
      lastActivityAt: opportunity.updatedAt,
      metadata: { sync_source: source, synced_by: "api/cron/nexus-opportunity-sync" },
    }),
  }, sources);

  const audit = await bestEffortNexusAutomationAudit(supabase as never, {
    name: "Nexus Opportunity Sync",
    path: "/api/cron/nexus-opportunity-sync",
    status: result.ok ? "success" : "error",
    input: { sources, directSources: ["real_estate", "ai_demosites"], publishingViaInternalApi: sources.includes("publishing") },
    output: {
      totals: result.totals,
      sources: result.sources,
      safety: result.safety,
    },
    error: result.ok ? null : `${result.totals.errors} sync error(s)`,
    startedAt,
    finishedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ...result, schedule: { sources }, audit });
}
