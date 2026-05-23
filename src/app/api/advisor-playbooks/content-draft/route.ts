import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split(/[,;\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function contentTypeFromTopic(topic?: string) {
  if (/article/i.test(topic || "")) return "expert_article";
  if (/instruction/i.test(topic || "")) return "advisor_instruction";
  return "market_expert_report";
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const playbook = (body.playbook || {}) as Record<string, unknown>;
  const title = String(playbook.title || "").trim();
  const description = String(playbook.customer_message || playbook.summary || "").trim();

  if (!title || !description) {
    return NextResponse.json({ error: "title and customer_message are required" }, { status: 400 });
  }

  const tags = Array.from(new Set([...normalizeTags(playbook.tags), "market-intelligence", "freddy-expertise"]));

  const { data, error } = await supabase
    .from("content_publications")
    .insert({
      brand_id: String(playbook.brand_id || "zeneco"),
      content_type: contentTypeFromTopic(String(playbook.topic || "")),
      title,
      description,
      tags,
      status: "draft",
      ai_generated: true,
      ai_title: title,
      ai_description: description,
      ai_tags: tags,
    })
    .select("id,title,status,content_type,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ draft: data }, { status: 201 });
}
