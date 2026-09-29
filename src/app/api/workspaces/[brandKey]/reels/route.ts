import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { getTokensForBrandPlatform } from "@/lib/oauth/channels";
import { REMASTER_SONG_READ_BRANDS } from "@/services/integrations/airtable-client";
import { loadPinosoReelVisuals } from "@/services/pipelines/remaster-reels-extra-brands";
import { loadZenEcoHomesVisualUrls } from "@/services/pipelines/remaster-mix-visual-source";
import { renderPortfolioReel, type ReelBrand, type ReelSong } from "@/services/pipelines/remaster-portfolio-reels";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const allowedBrands = new Set(["zeneco", "pinosoecolife"]);
const regionSchema = z.enum(["any", "north", "south", "inland", "costa-calida"]);
const visualSchema = z.enum(["mixed", "villas", "apartments", "pools", "sea-views", "interiors"]);
const createSchema = z.object({
  title: z.string().trim().min(3).max(100),
  durationSeconds: z.union([z.literal(15), z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
  songId: z.string().uuid(),
  channels: z.array(z.enum(["instagram", "facebook"])).min(1).max(2),
  region: regionSchema.default("any"),
  areaQuery: z.string().trim().max(80).default(""),
  visualTypes: z.array(visualSchema).min(1).max(6).default(["mixed"]),
  propertyId: z.string().uuid().optional(),
}).strict();

const noStore = { "Cache-Control": "private, no-store" };

function fail(status: number, code: string, message?: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: noStore });
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

function visualCount(seconds: number) {
  return seconds <= 20 ? 3 : seconds <= 30 ? 4 : seconds <= 45 ? 5 : 6;
}

async function channelState(brandKey: string, platform: "instagram" | "facebook") {
  try {
    const connection = await getTokensForBrandPlatform(brandKey, platform);
    if (!connection || connection.channel.brand_id !== brandKey || !connection.channel.is_active) {
      return { platform, connected: false, account: null, reason: "Ingen aktiv kanal er koblet til denne merkevaren." };
    }
    const scopes = connection.tokens.scopes || [];
    const hasScope = platform === "facebook"
      ? scopes.includes("pages_manage_posts")
      : scopes.some(scope => ["instagram_content_publish", "instagram_business_content_publish"].includes(scope));
    return {
      platform,
      connected: hasScope,
      account: connection.channel.display_name,
      reason: hasScope ? "" : "Kanaltilkoblingen mangler publiseringsrettighet.",
    };
  } catch {
    return { platform, connected: false, account: null, reason: "Kanaltilkoblingen er uklar eller må kobles til på nytt." };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const { brandKey } = params;
  if (!allowedBrands.has(brandKey)) return fail(404, "REELS_NOT_AVAILABLE_FOR_BRAND");
  const access = await requireBrandWorkspace(request, brandKey, "reels.read");
  if (!access.value) return access.response;

  const supabase = access.value.supabase;
  const [{ data: jobs, error: jobsError }, { data: songs, error: songsError }, instagram, facebook] = await Promise.all([
    supabase.from("remaster_reel_jobs")
      .select("id,title,duration_seconds,song_title,channels,state,video_path,caption,error,created_by,created_at,updated_at")
      .eq("brand", brandKey).order("created_at", { ascending: false }).limit(25),
    supabase.from("songs")
      .select("id,name,genre,mood,brand,created_at")
      .in("brand", [...REMASTER_SONG_READ_BRANDS])
      .not("file_url", "is", null)
      .order("created_at", { ascending: false }).limit(60),
    channelState(brandKey, "instagram"),
    channelState(brandKey, "facebook"),
  ]);
  if (jobsError || songsError) return fail(503, "REELS_UNAVAILABLE");

  const jobIds = (jobs || []).map(row => row.id);
  const deliveryResult = jobIds.length
    ? await supabase.from("remaster_reel_deliveries")
        .select("reel_id,channel,state,external_url,error,updated_at")
        .in("reel_id", jobIds)
    : { data: [], error: null };
  if (deliveryResult.error) return fail(503, "REEL_DELIVERY_HISTORY_UNAVAILABLE");

  const deliveriesByReel = new Map<string, unknown[]>();
  for (const delivery of deliveryResult.data || []) {
    const list = deliveriesByReel.get(delivery.reel_id) || [];
    list.push({
      channel: delivery.channel,
      state: delivery.state,
      externalUrl: delivery.external_url || null,
      error: delivery.error || null,
      updatedAt: delivery.updated_at || null,
    });
    deliveriesByReel.set(delivery.reel_id, list);
  }

  const reels = (jobs || []).map(row => ({
    id: row.id,
    title: row.title,
    durationSeconds: row.duration_seconds,
    songTitle: row.song_title,
    channels: Array.isArray(row.channels) ? row.channels.filter((value: unknown) => value === "instagram" || value === "facebook") : [],
    state: row.state,
    caption: row.caption || null,
    error: row.error || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    videoUrl: row.state === "ready" && row.video_path === row.id + ".mp4"
      ? supabase.storage.from("remaster-reels").getPublicUrl(row.video_path).data.publicUrl
      : null,
    deliveries: deliveriesByReel.get(row.id) || [],
  }));

  return NextResponse.json({
    ok: true,
    brand: brandKey,
    reels,
    songs: (songs || []).map(song => ({
      id: song.id, title: song.name, genre: song.genre || null, mood: song.mood || null,
    })),
    channels: { instagram, facebook },
  }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const { brandKey } = params;
  if (!allowedBrands.has(brandKey)) return fail(404, "REELS_NOT_AVAILABLE_FOR_BRAND");
  const access = await requireBrandWorkspace(request, brandKey, "reels.create");
  if (!access.value) return access.response;
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "INVALID_REEL_CONFIGURATION", "Kontroller tittel, lyd, varighet og bildevalg.");
  const input = parsed.data;
  if (input.propertyId) {
    const propertyAccess = await requireBrandWorkspace(request, brandKey, "properties.catalog.read");
    if (!propertyAccess.value) return propertyAccess.response;
  }
  const supabase = access.value.supabase;

  const { data: songRow, error: songError } = await supabase.from("songs")
    .select("id,name,file_url,youtube_url,brand")
    .eq("id", input.songId)
    .in("brand", [...REMASTER_SONG_READ_BRANDS])
    .maybeSingle();
  if (songError || !songRow?.file_url) return fail(400, "REEL_SONG_NOT_AVAILABLE");

  const song: ReelSong = {
    id: String(songRow.id),
    title: String(songRow.name || "Re-Master Freddy"),
    audioUrl: String(songRow.file_url),
    youtubeUrl: songRow.youtube_url ? String(songRow.youtube_url) : null,
  };

  const seed = crypto.randomUUID();
  const count = visualCount(input.durationSeconds);
  let imageUrls: string[] = [];
  try {
    if (brandKey === "pinosoecolife") {
      imageUrls = await loadPinosoReelVisuals({
        seed,
        count,
        region: input.region === "any" ? "inland" : input.region,
        areaQuery: input.areaQuery,
        visualTypes: input.visualTypes,
        propertyId: input.propertyId,
      });
    } else {
      const result = await loadZenEcoHomesVisualUrls({
        targetMinutes: Math.max(1, input.durationSeconds / 60),
        region: input.region,
        visualType: input.visualTypes[0] || "mixed",
        visualTypes: input.visualTypes,
        randomSeed: seed,
        strictSelection: true,
        areaQuery: input.areaQuery || undefined,
        propertyId: input.propertyId,
      });
      imageUrls = [...new Set(result.urls)].slice(0, count);
    }
  } catch (error) {
    return fail(400, "REEL_VISUAL_SELECTION_FAILED", error instanceof Error ? error.message : "Kunne ikke hente bilder.");
  }
  imageUrls = [...new Set(imageUrls)].slice(0, count);
  if (imageUrls.length < 2) return fail(409, "REEL_NOT_ENOUGH_PROPERTY_VISUALS", "Velg et bredere område eller flere bildetyper.");

  let propertyUrl: string | undefined;
  if (input.propertyId) {
    const { data: propertyMeta, error: propertyMetaError } = await supabase.from("properties")
      .select("ref").eq("id", input.propertyId).maybeSingle();
    const reference = typeof propertyMeta?.ref === "string" ? propertyMeta.ref.trim() : "";
    if (propertyMetaError || !reference || !/^[A-Za-z0-9._~-]{1,100}$/.test(reference)) {
      return fail(409, "REEL_PROPERTY_LINK_UNAVAILABLE", "Denne boligen mangler en verifiserbar offentlig boliglenke.");
    }
    const host = brandKey === "pinosoecolife" ? "www.pinosoecolife.com" : "www.zenecohomes.com";
    propertyUrl = `https://${host}/eiendommer/${encodeURIComponent(reference)}`;
  }

  const selection = {
    seed,
    workspace: true,
    brand: brandKey,
    channels: input.channels,
    region: input.region,
    areaQuery: input.areaQuery,
    visualTypes: input.visualTypes,
    propertyId: input.propertyId || null,
  };
  const { data: created, error: createError } = await supabase.from("remaster_reel_jobs").insert({
    brand: brandKey,
    title: input.title,
    duration_seconds: input.durationSeconds,
    song_id: song.id,
    song_title: song.title,
    channels: input.channels,
    selection,
    state: "rendering",
    created_by: access.value.verifiedEmail,
  }).select("id,title,state,created_at").single();
  if (createError || !created) return fail(503, "REEL_JOB_CREATE_FAILED");

  try {
    const rendered = await renderPortfolioReel({
      brand: brandKey as ReelBrand,
      title: input.title,
      durationSeconds: input.durationSeconds,
      song,
      imageUrls,
      promotedItems: [],
      region: input.region,
      areaQuery: input.areaQuery,
      visualTypes: input.visualTypes,
      propertyUrl,
    });
    const objectPath = String(created.id) + ".mp4";
    const { error: uploadError } = await supabase.storage.from("remaster-reels").upload(objectPath, rendered.buffer, {
      contentType: "video/mp4",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw new Error("REEL_STORAGE_FAILED: " + uploadError.message);
    const publicUrl = supabase.storage.from("remaster-reels").getPublicUrl(objectPath).data.publicUrl;
    const { data: ready, error: readyError } = await supabase.from("remaster_reel_jobs").update({
      state: "ready",
      video_path: objectPath,
      caption: rendered.caption,
      error: null,
      updated_at: new Date().toISOString(),
      selection: { ...selection, visualCount: rendered.visualCount, publicUrl },
    }).eq("id", created.id).eq("brand", brandKey).eq("state", "rendering")
      .select("id,title,state,caption,created_at,updated_at").single();
    if (readyError || !ready) throw new Error("REEL_JOB_SAVE_FAILED");
    return NextResponse.json({ ok: true, reel: { ...ready, videoUrl: publicUrl } }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reel-rendering feilet.";
    await supabase.from("remaster_reel_jobs").update({
      state: "failed", error: message.slice(0, 700), updated_at: new Date().toISOString(),
    }).eq("id", created.id).eq("brand", brandKey).eq("state", "rendering");
    return fail(500, "REEL_RENDER_FAILED", message.slice(0, 300));
  }
}
