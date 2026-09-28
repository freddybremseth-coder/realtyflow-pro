import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { getTokensForBrandPlatform } from "@/lib/oauth/channels";
import { makeGraphApi, makeMetaPublisher } from "@/services/marketing/publishers/meta-publisher";
import { publishFacebookPageReel } from "@/services/pipelines/remaster-facebook-reel-publisher";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const allowedBrands = new Set(["zeneco", "pinosoecolife"]);
const publishSchema = z.object({
  jobId: z.string().uuid(),
  channel: z.enum(["instagram", "facebook"]),
}).strict();
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

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const { brandKey } = params;
  if (!allowedBrands.has(brandKey)) return fail(404, "REELS_NOT_AVAILABLE_FOR_BRAND");
  const access = await requireBrandWorkspace(request, brandKey, "reels.publish");
  if (!access.value) return access.response;
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");

  const parsed = publishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "INVALID_REEL_PUBLISH_REQUEST");
  const { jobId, channel } = parsed.data;
  const supabase = access.value.supabase;

  const { data: job, error: jobError } = await supabase.from("remaster_reel_jobs")
    .select("id,brand,title,state,video_path,caption,channels")
    .eq("id", jobId).eq("brand", brandKey).maybeSingle();
  if (jobError || !job) return fail(404, "REEL_NOT_FOUND");
  if (job.state !== "ready" || job.video_path !== jobId + ".mp4" || !job.caption) {
    return fail(409, "REEL_NOT_READY", "Reelen må være ferdig og forhåndsvises før publisering.");
  }
  if (!Array.isArray(job.channels) || !job.channels.includes(channel)) {
    return fail(409, "REEL_CHANNEL_NOT_PLANNED", "Kanalen ble ikke valgt da Reelen ble laget.");
  }

  let connection: Awaited<ReturnType<typeof getTokensForBrandPlatform>>;
  try {
    connection = await getTokensForBrandPlatform(brandKey, channel);
  } catch {
    return fail(409, "REEL_CHANNEL_AMBIGUOUS", "Merkevaren har flere eller uleselige kanaltilkoblinger.");
  }
  if (!connection || connection.channel.brand_id !== brandKey || !connection.channel.is_active) {
    return fail(409, "REEL_CHANNEL_NOT_CONNECTED", "Ingen aktiv kanal er koblet til denne merkevaren.");
  }
  const scopes = connection.tokens.scopes || [];
  if (channel === "facebook" && !scopes.includes("pages_manage_posts")) {
    return fail(409, "REEL_CHANNEL_SCOPE_MISSING", "Facebook-tilkoblingen mangler publiseringsrettighet.");
  }
  if (channel === "instagram" &&
      !scopes.some(scope => ["instagram_content_publish", "instagram_business_content_publish"].includes(scope))) {
    return fail(409, "REEL_CHANNEL_SCOPE_MISSING", "Instagram-tilkoblingen mangler publiseringsrettighet.");
  }

  const { data: reservation, error: reserveError } = await supabase.from("remaster_reel_deliveries").insert({
    reel_id: jobId,
    channel,
    brand_id: brandKey,
    social_channel_id: connection.channel.id,
    state: "publishing",
    created_by: access.value.verifiedEmail,
  }).select("id").single();

  if (reserveError || !reservation) {
    const { data: existing } = await supabase.from("remaster_reel_deliveries")
      .select("channel,state,external_id,external_url,error,updated_at")
      .eq("reel_id", jobId).eq("channel", channel).maybeSingle();
    if (existing) {
      return fail(409, "REEL_PUBLISH_ALREADY_ATTEMPTED",
        "Denne Reelen har allerede et publiseringsforsøk på kanalen. Kontroller status før nytt forsøk.",
        { delivery: existing });
    }
    return fail(503, "REEL_PUBLISH_RESERVATION_FAILED");
  }

  const publicUrl = supabase.storage.from("remaster-reels").getPublicUrl(job.video_path).data.publicUrl;
  if (!publicUrl.startsWith("https://") || !publicUrl.includes("/storage/v1/object/public/remaster-reels/")) {
    await supabase.from("remaster_reel_deliveries").update({
      state: "needs_review", error: "REEL_VIDEO_URL_INVALID", updated_at: new Date().toISOString(),
    }).eq("id", reservation.id).eq("state", "publishing");
    return fail(502, "REEL_VIDEO_URL_INVALID");
  }

  const publicationId = "workspace-reel:" + jobId + ":" + channel;
  try {
    let externalId = "";
    let externalUrl = "";
    if (channel === "instagram") {
      const publisher = makeMetaPublisher({
        supabase: supabase as any,
        graph: makeGraphApi(connection.tokens.accessToken),
        igUserId: connection.channel.external_id,
        live: true,
      });
      const result = await publisher.publish({
        contentId: publicationId,
        channel: "instagram",
        headline: "",
        body: String(job.caption),
        cta: "",
        media: { videoUrl: publicUrl, mediaType: "reel" },
      } as any, {
        idempotencyKey: publicationId,
        publicationId,
        accountId: connection.channel.external_id,
        channel: "instagram",
      });
      if (result.dryRun || result.state !== "published" || !result.externalId) {
        throw new Error("INSTAGRAM_PUBLICATION_UNCONFIRMED");
      }
      externalId = result.externalId;
    } else {
      const posted = await publishFacebookPageReel({
        pageId: connection.channel.external_id,
        accessToken: connection.tokens.accessToken,
        videoUrl: publicUrl,
        title: String(job.title),
        description: String(job.caption),
      });
      externalId = posted.videoId;
      externalUrl = posted.videoUrl;
    }

    const { error: receiptError } = await supabase.from("remaster_reel_deliveries").update({
      state: "published",
      external_id: externalId,
      external_url: externalUrl,
      error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", reservation.id).eq("state", "publishing");
    if (receiptError) throw new Error("VIDEO_PUBLISHED_BUT_DELIVERY_RECEIPT_SAVE_FAILED: " + receiptError.message);

    return NextResponse.json({
      ok: true,
      channel,
      account: connection.channel.display_name,
      externalId,
      externalUrl,
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unconfirmed external publication";
    await supabase.from("remaster_reel_deliveries").update({
      state: "needs_review",
      error: message.slice(0, 600),
      updated_at: new Date().toISOString(),
    }).eq("id", reservation.id).eq("state", "publishing");
    return fail(502, "REEL_PUBLICATION_UNCONFIRMED",
      "Publiseringen er ikke bekreftet. Kontroller kanalen før du gjør et nytt forsøk. " + message.slice(0, 220));
  }
}
