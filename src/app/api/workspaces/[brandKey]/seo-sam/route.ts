import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: NextRequest, { params }: { params: { brandKey: string } }) {
  // The same verified, revocable brand grant as Andrea's other marketing tools.
  // Never proxy the owner-only portfolio endpoint: it includes unrelated brands and credential state.
  const access = await requireBrandWorkspace(request, params.brandKey, "visibility.read");
  if (access.response) return access.response;
  const { supabase, brandKey } = access.value;
  const { data: tasks, error } = await supabase.from("work_items")
    .select("id,title,description,status,priority,due_date,next_action,updated_at")
    .eq("brand_id", brandKey)
    .eq("assigned_agent", "seo")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ ok: false, error: "SEO_OVERVIEW_UNAVAILABLE" }, { status: 503, headers: noStore });
  let metadata: Array<{ page_path: string; seo_title: string; seo_description: string; updated_at: string }> = [];
  if (brandKey === "zeneco") {
    const result = await supabase.from("seo_page_overrides")
      .select("page_path,seo_title,seo_description,updated_at")
      .eq("brand_id", brandKey).eq("active", true)
      .order("page_path").limit(100);
    if (!result.error) metadata = result.data || [];
  }
  return NextResponse.json({
    ok: true, brandKey,
    scope: "brand_read_only",
    tasks: (tasks || []).map(task => ({
      id: task.id, title: task.title, description: task.description, status: task.status,
      priority: task.priority, dueDate: task.due_date, nextAction: task.next_action,
      updatedAt: task.updated_at,
    })),
    metadata,
  }, { headers: noStore });
}
