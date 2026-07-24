import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

type ConversationPayload = {
  id?: string | null;
  messages?: unknown;
  activePlan?: unknown;
};

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function titleFromMessages(messages: unknown) {
  if (!Array.isArray(messages)) return "Ny samtale";
  const firstUserMessage = messages.find((message) => {
    const item = message as { role?: unknown; content?: unknown };
    return item.role === "user" && typeof item.content === "string" && item.content.trim().length > 0;
  }) as { content?: string } | undefined;
  return firstUserMessage?.content?.slice(0, 100) || "Ny samtale";
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { conversations: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ conversations: [] });

  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const { data, error } = await supabase
      .from("command_conversations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversation: data });
  }

  const { data, error } = await supabase
    .from("command_conversations")
    .select("id, title, status, updated_at, active_plan")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    conversations: (data || []).map((conversation) => ({
      id: conversation.id,
      title: conversation.title || "Uten tittel",
      status: conversation.status,
      updated_at: conversation.updated_at,
      has_plan: !!conversation.active_plan,
    })),
  });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { id: null });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ id: null });

  const body = (await request.json().catch(() => ({}))) as ConversationPayload;
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ id: body.id || null });
  }

  const payload = {
    title: titleFromMessages(body.messages),
    messages: JSON.parse(JSON.stringify(body.messages)),
    active_plan: body.activePlan ? JSON.parse(JSON.stringify(body.activePlan)) : null,
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    const { error } = await supabase
      .from("command_conversations")
      .update(payload)
      .eq("id", body.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: body.id });
  }

  const { data, error } = await supabase
    .from("command_conversations")
    .insert({ ...payload, status: "active" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data?.id || null });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ ok: true });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });

  const { error } = await supabase
    .from("command_conversations")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
