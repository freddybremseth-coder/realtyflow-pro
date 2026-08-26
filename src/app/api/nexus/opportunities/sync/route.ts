import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { upsertNexusOpportunitySnapshot } from "@/lib/nexus-opportunity-store";
import {
  contactIdForOpportunity,
  normalizeOpportunitySourcePayloads,
  type NexusOpportunitySyncSource,
} from "@/lib/nexus-opportunity-sync";

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

async function fetchSource(request: NextRequest, path: string) {
  const response = await fetch(new URL(path, request.nextUrl.origin), {
    method: "GET",
    cache: "no-store",
    headers: forwardedAdminHeaders(request),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `${path} failed (${response.status})`);
  return body;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const sourceReads = await Promise.allSettled([
    fetchSource(request, "/api/revenue/today"),
    fetchSource(request, "/api/book-growth/overview"),
    fetchSource(request, "/api/saas/demosites"),
  ]);

  const payloads = {
    revenue: sourceReads[0].status === "fulfilled" ? sourceReads[0].value : null,
    books: sourceReads[1].status === "fulfilled" ? sourceReads[1].value : null,
    demosites: sourceReads[2].status === "fulfilled" ? sourceReads[2].value : null,
  };

  const sourceErrors: Partial<Record<NexusOpportunitySyncSource, string>> = {};
  if (sourceReads[0].status === "rejected") sourceErrors.real_estate = sourceReads[0].reason instanceof Error ? sourceReads[0].reason.message : String(sourceReads[0].reason);
  if (sourceReads[1].status === "rejected") sourceErrors.publishing = sourceReads[1].reason instanceof Error ? sourceReads[1].reason.message : String(sourceReads[1].reason);
  if (sourceReads[2].status === "rejected") sourceErrors.ai_demosites = sourceReads[2].reason instanceof Error ? sourceReads[2].reason.message : String(sourceReads[2].reason);

  const batches = normalizeOpportunitySourcePayloads(payloads);
  const resultBySource: Record<string, { fetched: number; normalized: number; upserted: number; errors: string[] }> = {};

  for (const batch of batches) {
    const summary = {
      fetched: batch.fetched,
      normalized: batch.opportunities.length,
      upserted: 0,
      errors: [] as string[],
    };
    if (sourceErrors[batch.source]) summary.errors.push(sourceErrors[batch.source] as string);

    const writes = await Promise.allSettled(
      batch.opportunities.map((opportunity) =>
        upsertNexusOpportunitySnapshot(supabase as never, opportunity, {
          contactId: contactIdForOpportunity(opportunity),
          lastActivityAt: opportunity.updatedAt,
          metadata: { sync_source: batch.source, synced_by: "api/nexus/opportunities/sync" },
        }),
      ),
    );

    writes.forEach((write) => {
      if (write.status === "fulfilled" && write.value.ok) summary.upserted += 1;
      else if (write.status === "fulfilled") summary.errors.push(write.value.error || "Opportunity upsert failed");
      else summary.errors.push(write.reason instanceof Error ? write.reason.message : String(write.reason));
    });

    resultBySource[batch.source] = summary;
  }

  const totals = Object.values(resultBySource).reduce(
    (acc, source) => ({
      fetched: acc.fetched + source.fetched,
      normalized: acc.normalized + source.normalized,
      upserted: acc.upserted + source.upserted,
      errors: acc.errors + source.errors.length,
    }),
    { fetched: 0, normalized: 0, upserted: 0, errors: 0 },
  );

  return NextResponse.json({
    ok: totals.errors === 0,
    generatedAt: new Date().toISOString(),
    totals,
    sources: resultBySource,
    safety: {
      archiveMissing: false,
      deleteMissing: false,
      outboundActions: false,
      note: "Sync v1 only upserts observed opportunities. Missing source rows are never auto-closed or archived.",
    },
  });
}
