import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { persistWhatsAppInbound } from "@/lib/nexus/whatsapp-persistence";
import {
  parseMetaWhatsAppWebhook,
  parsePhoneBrandMap,
  sendMetaWhatsAppText,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/lib/nexus/whatsapp-meta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = verifyMetaWebhookChallenge({
    mode: searchParams.get("hub.mode"),
    verifyToken: searchParams.get("hub.verify_token"),
    challenge: searchParams.get("hub.challenge"),
    expectedToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  });
  if (!result.ok || !result.challenge) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(result.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const appSecret = process.env.WHATSAPP_META_APP_SECRET || null;
  if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}");
  const messages = parseMetaWhatsAppWebhook(payload, parsePhoneBrandMap(process.env.WHATSAPP_PHONE_BRAND_MAP));
  if (!messages.length) return NextResponse.json({ ok: true, accepted: 0 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database is not configured" }, { status: 500 });

  const autoReplyEnabled = process.env.WHATSAPP_AUTOREPLY_ENABLED === "true";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "";
  const results: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    const persisted = await persistWhatsAppInbound(supabase, message);
    let replySent = false;
    let replyError: string | null = null;
    if (
      persisted.ok
      && !persisted.duplicate
      && persisted.autoReply.allowed
      && persisted.autoReply.suggestedReply
      && autoReplyEnabled
      && accessToken
      && graphVersion
      && message.phoneNumberId
    ) {
      try {
        await sendMetaWhatsAppText({
          phoneNumberId: message.phoneNumberId,
          to: message.from,
          text: persisted.autoReply.suggestedReply,
          accessToken,
          graphVersion,
        });
        replySent = true;
      } catch (error) {
        replyError = error instanceof Error ? error.message : String(error);
      }
    }

    results.push({
      messageId: message.messageId,
      ok: persisted.ok,
      duplicate: persisted.duplicate,
      contactId: persisted.contactId || null,
      workItemCreated: Boolean(persisted.workItemCreated),
      autoReplyMode: persisted.autoReply.mode,
      autoReplyAllowed: persisted.autoReply.allowed,
      replySent,
      replyError,
      persistenceError: persisted.error || null,
    });
  }

  return NextResponse.json({ ok: true, accepted: messages.length, results });
}
