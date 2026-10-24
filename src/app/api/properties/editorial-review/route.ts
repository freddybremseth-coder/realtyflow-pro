import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const denied = await requireAdminApi(req);
  if (denied) return denied;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const db = createClient(url, key);
  // A bounded read-only editorial worklist: no drafts are published by this endpoint.
  const { data, error } = await db.from("properties")
    .select("id,ref,title,title_no,location,editorial_no,editorial_no_approved,updated_at")
    .not("editorial_no", "is", null)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "Unable to read editorial worklist" }, { status: 500 });
  const rows = (data || []).map(p => {
    const e = p.editorial_no && typeof p.editorial_no === "object" && !Array.isArray(p.editorial_no)
      ? p.editorial_no as Record<string, unknown> : {};
    const reasons = Array.isArray(e.approval_reasons) ? e.approval_reasons.filter(x => typeof x === "string") : [];
    return {
      id: p.id, ref: p.ref, title: p.title_no || p.title, location: p.location,
      approved: p.editorial_no_approved === true,
      status: p.editorial_no_approved === true ? "approved" : "needs_review",
      headline: typeof e.headline_no === "string" ? e.headline_no : "",
      intro: typeof e.intro_no === "string" ? e.intro_no : "",
      reasons, updated_at: p.updated_at,
    };
  });
  return NextResponse.json({ rows, limit: 300, reviewed: rows.length,
    counts: { approved: rows.filter(x => x.approved).length, needs_review: rows.filter(x => !x.approved).length } });
}
