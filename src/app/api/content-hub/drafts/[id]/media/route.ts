import { advisorCompositeHasManualApproval } from "@/lib/marketing/approved-advisor-media";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["property", "openart", "library", "upload", "website"]);

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key);
}
function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers });
}
function validUrl(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 4096) return false;
  try { const u = new URL(input); return u.protocol === "https:" && Boolean(u.hostname); }
  catch { return false; }
}
async function publication(supabase: ReturnType<typeof db>, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("content_publications")
    .select("id,status,ai_image_url,thumbnail_url,visual_format,media_revision")
    .eq("id", id).maybeSingle();
  return data;
}
async function media(supabase: ReturnType<typeof db>, id: string) {
  const { data, error: queryError } = await supabase.from("content_publication_media")
    .select("id,position,source_url,thumbnail_url,source_kind,overlay_text,alt_text,processing_status")
    .eq("publication_id", id).order("position");
  if (queryError) throw queryError;
  return data || [];
}
function legacy(item: { ai_image_url?: string | null; thumbnail_url?: string | null }) {
  return validUrl(item.ai_image_url)
    ? [{ id: "legacy", position: 0, source_url: item.ai_image_url, thumbnail_url: item.thumbnail_url, source_kind: "library", processing_status: "ready" }]
    : [];
}
type Context = { params: Promise<{ id: string }> };
async function authorized(req: NextRequest, context: Context) {
  const denied = await requireAdminApi(req, { error: "Ikke autorisert" });
  if (denied) return { denied };
  const { id } = await context.params;
  const supabase = db();
  const draft = await publication(supabase, id);
  if (!draft) return { denied: error("Utkastet finnes ikke", 404) };
  return { supabase, draft, id };
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const auth = await authorized(request, context);
    if (auth.denied) return auth.denied;
    const items = await media(auth.supabase!, auth.id!);
    return NextResponse.json({
      visual_format: auth.draft!.visual_format || "single_image",
      media_revision: auth.draft!.media_revision || 0,
      items: items.length ? items : legacy(auth.draft!),
    }, { headers });
  } catch { return error("Kunne ikke hente bildeserien.", 500); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const auth = await authorized(request, context);
    if (auth.denied) return auth.denied;
    if (!["draft","failed"].includes(auth.draft!.status)) return error("Publiserte innlegg kan ikke endres.", 409);
    const body = await request.json().catch(() => null);
    if (!validUrl(body?.source_url)) return error("Krever gyldig HTTPS-bildeadresse.");
    if (body.thumbnail_url && !validUrl(body.thumbnail_url)) return error("Ugyldig miniatyradresse.");
    if (body.source_kind && !KINDS.has(body.source_kind)) return error("Ugyldig bildekilde.");
    if (!(await advisorCompositeHasManualApproval(auth.supabase!, body.source_url))) {
      return error("AI-bildet må være godkjent før det kan legges til karusellen.", 409);
    }
    // One transaction preserves the legacy cover, appends the next image and
    // updates the publication. Concurrent requests serialize on the draft row.
    const { error: appendError } = await auth.supabase!.rpc("append_content_publication_media", {
      p_publication_id: auth.id,
      p_source_url: body.source_url,
      p_thumbnail_url: body.thumbnail_url || null,
      p_source_kind: body.source_kind || "library",
      p_alt_text: String(body.alt_text || "").slice(0, 500),
    });
    if (appendError) return error("Kunne ikke legge til bildet. Kontroller at utkastet er redigerbart og har plass.", 409);
    return NextResponse.json({ ok: true, items: await media(auth.supabase!, auth.id!) }, { headers });
  } catch { return error("Kunne ikke lagre bildet.", 500); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const auth = await authorized(request, context);
    if (auth.denied) return auth.denied;
    if (!["draft","failed"].includes(auth.draft!.status)) return error("Publiserte innlegg kan ikke endres.", 409);
    const body = await request.json().catch(() => null);
    const ids: unknown[] = body?.ordered_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 ||
        ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length)
      return error("Ugyldig bilderekkefølge.");
    const rows = await media(auth.supabase!, auth.id!);
    if (rows.length !== ids.length || rows.some(row => !ids.includes(row.id)))
      return error("Bildelisten er endret. Last inn på nytt.", 409);
    const changed = rows.some((row,index) => row.id !== ids[index]);
    if (changed) {
      const { error: reorderError } = await auth.supabase!.rpc("reorder_content_publication_media", {
        p_publication_id: auth.id,
        p_media_ids: ids,
      });
      if (reorderError) return error("Kunne ikke endre bilderekkefølge. Last inn siden og prøv igjen.", 409);
    }
    return NextResponse.json({ ok: true, items: await media(auth.supabase!, auth.id!) }, { headers });
  } catch { return error("Kunne ikke endre bilderekkefølge.", 500); }
}
