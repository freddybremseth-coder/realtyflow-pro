import { NextRequest, NextResponse } from "next/server";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { preflightLiveCampaign, type PreflightInput } from "@/services/marketing/preflight-live-campaign";

export const dynamic = "force-dynamic";

/**
 * Phase 7.1E — kjør First Live Campaign Canary preflight på ett Content Hub-item.
 * Publiserer ALDRI (ingen Meta-call). READY_FOR_LIVE kun hvis alle kritiske
 * checks er grønne; ellers NOT_READY med årsaker.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  await getRequestAccessContext(request);

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as Partial<PreflightInput>;
  // AI-modus: contentHubItemId er valgfritt (innhold genereres i campaign-draft).
  if (!body.brandId || !body.channel || (!body.contentHubItemId && !body.aiMode)) {
    return NextResponse.json({ error: "brandId, channel og (contentHubItemId eller aiMode) er påkrevd" }, { status: 400 });
  }

  const result = await preflightLiveCampaign(
    {
      supabase,
      approvalConfigured: true, // agentic_approvals er alltid tilgjengelig via service-role
      env: {
        autopilotEnabled: process.env.MARKETING_AUTOPILOT_ENABLED !== "false",
        metaLive: process.env.MARKETING_META_LIVE === "true",
        metaToken: process.env.META_ACCESS_TOKEN,
        igUserId: process.env.META_IG_USER_ID,
        pageId: process.env.META_PAGE_ID,
        anthropicKey: process.env.ANTHROPIC_API_KEY,
      },
    },
    {
      brandId: body.brandId, channel: body.channel, contentHubItemId: body.contentHubItemId, aiMode: body.aiMode,
      mode: body.mode === "live" ? "live" : "dry_run",
      service: body.service, market: body.market, language: body.language,
      publishingAccountId: body.publishingAccountId, mediaUrl: body.mediaUrl, cta: body.cta,
    },
  );

  // NOT_READY → 200 med status i body (dette er en sjekk, ikke en feil).
  return NextResponse.json(result);
}
