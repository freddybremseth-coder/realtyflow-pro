import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { getWorkspaceEmailRuntime } from "@/lib/workspaces/email-runtime";
import { sendWorkspaceNewsletterCampaign } from "@/lib/workspaces/newsletter-send";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const noStore = { "Cache-Control": "private, no-store" };
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(status: number, code: string, message?: string) {
  return NextResponse.json({ ok: false, error: { code, ...(message ? { message } : {}) } }, { status, headers: noStore });
}
function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function senderConfig(supabase: any, brandKey: string) {
  const { data } = await supabase.from("brand_email_configs")
    .select("*").eq("brand_id", brandKey).eq("is_active", true)
    .order("is_primary_sender", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1).maybeSingle();
  return data || null;
}

export async function GET(request: NextRequest, { params }: { params: { brandKey: string } }) {
  const access = await requireBrandWorkspace(request, params.brandKey, "email.read");
  if (!access.value) return access.response;
  const supabase = access.value.supabase;
  const [{ data: subscribers }, { data: campaigns }, sender] = await Promise.all([
    supabase.schema("core").from("workspace_newsletter_subscribers")
      .select("id,email,name,status,segments,consent_source,consent_note,consent_at,created_at")
      .eq("brand_id", access.value.brandId).order("created_at", { ascending: false }).limit(200),
    supabase.schema("core").from("workspace_newsletter_campaigns")
      .select("id,title,subject,preheader,body_text,status,scheduled_at,segment_filter,sent_at,recipient_count,sent_count,failed_count,opened_count,clicked_count,created_at")
      .eq("brand_id", access.value.brandId).order("created_at", { ascending: false }).limit(50),
    senderConfig(supabase, params.brandKey),
  ]);

  return NextResponse.json({
    ok: true,
    subscribers: subscribers || [],
    campaigns: campaigns || [],
    sender: sender ? { configured: true, email: sender.email_address, displayName: sender.display_name || null } : { configured: false },
  }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: { params: { brandKey: string } }) {
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) return fail(400, "INVALID_REQUEST");
  const action = clean(body.action, 40);

  if (action === "add_subscriber") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.draft");
    if (!access.value) return access.response;
    const email = clean(body.email, 254).toLowerCase();
    const name = clean(body.name, 160);
    const consentSource = clean(body.consentSource, 120);
    const consentNote = clean(body.consentNote, 1000);
    const consentConfirmed = body.consentConfirmed === true;
    const segments = Array.isArray(body.segments) ? body.segments.filter((item): item is string => typeof item === "string").map(item => item.trim().toLowerCase()).filter(Boolean).slice(0, 20) : [];
    if (!emailRe.test(email) || !consentSource || !consentConfirmed) {
      return fail(400, "CONSENT_REQUIRED", "Gyldig e-post, samtykkekilde og eksplisitt samtykkebekreftelse kreves.");
    }
    const suppression = await getWorkspaceEmailRuntime().checkSuppression(access.value.supabase, [email]);
    if (suppression.error || suppression.blocked) return fail(409, "RECIPIENT_SUPPRESSED", "Mottakeren er avmeldt eller sperret for e-post.");

    const { data, error } = await access.value.supabase.schema("core").from("workspace_newsletter_subscribers").upsert({
      brand_id: access.value.brandId,
      email,
      name: name || null,
      status: "active",
      consent_source: consentSource,
      consent_note: consentNote || null,
      consent_at: new Date().toISOString(),
      segments,
      unsubscribed_at: null,
      created_by_user_id: access.value.verifiedUserId,
      created_by_email: access.value.verifiedEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_id,email" }).select("id,email,name,status,segments,consent_source,consent_at").single();
    if (error || !data) return fail(503, "SUBSCRIBER_SAVE_FAILED");
    return NextResponse.json({ ok: true, subscriber: data }, { status: 201, headers: noStore });
  }

  if (action === "save_campaign") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.draft");
    if (!access.value) return access.response;
    const campaignId = clean(body.campaignId, 80);
    const title = clean(body.title, 160);
    const subject = clean(body.subject, 180);
    const preheader = clean(body.preheader, 180);
    const bodyText = clean(body.bodyText, 20000);
    const segmentFilter = Array.isArray(body.segmentFilter) ? body.segmentFilter.filter((item): item is string => typeof item === "string").map(item => item.trim().toLowerCase()).filter(Boolean).slice(0, 20) : [];
    if (!title || !subject || !bodyText) return fail(400, "INVALID_CAMPAIGN");
    const row = {
      brand_id: access.value.brandId,
      title, subject, preheader, body_text: bodyText, segment_filter: segmentFilter,
      status: "draft",
      updated_at: new Date().toISOString(),
      created_by_user_id: access.value.verifiedUserId,
      created_by_email: access.value.verifiedEmail,
    };
    const query = campaignId
      ? access.value.supabase.schema("core").from("workspace_newsletter_campaigns").update(row).eq("id", campaignId).eq("brand_id", access.value.brandId)
      : access.value.supabase.schema("core").from("workspace_newsletter_campaigns").insert(row);
    const { data, error } = await query.select("id,title,subject,preheader,body_text,status,segment_filter,created_at,updated_at").single();
    if (error || !data) return fail(503, "CAMPAIGN_SAVE_FAILED");
    return NextResponse.json({ ok: true, campaign: data }, { headers: noStore });
  }

  if (action === "test_send") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.send");
    if (!access.value) return access.response;
    const subject = clean(body.subject, 180);
    const bodyText = clean(body.bodyText, 20000);
    if (!subject || !bodyText) return fail(400, "INVALID_CAMPAIGN");
    const config = await senderConfig(access.value.supabase, params.brandKey);
    if (!config) return fail(409, "SENDER_NOT_CONFIGURED");
    const runtime = getWorkspaceEmailRuntime();
    const smtp = await runtime.buildSmtp(config, config.display_name || undefined);
    const result = await runtime.send(smtp, {
      to: [access.value.verifiedEmail],
      subject: `TEST · ${subject}`,
      bodyText: `${bodyText}\n\n---\nDette er en testutsendelse fra RealtyFlow.`,
      replyTo: clean(config.reply_to_address, 254) || undefined,
    });
    if (!result.success) return fail(502, "TEST_SEND_FAILED", result.error || "Testutsending feilet.");
    return NextResponse.json({ ok: true, sentTo: access.value.verifiedEmail }, { headers: noStore });
  }

  if (action === "schedule_campaign") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.send");
    if (!access.value) return access.response;
    const campaignId = clean(body.campaignId, 80);
    const scheduledAt = clean(body.scheduledAt, 80);
    const when = new Date(scheduledAt);
    if (!campaignId || !scheduledAt || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return fail(400, "INVALID_SCHEDULE", "Velg et tidspunkt i fremtiden.");
    }
    const { data, error } = await access.value.supabase.schema("core").from("workspace_newsletter_campaigns")
      .update({ status: "scheduled", scheduled_at: when.toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaignId).eq("brand_id", access.value.brandId)
      .select("id,status,scheduled_at").single();
    if (error || !data) return fail(503, "SCHEDULE_SAVE_FAILED");
    return NextResponse.json({ ok: true, campaign: data }, { headers: noStore });
  }

  if (action === "send_campaign") {
    const access = await requireBrandWorkspace(request, params.brandKey, "email.send");
    if (!access.value) return access.response;
    const campaignId = clean(body.campaignId, 80);
    if (!campaignId) return fail(400, "INVALID_CAMPAIGN");
    const result = await sendWorkspaceNewsletterCampaign({
      supabase: access.value.supabase,
      brandId: access.value.brandId,
      brandKey: params.brandKey,
      campaignId,
      origin: new URL(request.url).origin,
    });
    if (!result.ok) return fail(409, result.code);
    return NextResponse.json(result, { headers: noStore });
  }

  return fail(400, "INVALID_ACTION");
}
