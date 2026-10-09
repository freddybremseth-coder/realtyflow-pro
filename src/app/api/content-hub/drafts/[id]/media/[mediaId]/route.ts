import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; mediaId: string }> };
export async function DELETE(request: NextRequest, context: Context) {
  const denied = await requireAdminApi(request, { error: "Ikke autorisert" });
  if (denied) return denied;
  const { id, mediaId } = await context.params;
  const isUuid = (x: string) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x);
  if (!isUuid(id) || !isUuid(mediaId)) return NextResponse.json({ error: "Ugyldig ID" }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Database utilgjengelig" }, { status: 503 });
  const db = createClient(url, key);
  const { data: draft } = await db.from("content_publications")
    .select("id,status").eq("id",id).maybeSingle();
  if (!draft) return NextResponse.json({ error: "Utkast finnes ikke" }, { status: 404 });
  if (draft.status === "published") return NextResponse.json({ error: "Publisert innlegg kan ikke endres" }, { status: 409 });
  const { error } = await db.rpc("remove_content_publication_media", {
    p_publication_id: id, p_media_id: mediaId
  });
  if (error) return NextResponse.json({ error: "Bildet kunne ikke fjernes. Last inn og prøv igjen." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
