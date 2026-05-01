// ─── POST /api/ad-campaigns/:id/generate  →  Step 3 batch worker ───────
//
// Claims up to N pending creatives, submits them to Replicate's Flux
// Kontext Pro, downloads the results, uploads them to the ad-creatives
// Supabase Storage bucket, and updates each row.
//
// Vercel serverless has a 60s timeout, so this endpoint is designed to be
// CALLED REPEATEDLY by the client until status='completed'. Each call
// processes a small batch (default 4) inside the budget.
//
// Body: { batch_size?: number }   (default 4)
// Returns: { processed, completed_total, pending_total, failed_total, status }

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { submitPrediction, pollPrediction, extractOutputUrl } from "@/services/ads/replicate-client";

export const maxDuration = 60;

const MAX_CONCURRENCY = 2; // Replicate rate limit on free/standard tier

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batch_size) || 4, 1), 6);
  const supabase = createServerClient();

  // Mark campaign as generating
  await supabase
    .from("ad_campaigns")
    .update({ status: "generating" })
    .eq("id", params.id)
    .neq("status", "completed");

  // Claim a batch — atomic-enough by ordering + limit
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

  // Optimistically lock: mark these as 'generating'
  const ids = claimed.map((c) => c.id);
  await supabase.from("ad_creatives").update({ status: "generating" }).in("id", ids);

  // Run them with bounded concurrency
  const start = Date.now();
  const results = await runWithConcurrency(claimed, MAX_CONCURRENCY, async (row) => {
    const t0 = Date.now();
    try {
      const { data: campaign } = await supabase
        .from("ad_campaigns")
        .select("product_image_url")
        .eq("id", params.id)
        .single();
      if (!campaign?.product_image_url) throw new Error("Campaign image URL missing");

      let pred = await submitPrediction(
        {
          prompt: row.prompt,
          input_image: campaign.product_image_url,
          aspect_ratio: row.aspect_ratio,
          output_format: "png",
        },
        45
      );

      // Poll if not ready inside the wait window
      let polls = 0;
      while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled" && polls < 6) {
        await sleep(3000);
        pred = await pollPrediction(pred.id);
        polls++;
      }

      if (pred.status !== "succeeded") {
        throw new Error(`Replicate status=${pred.status}: ${pred.error || "unknown"}`);
      }

      const sourceUrl = extractOutputUrl(pred);
      if (!sourceUrl) throw new Error("Replicate returned no output URL");

      // Download + upload to Supabase Storage
      const imgRes = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) });
      if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());

      const path = `${params.id}/${row.scene_id}_${row.aspect_ratio.replace(":", "x")}.png`;
      const { error: upErr } = await supabase
        .storage
        .from("ad-creatives")
        .upload(path, buf, { contentType: "image/png", upsert: true });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      const { data: pub } = supabase.storage.from("ad-creatives").getPublicUrl(path);

      const seconds = Math.round((Date.now() - t0) / 100) / 10;
      await supabase.from("ad_creatives").update({
        status: "completed",
        image_url: pub.publicUrl,
        source_url: sourceUrl,
        replicate_prediction_id: pred.id,
        generation_seconds: seconds,
      }).eq("id", row.id);

      return { id: row.id, ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("ad_creatives").update({
        status: "failed",
        error: msg,
      }).eq("id", row.id);
      return { id: row.id, ok: false, error: msg };
    }
  });

  const elapsed = Math.round((Date.now() - start) / 1000);
  const summary = await summarize(supabase, params.id);
  return NextResponse.json({ ...summary, processed: results.length, elapsed_seconds: elapsed });
}

// ─── helpers ─────────────────────────────────────────────────────────
async function summarize(supabase: ReturnType<typeof createServerClient>, campaignId: string) {
  const { data: rows } = await supabase
    .from("ad_creatives")
    .select("status")
    .eq("campaign_id", campaignId);
  const counts = { pending: 0, generating: 0, completed: 0, failed: 0 };
  for (const r of rows ?? []) (counts as Record<string, number>)[r.status] = ((counts as Record<string, number>)[r.status] || 0) + 1;

  const allDone = counts.pending === 0 && counts.generating === 0;
  const status = allDone ? (counts.failed > 0 && counts.completed === 0 ? "failed" : "completed") : "generating";

  if (allDone) {
    await supabase.from("ad_campaigns").update({
      status,
      succeeded_count: counts.completed,
      failed_count: counts.failed,
    }).eq("id", campaignId);
  } else {
    await supabase.from("ad_campaigns").update({
      succeeded_count: counts.completed,
      failed_count: counts.failed,
    }).eq("id", campaignId);
  }

  return NextResponse.json({
    completed_total: counts.completed,
    pending_total: counts.pending,
    generating_total: counts.generating,
    failed_total: counts.failed,
    status,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
