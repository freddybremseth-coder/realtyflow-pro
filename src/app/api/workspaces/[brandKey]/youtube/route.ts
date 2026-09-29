import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { getTokensForBrandPlatform } from "@/lib/oauth/channels";
import { getChannelInfo, listVideos, uploadVideo } from "@/services/integrations/youtube-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const BRAND = "zeneco";
const BUCKET = "remaster-reels";
const publishSchema = z.object({ jobId: z.string().uuid() }).strict();
const noStore = { "Cache-Control": "private, no-store" };

function fail(status: number, code: string, message?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: { code, message }, ...extra }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

async function resolveYoutubeChannel() {
  try {
    const connection = await getTokensForBrandPlatform(BRAND, "youtube");
    if (!connection || connection.channel.brand_id !== BRAND || !connection.channel.is_active) {
      return { connected: false as const, reason: "Zen Eco Homes har ingen aktiv YouTube-kanal i RealtyFlow." };
    }
    if (!connection.tokens.refreshToken) {
      return { connected: false as const, reason: "YouTube-tilkoblingen mangler refresh token og må kobles til på nytt." };
    }
    const scopes = connection.tokens.scopes || [];
    if (!scopes.some(scope => [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube",
    ].includes(scope))) {
      return { connected: false as const, reason: "YouTube-tilkoblingen mangler opplastingsrettighet." };
    }
    const live = await getChannelInfo(BRAND, { requireBrandToken: true });
    if (!live?.id || live.id !== connection.channel.external_id) {
      return { connected: false as const, reason: "YouTube OAuth peker på en annen kanal enn den verifiserte Zen-kanalen." };
    }
    return {
      connected: true as const,
      channel: connection.channel,
      live,
    };
  } catch (error) {
    return {
      connected: false as const,
      reason: error instanceof Error
        ? error.message
        : "YouTube-kanalen kunne ikke verifiseres. Koble Zen-kanalen til på nytt.",
    };
  }
}

