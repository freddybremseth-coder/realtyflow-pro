import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();
  const audience = String(body.audience || "Norsk boligkjøper").trim();

  if (!title || !content) return NextResponse.json({ error: "title and content are required" }, { status: 400 });

  const summary = content.split("\n").find(Boolean)?.slice(0, 220) || `Kundevennlig dokument for ${audience}.`;

  const { data, error } = await supabase
    .from("market_reports")
    .insert({
      template_id: "buyer-document",
      title,
      subtitle: audience,
      summary,
      content_text: content,
      sections: [{ heading: title, content }],
      data_sources: ["RealtyFlow Dokumenthub"],
      recipients: "portal_all",
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, document: data }, { status: 201 });
}
