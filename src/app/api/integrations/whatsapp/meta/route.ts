import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { persistWhatsAppInbound } from "@/lib/nexus/whatsapp-persistence";
import { resolveWhatsAppLeadIdentity } from "@/lib/nexus/whatsapp-referral";
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
  const configuredReferrerNames = process.env.WHATSAPP_SOLEADA_REFERRER_NAMES || "";
  const results: Array<Record<string, unknown>> = [];

  for (const inbound of messages) {
    const resolution = resolveWhatsAppLeadIdentity(inbound, { configuredReferrerNames });

    if (resolution.mode === "REFERRAL_UNRESOLVED") {
      const now = new Date().toISOString();
      const customerName = resolution.customer?.name || "Ukjent kunde";
      const referrerName = resolution.referrer?.name || "Soleada";
      const { data: existingReferralTask } = await supabase
        .from("work_items")
        .select("id")
        .eq("source_type", "whatsapp_referral")
        .eq("source_id", inbound.messageId)
        .limit(1)
        .maybeSingle();

      let workItemCreated = false;
      if (!existingReferralTask?.id) {
        const { error: taskError } = await supabase.from("work_items").insert({
          title: `Soleada referral mangler kundetelefon: ${customerName}`,
          description: `Lead sendt av ${referrerName}. Kundens telefon ble ikke funnet i WhatsApp-meldingen.\n\n${inbound.text}`,
          status: "TO_DO",
          priority: "HIGH",
          due_date: now.slice(0, 10),
          brand_id: inbound.brandId || "soleada",
          source_type: "whatsapp_referral",
          source_id: inbound.messageId,
          assigned_agent: "sales",
          next_action: "Finn eller be om kundens telefonnummer før leadet opprettes i CRM. Ikke bruk referrerens telefon som kundeidentitet.",
          ai_score: 88,
          metadata: {
            whatsapp_message_id: inbound.messageId,
            referrer_name: resolution.referrer?.name || null,
            customer_name: resolution.customer?.name || null,
            referral_resolution: resolution.mode,
            original_text: inbound.text,
          },
          created_at: now,
          updated_at: now,
        });
        workItemCreated = !taskError;
      }

      results.push({
        messageId: inbound.messageId,
        ok: true,
        duplicate: Boolean(existingReferralTask?.id),
        referralMode: resolution.mode,
        contactId: null,
        workItemCreated,
        autoReplyMode: "NONE",
        autoReplyAllowed: false,
        replySent: false,
        replyError: null,
        persistenceError: null,
      });
      continue;
    }

    const message = resolution.message || inbound;
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
      && inbound.phoneNumberId
    ) {
      try {
        await sendMetaWhatsAppText({
          phoneNumberId: inbound.phoneNumberId,
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
      messageId: inbound.messageId,
      ok: persisted.ok,
      duplicate: persisted.duplicate,
      referralMode: resolution.mode,
      referrerName: resolution.referrer?.name || null,
      customerPhone: resolution.customer?.phone || message.from,
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
