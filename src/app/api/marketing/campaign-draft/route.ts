import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { createCampaignDraft, getServiceSupabase, type CreateCampaignDraftInput } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Phase 7.1B — "Create campaign draft" fra Nexus. COPILOT: lager utkast + approval-kø, publiserer aldri. */
export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  await getRequestAccessContext(request);

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as Partial<CreateCampaignDraftInput>;
  if (!body.brandId || !body.masterIdea || !body.goal?.kind) {
    return NextResponse.json({ error: "brandId, masterIdea og goal.kind er påkrevd" }, { status: 400 });
  }

  try {
    const res = await createCampaignDraft(supabase, {
      brandId: body.brandId,
      masterIdea: body.masterIdea,
      goal: { kind: body.goal.kind, target: body.goal.target ?? 10, horizonDays: body.goal.horizonDays ?? 30 },
      focus: body.focus,
      service: body.service,
      market: body.market,
      language: body.language,
      publishingAccountId: body.publishingAccountId,
      publishingCapacityPerWeek: body.publishingCapacityPerWeek,
      // CANARY: eksplisitt legacy content_publications-rad (ingen AI-generering).
      legacyPublicationId: body.legacyPublicationId,
      channel: body.channel,
      mediaUrl: body.mediaUrl,
    });
    return NextResponse.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "campaign-draft feilet";
    // Fail-closed-tilstander (manglende brand/approval) er 409, ikke 500.
    const status = message.startsWith("MISSING_") || message.includes("APPROVAL_SERVICE_UNAVAILABLE") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
