import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import {
  OutboundDraftError,
  prepareOutboundDraft,
  type OutboundCandidateSource,
} from "@/lib/outbound-engagement/draft-preparation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const candidateId = String(body?.candidateId || "").trim();
  const source = String(body?.source || "").trim();
  if (!candidateId || !["corporate_buyer", "corporate_partner"].includes(source)) {
    return NextResponse.json({ error: "candidateId and valid source are required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await prepareOutboundDraft(supabase, {
      candidateId,
      source: source as OutboundCandidateSource,
      trigger: "manual",
    }));
  } catch (error) {
    if (error instanceof OutboundDraftError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Outbound draft preparation failed" },
      { status: 500 },
    );
  }
}
