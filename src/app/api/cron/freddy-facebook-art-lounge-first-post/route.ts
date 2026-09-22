import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getTokensForBrandPlatform } from "@/lib/oauth/channels";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { REEL_BUCKET } from "@/services/pipelines/art-lounge-reels";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Explicit one-off owner approval on 2026-09-22, NOT a new daily FB
// syndication rule. The public Page is a personal umbrella; the art account
// keeps its independent daily IG schedule.
const SLOT = "2026-09-22";
const PAGE_ID = "1324025764122967";
const IG_ID = "17841424594583931";
const EXPECTED_SONG = "Sunset Serenity Instrumental";
const ATTEMPT_KEY = "freddyb:facebook:art-lounge-first-personal-story:2026-09-22";
const DESCRIPTION = [
  "Et lite innblikk i en annen side av det jeg arbeider med.",
  "",
  "Jeg har samlet kunsten min under Freddy Bremseth Art, og i Art Lounge kombinerer jeg noen av arbeidene med musikk fra Re-Master Freddy.",
  "",
  "Jeg kommer ikke til å legge alle kunstinnleggene ut her på Facebook. Denne siden skal fortsatt være den samlede siden min, men innimellom vil jeg dele arbeider jeg selv synes er interessante å trekke frem.",
  "",
  "Denne Art Lounge-videoen viser tre av verkene fra galleriet, med Sunset Serenity Instrumental som lydspor.",
  "",
  "🎨 Se mer: https://art.freddybremseth.com",
  "",
  "📷 Følg kunsten: @freddybremseth.art",
].join("\n");

type ReelResponse = {
  video_id?: string;
  upload_url?: string;
  success?: boolean;
  error?: { message?: string; code?: number };
};

const graphUrl = `https://graph.facebook.com/v25.0/${PAGE_ID}/video_reels`;

