// ─── PATCH/DELETE /api/plots/:id/assets/:assetId ──────────────────
// PATCH body fields: title, description, kind, tags, show_on_website,
//                    visible_in_portal, visible_to_customer_ids, display_order
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; assetId: string } }
) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const body = await req.json();
  const allowed = [
    "title", "description", "kind", "tags",
    "show_on_website", "visible_in_portal", "visible_to_customer_ids",
    "display_order",
  ];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("plot_assets")
    .update(update)
    .eq("id", params.assetId)
    .eq("plot_id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; assetId: string } }
) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  // Get storage path so we can delete the file too
  const { data: asset } = await supabase
    .from("plot_assets")
    .select("storage_path")
    .eq("id", params.assetId)
    .eq("plot_id", params.id)
    .single();

  const { error: delErr } = await supabase
    .from("plot_assets")
    .delete()
    .eq("id", params.assetId)
    .eq("plot_id", params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (asset?.storage_path) {
    await supabase.storage.from("plot-assets").remove([asset.storage_path]);
  }
  return NextResponse.json({ ok: true });
}
