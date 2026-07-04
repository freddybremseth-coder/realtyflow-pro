import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { documents: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const status = request.nextUrl.searchParams.get("status");
  const channel = request.nextUrl.searchParams.get("channel");

  let query = supabase
    .from("market_reports")
    .select("id,title,subtitle,summary,content_text,sections,status,channel,scheduled_for,published_at,archived_at,sent_to,audience_label,source_topic,ai_model,generated_at,created_at")
    .eq("template_id", "buyer-document")
    .order("generated_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (channel) query = query.eq("channel", channel);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const documents = (data || []).map((row) => {
    const sections = Array.isArray(row.sections) ? row.sections : [];
    const fallback = sections
      .map((s: { heading?: string; content?: string }) => [s.heading, s.content].filter(Boolean).join("\n"))
      .join("\n\n");
    return {
      id: row.id,
      title: row.title,
      audience: row.audience_label || row.subtitle || "",
      summary: row.summary || "",
      content: row.content_text || fallback,
      status: row.status || "draft",
      channel: row.channel || "portal",
      scheduledFor: row.scheduled_for,
      publishedAt: row.published_at,
      archivedAt: row.archived_at,
      sentTo: row.sent_to || [],
      sourceTopic: row.source_topic,
      aiModel: row.ai_model,
      generatedAt: row.generated_at || row.created_at,
    };
  });

  return NextResponse.json({ documents });
}
