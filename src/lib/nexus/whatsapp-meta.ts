import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsAppInboundMessage } from "@/lib/nexus/whatsapp-inbound";

export type MetaWhatsAppInbound = WhatsAppInboundMessage & {
  phoneNumberId: string;
};

export function verifyMetaWebhookChallenge(input: {
  mode?: string | null;
  verifyToken?: string | null;
  challenge?: string | null;
  expectedToken?: string | null;
}) {
  const ok = input.mode === "subscribe"
    && Boolean(input.expectedToken)
    && input.verifyToken === input.expectedToken
    && Boolean(input.challenge);
  return { ok, challenge: ok ? String(input.challenge) : null };
}

export function verifyMetaWebhookSignature(rawBody: string, signature: string | null, appSecret: string | null) {
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

function textFromMessage(message: any) {
  if (message?.type === "text") return String(message?.text?.body || "").trim();
  if (message?.type === "button") return String(message?.button?.text || "").trim();
  if (message?.type === "interactive") {
    return String(
      message?.interactive?.button_reply?.title
      || message?.interactive?.list_reply?.title
      || message?.interactive?.button_reply?.id
      || message?.interactive?.list_reply?.id
      || "",
    ).trim();
  }
  return "";
}

export function parseMetaWhatsAppWebhook(payload: any, brandByPhoneNumberId: Record<string, string> = {}) {
  const output: MetaWhatsAppInbound[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "messages") continue;
      const value = change?.value || {};
      const phoneNumberId = String(value?.metadata?.phone_number_id || "").trim();
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      const nameByWaId = new Map<string, string>();
      for (const contact of contacts) {
        const waId = String(contact?.wa_id || "").trim();
        const name = String(contact?.profile?.name || "").trim();
        if (waId && name) nameByWaId.set(waId, name);
      }
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        const text = textFromMessage(message);
        const messageId = String(message?.id || "").trim();
        const from = String(message?.from || "").trim();
        if (!messageId || !from || !text) continue;
        const timestampSeconds = Number(message?.timestamp || 0);
        output.push({
          messageId,
          from,
          profileName: nameByWaId.get(from) || null,
          text,
          timestamp: Number.isFinite(timestampSeconds) && timestampSeconds > 0
            ? new Date(timestampSeconds * 1000).toISOString()
            : null,
          brandId: brandByPhoneNumberId[phoneNumberId] || null,
          phoneNumberId,
        });
      }
    }
  }
  return output;
}

export function parsePhoneBrandMap(raw: string | null | undefined) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [String(key).trim(), String(value || "").trim()])
        .filter(([key, value]) => key && value),
    );
  } catch {
    return {};
  }
}

export async function sendMetaWhatsAppText(input: {
  phoneNumberId: string;
  to: string;
  text: string;
  accessToken: string;
  graphVersion: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl || fetch;
  const version = String(input.graphVersion || "").trim();
  if (!version) throw new Error("WHATSAPP_GRAPH_VERSION is required");
  const response = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: input.text },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}