function safeDescription(caption: string) {
  const website = "https://zenecohomes.com/";
  const clean = String(caption || "").trim();
  if (clean.toLowerCase().includes("zenecohomes.com")) return clean.slice(0, 4900);
  return (clean + "\n\nSe mer: " + website).slice(0, 4900);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (params.brandKey !== BRAND) return fail(404, "YOUTUBE_NOT_AVAILABLE_FOR_BRAND");
  const access = await requireBrandWorkspace(request, BRAND, "youtube.read");
  if (!access.value) return access.response;
  const supabase = access.value.supabase;

  const [{ data: jobs, error: jobsError }, channelState] = await Promise.all([
    supabase.from("remaster_reel_jobs")
      .select("id,title,duration_seconds,state,video_path,caption,created_at,updated_at")
      .eq("brand", BRAND)
      .eq("state", "ready")
      .order("created_at", { ascending: false })
      .limit(25),
    resolveYoutubeChannel(),
  ]);
  if (jobsError) return fail(503, "YOUTUBE_REELS_UNAVAILABLE");

  const jobIds = (jobs || []).map(row => row.id);
  const deliveryResult = jobIds.length
    ? await supabase.from("remaster_reel_deliveries")
        .select("reel_id,state,external_id,external_url,error,updated_at")
        .eq("channel", "youtube")
        .in("reel_id", jobIds)
    : { data: [], error: null };
  if (deliveryResult.error) return fail(503, "YOUTUBE_DELIVERY_HISTORY_UNAVAILABLE");

  const deliveryByReel = new Map<string, unknown>();
  for (const delivery of deliveryResult.data || []) {
    deliveryByReel.set(delivery.reel_id, {
      state: delivery.state,
      externalId: delivery.external_id || null,
      externalUrl: delivery.external_url || null,
      error: delivery.error || null,
      updatedAt: delivery.updated_at || null,
    });
  }

  let videos: unknown[] = [];
  if (channelState.connected) {
    try {
      videos = await listVideos(12, BRAND, { requireBrandToken: true });
    } catch {
      videos = [];
    }
  }

  return NextResponse.json({
    ok: true,
    brand: BRAND,
    channel: channelState.connected ? {
      connected: true,
      account: channelState.channel.display_name,
      channelId: channelState.channel.external_id,
      subscriberCount: channelState.live.subscriberCount || 0,
      viewCount: channelState.live.viewCount || 0,
      videoCount: channelState.live.videoCount || 0,
      reason: "",
    } : {
      connected: false,
      account: null,
      channelId: null,
      subscriberCount: 0,
      viewCount: 0,
      videoCount: 0,
      reason: channelState.reason,
    },
    videos,
    reels: (jobs || []).map(row => ({
      id: row.id,
      title: row.title,
      durationSeconds: row.duration_seconds,
      caption: row.caption || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      videoUrl: row.video_path === row.id + ".mp4"
        ? supabase.storage.from(BUCKET).getPublicUrl(row.video_path).data.publicUrl
        : null,
      youtubeDelivery: deliveryByReel.get(row.id) || null,
    })),
  }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  if (params.brandKey !== BRAND) return fail(404, "YOUTUBE_NOT_AVAILABLE_FOR_BRAND");
  const access = await requireBrandWorkspace(request, BRAND, "youtube.publish");
  if (!access.value) return access.response;
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");

  const parsed = publishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "INVALID_YOUTUBE_PUBLISH_REQUEST");
  const supabase = access.value.supabase;

  const { data: job, error: jobError } = await supabase.from("remaster_reel_jobs")
    .select("id,brand,title,state,video_path,caption")
    .eq("id", parsed.data.jobId)
    .eq("brand", BRAND)
    .maybeSingle();
  if (jobError || !job) return fail(404, "YOUTUBE_REEL_NOT_FOUND");
  if (job.state !== "ready" || job.video_path !== job.id + ".mp4" || !job.caption) {
    return fail(409, "YOUTUBE_REEL_NOT_READY", "Reelen må være ferdig og forhåndsvises før den kan publiseres.");
  }

  const channelState = await resolveYoutubeChannel();
  if (!channelState.connected) {
    return fail(409, "YOUTUBE_CHANNEL_NOT_READY", channelState.reason);
  }

  const { data: reservation, error: reserveError } = await supabase.from("remaster_reel_deliveries").insert({
    reel_id: job.id,
    channel: "youtube",
    brand_id: BRAND,
    social_channel_id: channelState.channel.id,
    state: "publishing",
    created_by: access.value.verifiedEmail,
  }).select("id").single();

  if (reserveError || !reservation) {
    const { data: existing } = await supabase.from("remaster_reel_deliveries")
      .select("state,external_id,external_url,error,updated_at")
      .eq("reel_id", job.id)
      .eq("channel", "youtube")
      .maybeSingle();
    if (existing) {
      return fail(409, "YOUTUBE_PUBLISH_ALREADY_ATTEMPTED",
        "Denne Reelen har allerede et YouTube-forsøk. Kontroller status før du gjør et nytt forsøk.",
        { delivery: existing });
    }
    return fail(503, "YOUTUBE_PUBLISH_RESERVATION_FAILED");
  }

  try {
    const { data: download, error: downloadError } = await supabase.storage.from(BUCKET).download(job.video_path);
    if (downloadError || !download) {
      throw new Error("REEL_MP4_DOWNLOAD_FAILED: " + (downloadError?.message || "no media"));
    }
    const buffer = Buffer.from(await download.arrayBuffer());
    if (buffer.length < 20_000 || buffer.length > 80 * 1024 * 1024) {
      throw new Error("REEL_MP4_SIZE_INVALID");
    }

    const result = await uploadVideo(buffer, {
      title: String(job.title).slice(0, 100),
      description: safeDescription(String(job.caption)),
      tags: ["Zen Eco Homes", "Costa Blanca", "Spain Property", "Shorts"],
      categoryId: "22",
      privacyStatus: "public",
    }, BRAND, {
      requireBrandToken: true,
      expectedChannelId: channelState.channel.external_id,
      singleInsertAttempt: true,
    });

    if (!result.videoId || result.channelId !== channelState.channel.external_id) {
      throw new Error("YOUTUBE_PUBLISHED_CHANNEL_UNCONFIRMED");
    }

    const { error: receiptError } = await supabase.from("remaster_reel_deliveries").update({
      state: "published",
      external_id: result.videoId,
      external_url: result.videoUrl,
      error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", reservation.id).eq("state", "publishing");
    if (receiptError) {
      throw new Error("VIDEO_PUBLISHED_BUT_DELIVERY_RECEIPT_SAVE_FAILED: " + receiptError.message);
    }

    return NextResponse.json({
      ok: true,
      account: channelState.channel.display_name,
      externalId: result.videoId,
      externalUrl: result.videoUrl,
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unconfirmed YouTube publication";
    await supabase.from("remaster_reel_deliveries").update({
      state: "needs_review",
      error: message.slice(0, 600),
      updated_at: new Date().toISOString(),
    }).eq("id", reservation.id).eq("state", "publishing");

    return fail(502, "YOUTUBE_PUBLICATION_UNCONFIRMED",
      "Publiseringen er ikke bekreftet. Kontroller Zen-kanalen før du forsøker igjen. " + message.slice(0, 220));
  }
}
