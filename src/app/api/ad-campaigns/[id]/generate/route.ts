// ─── POST /api/ad-campaigns/:id/generate  →  multi-provider batch worker ──
// Gemini completes synchronously; OpenArt and Flux submit and poll.
// Completed creatives are persisted to ad_creatives, Storage and Media Library.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestAccessContext } from "@/lib/api-admin";
import { getMediaAccessScope } from "@/services/media/organization";
import {
  ensureAdCampaignMediaProject,
  persistAdCreativeImage,
} from "@/services/ads/asset-persistence";
import {
  pollAdProvider,
  submitAdProviderWithFallback,
  type ConcreteAdProvider,
} from "@/services/ads/provider-engine";

export const maxDuration = 180;

const HARD_TIMEOUT_MS = 155_000;
const STUCK_AFTER_MS = 5 * 60_000;
const DEFAULT_BATCH_SIZE = 3;

interface TrackingItem {
  row: Record<string, any>;
  provider: ConcreteAdProvider;
  model: string;
  providerJobId?: string;
  finished: boolean;
  sourceUrl?: string;
  bytes?: Buffer;
  mimeType?: string;
  fallbackFrom?: ConcreteAdProvider;
  error?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeLeft(startedAt: number) {
  return Math.max(0, HARD_TIMEOUT_MS - (Date.now() - startedAt));
}

function normalizeProvider(value: unknown, campaignMode: unknown): ConcreteAdProvider {
  const provider = String(value || "").toLowerCase();
  if (provider === "gemini" || provider === "openart" || provider === "flux") return provider;
  const mode = String(campaignMode || "").toLowerCase();
  if (mode === "gemini" || mode === "openart" || mode === "flux") return mode;
  if (mode === "replicate") return "flux";
  return "openart";
}

function isRateLimitError(message: string) {
  return /\b429\b|rate.?limit|throttl|quota|insufficient.*credit|billing/i.test(message);
}

async function resolveMediaIdentity(req: NextRequest, supabase: ReturnType<typeof createServerClient>, campaign: Record<string, any>) {
  const access = await getRequestAccessContext(req).catch(() => null);
  if (access) {
    try {
      const scope = await getMediaAccessScope(supabase, access);
      return { organizationId: scope.organizationId, actorEmail: scope.actorEmail };
    } catch {
      // Ad generation may still complete even if Media Library scope is unavailable.
    }
  }
  return {
    organizationId: campaign.tenant_id ? String(campaign.tenant_id) : null,
    actorEmail: access?.email || "ad-campaign-generator",
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batch_size) || DEFAULT_BATCH_SIZE, 1), 5);
  const supabase = createServerClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (!campaign.product_image_url) {
    return NextResponse.json({ error: "Campaign image URL missing" }, { status: 400 });
  }

  const stuckThreshold = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  await supabase
    .from("ad_creatives")
    .update({ status: "pending" })
    .eq("campaign_id", params.id)
    .eq("status", "generating")
    .lt("updated_at", stuckThreshold);

  await supabase
    .from("ad_campaigns")
    .update({ status: "generating", error: null })
    .eq("id", params.id)
    .neq("status", "completed");

  const { data: claimed, error: claimError } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", params.id)
    .eq("status", "pending")
    .order("concept_group", { ascending: true })
    .order("variant_index", { ascending: true })
    .limit(batchSize);
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed?.length) return summarize(supabase, params.id);

  const ids = claimed.map((row) => row.id);
  await supabase
    .from("ad_creatives")
    .update({ status: "generating", error: null })
    .in("id", ids);

  const identity = await resolveMediaIdentity(req, supabase, campaign);
  let mediaProjectId: string | null = campaign.media_project_id || null;
  if (identity.organizationId && !mediaProjectId) {
    mediaProjectId = await ensureAdCampaignMediaProject(supabase, {
      organizationId: identity.organizationId,
      actorEmail: identity.actorEmail,
      campaign,
    }).catch(() => null);
    if (mediaProjectId) campaign.media_project_id = mediaProjectId;
  }

  const resumable = claimed.filter((row) => row.provider_job_id || row.replicate_prediction_id);
  const fresh = claimed.filter((row) => !(row.provider_job_id || row.replicate_prediction_id));
  const allowFallback = campaign.image_provider === "auto";

  const submissions = await Promise.allSettled(fresh.map(async (row) => {
    const requestedProvider = normalizeProvider(row.provider, campaign.image_provider);
    const result = await submitAdProviderWithFallback({
      provider: requestedProvider,
      prompt: row.prompt,
      productImageUrl: campaign.product_image_url,
      aspectRatio: row.aspect_ratio,
      model: row.model,
      qualityTier: requestedProvider === "flux" ? "premium" : "balanced",
    }, allowFallback);
    return { row, requestedProvider, result };
  }));

  const tracking: TrackingItem[] = resumable.map((row) => ({
    row,
    provider: normalizeProvider(row.provider, campaign.image_provider),
    model: row.model || "unknown",
    providerJobId: String(row.provider_job_id || row.replicate_prediction_id),
    finished: false,
  }));

  for (let index = 0; index < submissions.length; index += 1) {
    const submission = submissions[index];
    const row = fresh[index];
    if (submission.status === "rejected") {
      tracking.push({
        row,
        provider: normalizeProvider(row.provider, campaign.image_provider),
        model: row.model || "unknown",
        finished: true,
        error: submission.reason instanceof Error ? submission.reason.message : String(submission.reason),
      });
      continue;
    }

    const { result } = submission.value;
    const fallbackFrom = "fallbackFrom" in result ? result.fallbackFrom : undefined;
    if (result.state === "completed") {
      tracking.push({
        row,
        provider: result.provider,
        model: result.model,
        bytes: result.bytes,
        mimeType: result.mimeType,
        fallbackFrom,
        finished: true,
      });
    } else {
      tracking.push({
        row,
        provider: result.provider,
        model: result.model,
        providerJobId: result.providerJobId,
        fallbackFrom,
        finished: false,
      });
      await supabase
        .from("ad_creatives")
        .update({
          provider: result.provider,
          model: result.model,
          provider_job_id: result.providerJobId,
          replicate_prediction_id: result.providerJobId,
          metadata_json: {
            ...(row.metadata_json || {}),
            fallbackFrom: fallbackFrom || null,
            submittedAt: new Date().toISOString(),
          },
        })
        .eq("id", row.id);
    }
  }

  while (timeLeft(startedAt) > 25_000 && tracking.some((item) => !item.finished)) {
    await sleep(3_000);
    const pending = tracking.filter((item) => !item.finished && item.providerJobId);
    const polls = await Promise.allSettled(
      pending.map(async (item) => ({ item, result: await pollAdProvider(item.provider, item.providerJobId!) })),
    );

    for (const poll of polls) {
      if (poll.status !== "fulfilled") continue;
      const { item, result } = poll.value;
      if (result.state === "completed") {
        item.finished = true;
        item.sourceUrl = result.sourceUrl;
      } else if (result.state === "failed") {
        item.finished = true;
        item.error = result.error;
      }
    }
  }

  await Promise.all(tracking.map(async (item) => {
    if (item.error) {
      const retryable = isRateLimitError(item.error);
      await supabase
        .from("ad_creatives")
        .update({
          status: retryable ? "pending" : "failed",
          provider: item.provider,
          model: item.model,
          provider_job_id: item.providerJobId || null,
          replicate_prediction_id: item.providerJobId || null,
          error: item.error,
          metadata_json: {
            ...(item.row.metadata_json || {}),
            fallbackFrom: item.fallbackFrom || null,
            lastErrorAt: new Date().toISOString(),
          },
        })
        .eq("id", item.row.id);
      return;
    }

    if (!item.finished) {
      await supabase
        .from("ad_creatives")
        .update({
          status: "pending",
          provider: item.provider,
          model: item.model,
          provider_job_id: item.providerJobId || null,
          replicate_prediction_id: item.providerJobId || null,
        })
        .eq("id", item.row.id);
      return;
    }

    try {
      await persistAdCreativeImage(supabase, {
        organizationId: identity.organizationId,
        actorEmail: identity.actorEmail,
        campaign,
        creative: item.row,
        provider: item.provider,
        model: item.model,
        bytes: item.bytes,
        sourceUrl: item.sourceUrl,
        mimeType: item.mimeType,
        fallbackFrom: item.fallbackFrom,
        mediaProjectId,
      });
    } catch (error) {
      await supabase
        .from("ad_creatives")
        .update({
          status: "failed",
          provider: item.provider,
          model: item.model,
          provider_job_id: item.providerJobId || null,
          replicate_prediction_id: item.providerJobId || null,
          error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", item.row.id);
    }
  }));

  const rateLimited = tracking.some((item) => item.error && isRateLimitError(item.error));
  return summarize(supabase, params.id, rateLimited);
}

async function summarize(
  supabase: ReturnType<typeof createServerClient>,
  campaignId: string,
  rateLimited = false,
) {
  const { data: rows } = await supabase
    .from("ad_creatives")
    .select("status,provider")
    .eq("campaign_id", campaignId);

  const counts: Record<string, number> = { pending: 0, generating: 0, completed: 0, failed: 0 };
  const providers: Record<string, number> = {};
  for (const row of rows || []) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    if (row.provider) providers[row.provider] = (providers[row.provider] || 0) + 1;
  }

  const allDone = counts.pending === 0 && counts.generating === 0;
  const status = allDone
    ? counts.failed > 0 && counts.completed === 0 ? "failed" : "completed"
    : "generating";

  await supabase
    .from("ad_campaigns")
    .update({
      ...(allDone ? { status } : {}),
      succeeded_count: counts.completed,
      failed_count: counts.failed,
      provider_strategy: {
        providers,
        lastBatchAt: new Date().toISOString(),
      },
    })
    .eq("id", campaignId);

  return NextResponse.json({
    completed_total: counts.completed,
    pending_total: counts.pending,
    generating_total: counts.generating,
    failed_total: counts.failed,
    provider_counts: providers,
    status,
    rate_limited: rateLimited,
  });
}
