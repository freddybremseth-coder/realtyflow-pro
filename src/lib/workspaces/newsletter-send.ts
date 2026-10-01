import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceEmailRuntime } from "@/lib/workspaces/email-runtime";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlRe = /https?:\/\/[^\s<>"']+/gi;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function normalizeSegments(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map(item => item.trim().toLowerCase()).slice(0, 20)
    : [];
}

function matchesSegments(subscriber: { segments?: string[] | null }, segmentFilter: string[]) {
  if (!segmentFilter.length) return true;
  const subscriberSegments = new Set(normalizeSegments(subscriber.segments));
  return segmentFilter.every(segment => subscriberSegments.has(segment));
}

async function trackedHtml(input: {
  supabase: SupabaseClient;
  deliveryId: string;
  bodyText: string;
  unsubscribeUrl: string;
  openUrl: string;
  origin: string;
}) {
  const urls = Array.from(new Set(input.bodyText.match(urlRe) || [])).slice(0, 25);
  const replacements = new Map<string, string>();

  for (const destination of urls) {
    let valid: URL;
    try {
      valid = new URL(destination);
      if (!["http:", "https:"].includes(valid.protocol)) continue;
    } catch {
      continue;
    }
    const token = crypto.randomUUID();
    const { error } = await input.supabase.schema("core").from("workspace_newsletter_links").insert({
      delivery_id: input.deliveryId,
      tracking_token: token,
      destination_url: destination,
    });
    if (!error) replacements.set(destination, `${input.origin}/api/public/newsletter-click?token=${token}`);
  }

  let html = escapeHtml(input.bodyText);
  for (const [source, tracked] of replacements) {
    html = html.split(escapeHtml(source)).join(`<a href="${escapeHtml(tracked)}">${escapeHtml(source)}</a>`);
  }
  html = html.replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,sans-serif;line-height:1.6">${html}<hr><p style="font-size:12px;color:#64748b">Avmeld nyhetsbrev: <a href="${escapeHtml(input.unsubscribeUrl)}">klikk her</a></p><img src="${escapeHtml(input.openUrl)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0" /></div>`;
}

export async function sendWorkspaceNewsletterCampaign(input: {
  supabase: SupabaseClient;
  brandId: string;
  brandKey: string;
  campaignId: string;
  origin: string;
}) {
  const { supabase, brandId, brandKey, campaignId, origin } = input;
  const [{ data: campaign }, { data: subscribers }, { data: config }] = await Promise.all([
    supabase.schema("core").from("workspace_newsletter_campaigns")
      .select("*").eq("id", campaignId).eq("brand_id", brandId).maybeSingle(),
    supabase.schema("core").from("workspace_newsletter_subscribers")
      .select("id,email,name,unsubscribe_token,segments").eq("brand_id", brandId).eq("status", "active")
      .order("created_at", { ascending: true }).limit(500),
    supabase.from("brand_email_configs")
      .select("*").eq("brand_id", brandKey).eq("is_active", true).limit(1).maybeSingle(),
  ]);
  if (!campaign || !config) return { ok: false as const, code: "CAMPAIGN_OR_SENDER_NOT_READY" };
  if (!subscribers?.length) return { ok: false as const, code: "NO_ACTIVE_SUBSCRIBERS" };

  const segmentFilter = normalizeSegments(campaign.segment_filter);
  const selected = subscribers.filter((subscriber: any) => matchesSegments(subscriber, segmentFilter));
  if (!selected.length) return { ok: false as const, code: "NO_SEGMENT_MATCHES" };

  const runtime = getWorkspaceEmailRuntime();
  const suppression = await runtime.checkSuppression(supabase, selected.map((row: any) => row.email));
  if (suppression.error) return { ok: false as const, code: "SUPPRESSION_CHECK_FAILED" };
  const blocked = new Set((suppression.blockedEmails || []).map((email: string) => email.toLowerCase()));
  const smtp = await runtime.buildSmtp(config, config.display_name || undefined);

  let sent = 0;
  let failed = 0;
  await supabase.schema("core").from("workspace_newsletter_campaigns")
    .update({
      status: "sending", recipient_count: selected.length, sent_count: 0, failed_count: 0,
      opened_count: 0, clicked_count: 0, updated_at: new Date().toISOString(),
    }).eq("id", campaignId).eq("brand_id", brandId);

  for (const subscriber of selected) {
    const email = String(subscriber.email || "").toLowerCase();
    if (!emailRe.test(email) || blocked.has(email)) {
      failed += 1;
      await supabase.schema("core").from("workspace_newsletter_deliveries").upsert({
        campaign_id: campaignId, subscriber_id: subscriber.id, email,
        status: "skipped", error: "suppressed_or_invalid",
      }, { onConflict: "campaign_id,subscriber_id" });
      continue;
    }

    const trackingToken = crypto.randomUUID();
    const { data: delivery, error: deliveryError } = await supabase.schema("core")
      .from("workspace_newsletter_deliveries")
      .upsert({
        campaign_id: campaignId, subscriber_id: subscriber.id, email,
        status: "pending", error: null, tracking_token: trackingToken,
      }, { onConflict: "campaign_id,subscriber_id" })
      .select("id,tracking_token").single();
    if (deliveryError || !delivery) {
      failed += 1;
      continue;
    }

    const unsubscribe = `${origin}/api/public/newsletter-unsubscribe?token=${subscriber.unsubscribe_token}`;
    const openUrl = `${origin}/api/public/newsletter-open?token=${delivery.tracking_token}`;
    const bodyHtml = await trackedHtml({
      supabase, deliveryId: delivery.id, bodyText: campaign.body_text,
      unsubscribeUrl: unsubscribe, openUrl, origin,
    });
    const result = await runtime.send(smtp, {
      to: [email],
      subject: campaign.subject,
      bodyText: `${campaign.body_text}\n\n---\nAvmeld nyhetsbrev: ${unsubscribe}`,
      bodyHtml,
    });
    if (result.success) sent += 1; else failed += 1;
    await supabase.schema("core").from("workspace_newsletter_deliveries").update({
      status: result.success ? "sent" : "failed",
      message_id: result.messageId || null,
      error: result.success ? null : (result.error || "send_failed"),
      sent_at: result.success ? new Date().toISOString() : null,
    }).eq("id", delivery.id);
  }

  await supabase.schema("core").from("workspace_newsletter_campaigns").update({
    status: failed > 0 && sent === 0 ? "failed" : "sent",
    sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId).eq("brand_id", brandId);

  return { ok: true as const, recipients: selected.length, sent, failed };
}
