import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const ALLOWED_STATUS = ["draft", "published", "archived"] as const;
const ALLOWED_CHANNEL = ["portal", "email", "newsletter", "knowledge_base", "attachment"] as const;
type Status = (typeof ALLOWED_STATUS)[number];
type Channel = (typeof ALLOWED_CHANNEL)[number];

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();
  const audience = String(body.audience || "Norsk boligkjøper").trim();
  const status = (ALLOWED_STATUS.includes(body.status) ? body.status : "draft") as Status;
  const channel = (ALLOWED_CHANNEL.includes(body.channel) ? body.channel : "portal") as Channel;
  const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor).toISOString() : null;
  const sentTo = Array.isArray(body.sentTo)
    ? body.sentTo.map((v: unknown) => String(v).trim().toLowerCase()).filter(Boolean)
    : [];
  const sourceTopic = body.sourceTopic ? String(body.sourceTopic).trim() : null;
  const aiModel = body.aiModel ? String(body.aiModel).trim() : null;

  if (!title || !content) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }

  const summary = content.split("\n").find(Boolean)?.slice(0, 220) || `Kundevennlig dokument for ${audience}.`;

  // recipients keeps backwards-compat with portal_all = visible to all portal users.
  const recipients = channel === "portal" && sentTo.length === 0 ? "portal_all" : channel;

  const now = new Date().toISOString();

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
      recipients,
      sent_to: sentTo,
      status,
      channel,
      scheduled_for: scheduledFor,
      published_at: status === "published" && !scheduledFor ? now : null,
      archived_at: status === "archived" ? now : null,
      audience_label: audience,
      source_topic: sourceTopic,
      ai_model: aiModel,
      generated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, document: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.content !== undefined) {
    const content = String(body.content);
    updates.content_text = content;
    updates.sections = [{ heading: body.title || "", content }];
  }
  if (body.audience !== undefined) {
    updates.subtitle = String(body.audience).trim();
    updates.audience_label = String(body.audience).trim();
  }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status === "published") updates.published_at = now;
    if (body.status === "archived") updates.archived_at = now;
  }

  if (body.channel !== undefined) {
    if (!ALLOWED_CHANNEL.includes(body.channel)) {
      return NextResponse.json({ error: "invalid channel" }, { status: 400 });
    }
    updates.channel = body.channel;
    updates.recipients =
      body.channel === "portal" && (!Array.isArray(body.sentTo) || body.sentTo.length === 0)
        ? "portal_all"
        : body.channel;
  }

  if (body.scheduledFor !== undefined) {
    updates.scheduled_for = body.scheduledFor ? new Date(body.scheduledFor).toISOString() : null;
  }

  if (Array.isArray(body.sentTo)) {
    updates.sent_to = body.sentTo.map((v: unknown) => String(v).trim().toLowerCase()).filter(Boolean);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updates supplied" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("market_reports")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, document: data });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("market_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
