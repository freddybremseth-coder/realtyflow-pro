import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getPortalEmail(request: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  if (!supabase) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user?.email?.toLowerCase() || null;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });
  const email = await getPortalEmail(request, supabase);
  if (!email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });

  const { data, error } = await supabase
    .from("portal_messages")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    if (/portal_messages|schema cache|does not exist|not find the table/i.test(error.message)) {
      return NextResponse.json({ messages: [], tableNotReady: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "No DB" }, { status: 500 });
  const email = await getPortalEmail(request, supabase);
  if (!email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = String(body.body || body.message || "").trim();
  const attachmentUrl = String(body.attachmentUrl || "").trim();
  const attachmentName = String(body.attachmentName || "").trim();
  if (!text && !attachmentUrl) return NextResponse.json({ error: "message or attachment is required" }, { status: 400 });

  const { data: contact } = await supabase
    .from("contacts")
    .select("id,name")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const attachments = attachmentUrl
    ? [{ name: attachmentName || "Vedlegg", url: attachmentUrl }]
    : [];

  const { data, error } = await supabase
    .from("portal_messages")
    .insert({
      contact_id: contact?.id || null,
      email,
      brand_id: "zeneco",
      sender_type: "customer",
      sender_name: contact?.name || email,
      body: text || "Vedlegg",
      attachments,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (contact?.id) {
    await supabase.from("work_items").insert({
      title: `Ny melding på Min side fra ${contact.name || email}`,
      description: text.slice(0, 240) || attachmentName || attachmentUrl,
      status: "TO_DO",
      priority: "HIGH",
      due_date: new Date().toISOString().slice(0, 10),
      brand_id: "zeneco",
      source_type: "chatbot",
      source_id: data.id,
      assigned_agent: "sales",
      next_action: "Svar kunden i Min side og vurder om meldingen er et kjøpssignal.",
      ai_score: 84,
      metadata: { portal_message: true, email },
    }).then(() => null);
  }

  return NextResponse.json({ message: data }, { status: 201 });
}