async function graphPhase(accessToken: string, values: Record<string, string>) {
  const res = await fetch(graphUrl, {
    method: "POST",
    body: new URLSearchParams({ ...values, access_token: accessToken }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as ReelResponse;
  if (!res.ok || data.error) {
    const message = String(data.error?.message ?? `HTTP ${res.status}`);
    throw new Error(`FACEBOOK_REEL_GRAPH_REJECTED: ${message}`);
  }
  return data;
}

/** One owned-account native Facebook Reel with a distinct, owner-provided
 * personal caption. At-most-once external publish (DB unique ledger before
 * START; ambiguous outcomes are manual-review, never blind retries).
 */
export async function GET(request: NextRequest) {
  const denied = await requireNexusSchedulerApi(request);
  if (denied) return denied;
  const safe = await evaluateCronSafeMode("/api/cron/freddy-facebook-art-lounge-first-post");
  if (safe.skip) return NextResponse.json({ skipped: true, reason: safe.reason });
  const db = getServiceSupabase();
  if (!db) return NextResponse.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });
  if (process.env.MARKETING_META_LIVE !== "true")
    return NextResponse.json({ skipped: true, reason: "MARKETING_META_LIVE_DISABLED" });

  const { data: prior, error: priorError } = await db.from("marketing_publish_attempts")
    .select("status,external_id,error")
    .eq("idempotency_key", ATTEMPT_KEY).maybeSingle();
  if (priorError) return NextResponse.json({ error: "ATTEMPT_LOOKUP_FAILED" }, { status: 503 });
  if (prior) return NextResponse.json({
    skipped: true,
    reason: prior.status === "posted" ? "ONE_OFF_FACEBOOK_REEL_ALREADY_PUBLISHED" : "ONE_OFF_FACEBOOK_REEL_ALREADY_STARTED_REVIEW_STATE",
    state: prior.status, externalId: prior.external_id ?? null,
  });

  // Preflight: the exact published art Instagram Reel, music and rendered
  // source must match the one the owner explicitly approved for Facebook.
  const { data: job, error: jobError } = await db.from("art_lounge_reel_jobs")
    .select("id,slot_date,state,video_path,song_title,artwork")
    .eq("slot_date", SLOT).maybeSingle();
  if (jobError || !job || job.state !== "ready"
      || job.video_path !== `${SLOT}.mp4`
      || job.song_title !== EXPECTED_SONG
      || !Array.isArray(job.artwork) || job.artwork.length !== 3)
    return NextResponse.json({ skipped: true, reason: "APPROVED_ART_LOUNGE_VIDEO_NOT_VERIFIED" });
  const { data: igDelivery, error: igError } = await db.from("art_lounge_reel_deliveries")
    .select("state,external_id").eq("job_id", job.id).eq("channel", "instagram").maybeSingle();
  if (igError || igDelivery?.state !== "posted" || !igDelivery.external_id)
    return NextResponse.json({ skipped: true, reason: "ART_INSTAGRAM_POST_NOT_CONFIRMED" });

  const { data: plan, error: planError } = await db.from("marketing_brand_growth_plans")
    .select("status,autonomy_mode").eq("brand_id", "freddyb").maybeSingle();
  if (planError || plan?.status !== "active" || plan.autonomy_mode !== "approval_required")
    return NextResponse.json({ skipped: true, reason: "PERSONAL_UMBRELLA_APPROVAL_POLICY_CHANGED" });

  let fb: Awaited<ReturnType<typeof getTokensForBrandPlatform>>;
  let ig: Awaited<ReturnType<typeof getTokensForBrandPlatform>>;
  try {
    [fb, ig] = await Promise.all([
      getTokensForBrandPlatform("freddyb", "facebook"),
      getTokensForBrandPlatform("freddyart", "instagram"),
    ]);
  } catch {
    return NextResponse.json({ skipped: true, reason: "CANONICAL_META_BINDING_AMBIGUOUS" });
  }
  if (!fb?.tokens.accessToken || fb.channel.external_id !== PAGE_ID
      || !ig?.tokens.accessToken || ig.channel.external_id !== IG_ID)
    return NextResponse.json({ skipped: true, reason: "EXPECTED_FACEBOOK_OR_ART_INSTAGRAM_MISSING" });

  const videoUrl = db.storage.from(REEL_BUCKET).getPublicUrl(job.video_path).data.publicUrl;
  if (!videoUrl.startsWith("https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/art-lounge-reels/")
      || !videoUrl.endsWith("/2026-09-22.mp4"))
    return NextResponse.json({ error: "UNEXPECTED_ART_VIDEO_CDN" }, { status: 503 });

  // Insert BEFORE any Graph side effect. Even concurrent cron invocations
  // cannot POST the Reel twice thanks to the UNIQUE idempotency key.
  const { data: claimed, error: insertError } = await db.from("marketing_publish_attempts").insert({
    idempotency_key: ATTEMPT_KEY,
    publication_id: "freddyb-art-lounge-welcome-2026-09-22",
    content_id: "freddyb-art-lounge-welcome-2026-09-22",
    channel: "facebook", media_type: "reel",
    status: "reserved", dry_run: false,
  }).select("id").maybeSingle();
  if (insertError || !claimed)
    return NextResponse.json({ skipped: true, reason: "ONE_OFF_REEL_ATTEMPT_ALREADY_CLAIMED_OR_UNAVAILABLE" });

  let phase = "claimed";
  try {
    const token = fb.tokens.accessToken;
    const init = await graphPhase(token, { upload_phase: "start" });
    if (!init.video_id || !init.upload_url) throw new Error("FACEBOOK_REEL_START_NO_ID_OR_UPLOAD_URL");
    const upload = new URL(init.upload_url);
    if (upload.protocol !== "https:" || upload.hostname !== "rupload.facebook.com"
        || !upload.pathname.startsWith("/video-upload/"))
      throw new Error("FACEBOOK_REEL_UPLOAD_URL_UNTRUSTED");

    // Store the Meta video_id as soon as it is returned for manual recovery.
    const { error: containerError } = await db.from("marketing_publish_attempts").update({
      status: "container_created", container_id: init.video_id,
      updated_at: new Date().toISOString(),
    }).eq("idempotency_key", ATTEMPT_KEY).eq("status", "reserved");
    if (containerError) throw new Error("FACEBOOK_REEL_CONTAINER_LEDGER_WRITE_FAILED");
    phase = "container_created";

    const res = await fetch(upload.toString(), {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
      cache: "no-store",
    });
    const uploaded = (await res.json().catch(() => ({}))) as ReelResponse;
    if (!res.ok || uploaded.success !== true)
      throw new Error(`FACEBOOK_REEL_CDN_UPLOAD_FAILED: ${uploaded.error?.message ?? res.status}`);
    phase = "uploaded";

    // No second FINISH attempt on ambiguity. Mark publishing before Graph.
    const { error: publishingError } = await db.from("marketing_publish_attempts").update({
      status: "publishing", updated_at: new Date().toISOString(),
    }).eq("idempotency_key", ATTEMPT_KEY).eq("status", "container_created");
    if (publishingError) throw new Error("FACEBOOK_REEL_FINISH_LEDGER_WRITE_FAILED");
    phase = "finishing";

    const finish = await graphPhase(token, {
      upload_phase: "finish", video_id: init.video_id,
      video_state: "PUBLISHED", title: "Art Lounge – Freddy Bremseth Art",
      description: DESCRIPTION,
    });
    if (finish.success !== true) throw new Error("FACEBOOK_REEL_FINISH_UNCONFIRMED");
    phase = "finish_succeeded";
    const { error: savedError } = await db.from("marketing_publish_attempts").update({
      status: "posted", external_id: init.video_id, external_media_id: init.video_id,
      error: null, updated_at: new Date().toISOString(),
    }).eq("idempotency_key", ATTEMPT_KEY).eq("status", "publishing");
    if (savedError) throw new Error("FACEBOOK_REEL_POSTED_BUT_LEDGER_WRITE_FAILED");

    return NextResponse.json({
      success: true, posted: true, channel: "facebook", brandId: "freddyb",
      externalId: init.video_id, videoUrl: `https://www.facebook.com/reel/${init.video_id}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "FACEBOOK_REEL_RESULT_UNKNOWN";
    // Even if Meta accepted FINISH but our response was lost, retrying it
    // could duplicate user-visible content. Preserve ID and stop here.
    await db.from("marketing_publish_attempts").update({
      status: "manual_review",
      error: `stage=${phase}; ${message}`.slice(0,700),
      updated_at: new Date().toISOString(),
    }).eq("idempotency_key", ATTEMPT_KEY)
      .in("status", ["reserved", "container_created", "publishing"]);
    return NextResponse.json({
      success: false, state: "manual_review", phase, error: message,
      note: "Do not retry external Facebook POST without checking the recorded Meta video ID.",
    }, { status: 502 });
  }
}
