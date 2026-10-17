import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

// The browser draws campaign images on a canvas to apply optional overlays.
// Fetching directly from remote public storage URLs can taint that canvas;
// serve only the stored creative's image from our own storage origin.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; creativeId: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const { data: creative, error } = await context.supabase
      .from("ad_creatives")
      .select("image_url")
      .eq("campaign_id", params.id)
      .eq("id", params.creativeId)
      .eq("status", "completed")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!creative?.image_url) {
      return NextResponse.json({ error: "Fant ikke et ferdig bilde." }, { status: 404 });
    }

    const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!storageOrigin) {
      return NextResponse.json({ error: "Lagring er ikke konfigurert." }, { status: 503 });
    }
    const imageUrl = new URL(creative.image_url);
    const prefix = "/storage/v1/object/public/ad-creatives/";
    if (imageUrl.origin !== new URL(storageOrigin).origin || !imageUrl.pathname.startsWith(prefix)) {
      return NextResponse.json({ error: "Bildekilden er ikke en godkjent kampanjefil." }, { status: 400 });
    }

    const storagePath = decodeURIComponent(imageUrl.pathname.slice(prefix.length));
    if (!storagePath.startsWith(`${params.id}/`) || storagePath.includes("..")) {
      return NextResponse.json({ error: "Ugyldig bildebane." }, { status: 400 });
    }

    const { data: blob, error: downloadError } = await context.supabase.storage
      .from("ad-creatives")
      .download(storagePath);
    if (downloadError || !blob) {
      return NextResponse.json({ error: "Kunne ikke hente bildet fra Storage." }, { status: 502 });
    }

    return new NextResponse(await blob.arrayBuffer(), {
      headers: {
        "Content-Type": blob.type || "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
