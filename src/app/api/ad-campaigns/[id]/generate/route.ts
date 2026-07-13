// ─── POST /api/ad-campaigns/:id/generate  →  Step 3 batch worker ───────
//
// Designed to fit within Vercel's 60s serverless timeout.
//
// Per call:
//  1. Rescue any 'generating' row stuck > 90s back to 'pending'
//  2. Claim up to N pending rows
//  3. Submit ALL of them to Replicate immediately (no `Prefer: wait`)
//      → returns prediction IDs in ~1-2s total
//  4. Poll all submitted predictions in parallel until every one settles
//     OR the 50s soft-budget is reached (leaves 10s headroom for upload)
//  5. Download + upload completed images to Supabase Storage
//  6. Mark unfinished ones back as 'pending' so next call retries them
//
// Body: { batch_size?: number }   (default 4)
// Returns: { processed, completed_total, pending_total, failed_total, status }

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { submitPrediction, pollPrediction, extractOutputUrl } from "@/services/ads/replicate-client";
import { getOpenArtCreation, openArtGenerateImage } from "@/services/integrations/openart-client";
import { uploadThumbnail } from "@/services/storage/media";

export const maxDuration = 60;

// Soft budget — leave room for the final downloads + uploads
const HARD_TIMEOUT_MS = 50_000;
const STUCK_AFTER_MS = 90_000;
const DEFAULT_BATCH_SIZE = 4;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const t0 = Date.now();
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batch_size) || DEFAULT_BATCH_SIZE, 1), 8);
  const supabase = createServerClient();

  // ─── 1. Rescue stuck rows ──────────────────────────────────────────
  const stuckThreshold = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  await supabase
    .from("ad_creatives")
    .update({ status: "pending", replicate_prediction_id: null })
    .eq("campaign_id", params.id)
    .eq("status", "generating")
    .lt("updated_at", stuckThreshold);

  // Mark campaign as generating
  await supabase
    .from("ad_campaigns")
    .update({ status: "generating" })
    .eq("id", params.id)
    .neq("status", "completed");

  // ─── 2. Claim a batch ──────────────────────────────────────────────
  const { data: claimed, error: claimErr } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", params.id)
    .eq("status", "pending")
    .order("scene_id")
    .limit(batchSize);
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });

  if (!claimed || claimed.length === 0) {
    return await summarize(supabase, params.id);
  }

  const ids = claimed.map((c) => c.id);
  await supabase.from("ad_creatives").update({ status: "generating" }).in("id", ids);

  // Need the campaign image + provider once
  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("product_image_url, image_provider")
    .eq("id", params.id)
    .single();
  if (!campaign?.product_image_url) {
    return NextResponse.json({ error: "Campaign image URL missing" }, { status: 500 });
  }

  // Opt-in per campaign: OpenArt (credits from connected account) instead of
  // Replicate. Both are submit-then-poll, so the tracking loop is shared —
  // `replicate_prediction_id` stores the OpenArt historyId in that case.
  const useOpenArt = campaign.image_provider === "openart";

  // ─── 3. Submit ALL in parallel (no wait) ──────────────────────────
  const submissions = await Promise.allSettled(
    claimed.map((row) =>
      useOpenArt
        ? openArtGenerateImage({
            prompt: row.prompt,
            aspectRatio: row.aspect_ratio,
            sourceImageUrls: [campaign.product_image_url],
            imageCount: 1,
          }).then((historyId) => ({ row, id: historyId }))
        : submitPrediction(
            {
              prompt: row.prompt,
              input_image: campaign.product_image_url,
              aspect_ratio: row.aspect_ratio,
              output_format: "png",
            },
            0  // no wait — return prediction ID immediately
          ).then((pred) => ({ row, id: pred.id }))
    )
  );

  // Map submissions to a tracking structure
  const tracking: Array<{
    row: typeof claimed[number];
    predictionId?: string;
    finished: boolean;
    error?: string;
    outputUrl?: string;
  }> = submissions.map((s, i) => {
    if (s.status === "fulfilled") {
      return { row: s.value.row, predictionId: s.value.id, finished: false };
    }
    return {
      row: claimed[i],
      finished: true,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    };
  });

  // ─── 4. Poll loop ──────────────────────────────────────────────────
  while (timeLeft(t0) > 8_000 && tracking.some((t) => !t.finished)) {
    await sleep(3_000);
    const pending = tracking.filter((t) => !t.finished && t.predictionId);
    if (useOpenArt) {
      const polls = await Promise.allSettled(
        pending.map((p) => getOpenArtCreation(p.predictionId!).then((creation) => ({ p, creation })))
      );
      for (const r of polls) {
        if (r.status !== "fulfilled") continue;
        const { p, creation } = r.value;
        if (creation.status === "COMPLETED" && creation.urls.length > 0) {
          p.finished = true;
          p.outputUrl = creation.urls[0];
        } else if (creation.status === "FAILED" || creation.status === "CANCELLED") {
          p.finished = true;
          p.error = creation.failedReason || `OpenArt status=${creation.status}`;
        }
      }
    } else {
      const polls = await Promise.allSettled(
        pending.map((p) => pollPrediction(p.predictionId!).then((pred) => ({ p, pred })))
      );
      for (const r of polls) {
        if (r.status !== "fulfilled") continue;
        const { p, pred } = r.value;
        if (pred.status === "succeeded") {
          p.finished = true;
          p.outputUrl = extractOutputUrl(pred) ?? undefined;
          if (!p.outputUrl) p.error = "No output URL";
        } else if (pred.status === "failed" || pred.status === "canceled") {
          p.finished = true;
          p.error = pred.error || `Replicate status=${pred.status}`;
        }
      }
    }
  }

  // ─── 5. Persist results ────────────────────────────────────────────
  await Promise.all(
    tracking.map(async (t) => {
      if (t.error) {
        // Rate limiting (HTTP 429 / throttling) is transient: Replicate
        // throttles hard when the account has little/no credit. Release the
        // row back to `pending` so the next batch call retries it instead of
        // burying it as permanently failed — but keep the error text so the
        // UI can tell the user to top up credit.
        const isRateLimit = /\b429\b|rate.?limit|throttl/i.test(t.error);
        await supabase.from("ad_creatives").update({
          status: isRateLimit ? "pending" : "failed",
          error: t.error,
          replicate_prediction_id: t.predictionId ?? null,
        }).eq("id", t.row.id);
        return;
      }
      if (!t.finished || !t.outputUrl) {
        // Not done yet — release back to pending so next call retries.
        await supabase.from("ad_creatives").update({
          status: "pending",
          replicate_prediction_id: t.predictionId ?? null,
        }).eq("id", t.row.id);
        return;
      }

      try {
        const imgRes = await fetch(t.outputUrl, { signal: AbortSignal.timeout(15_000) });
        if (!imgRes.ok) throw new Error(`Download failed (${imgRes.status})`);
        const buf = Buffer.from(await imgRes.arrayBuffer());

        const path = `${params.id}/${t.row.scene_id}_${t.row.aspect_ratio.replace(":", "x")}.png`;
        const { error: upErr } = await supabase
          .storage
          .from("ad-creatives")
          .upload(path, buf, { contentType: "image/png", upsert: true });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

        const { data: pub } = supabase.storage.from("ad-creatives").getPublicUrl(path);
        const thumbnailUrl = await uploadThumbnail(supabase, buf, "image/png", path);

        await supabase.from("ad_creatives").update({
          status: "completed",
          image_url: pub.publicUrl,
          thumbnail_url: thumbnailUrl,
          source_url: t.outputUrl,
          replicate_prediction_id: t.predictionId ?? null,
        }).eq("id", t.row.id);
      } catch (e) {
        await supabase.from("ad_creatives").update({
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          replicate_prediction_id: t.predictionId ?? null,
        }).eq("id", t.row.id);
      }
    })
  );

  const rateLimited = tracking.some(
    (t) => t.error && /\b429\b|rate.?limit|throttl/i.test(t.error)
  );
  return await summarize(supabase, params.id, rateLimited);
}

// ─── helpers ─────────────────────────────────────────────────────────
function timeLeft(start: number): number {
  return Math.max(0, HARD_TIMEOUT_MS - (Date.now() - start));
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function summarize(
  supabase: ReturnType<typeof createServerClient>,
  campaignId: string,
  rateLimited = false,
) {
  const { data: rows } = await supabase
    .from("ad_creatives")
    .select("status")
    .eq("campaign_id", campaignId);
  const counts: Record<string, number> = { pending: 0, generating: 0, completed: 0, failed: 0 };
  for (const r of rows ?? []) counts[r.status] = (counts[r.status] || 0) + 1;

  const allDone = counts.pending === 0 && counts.generating === 0;
  const status = allDone
    ? counts.failed > 0 && counts.completed === 0 ? "failed" : "completed"
    : "generating";

  await supabase.from("ad_campaigns").update({
    ...(allDone ? { status } : {}),
    succeeded_count: counts.completed,
    failed_count: counts.failed,
  }).eq("id", campaignId);

  return NextResponse.json({
    completed_total: counts.completed,
    pending_total: counts.pending,
    generating_total: counts.generating,
    failed_total: counts.failed,
    status,
    rate_limited: rateLimited,
  });
}
