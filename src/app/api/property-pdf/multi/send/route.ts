/**
 * POST /api/property-pdf/multi/send
 *
 * Render a curated multi-property PDF (same shape as /api/property-pdf/multi)
 * and email it as an attachment via the brand's SMTP config.
 *
 * Body:
 *   propertyIds : string[]                          required
 *   brandId     : string                            required
 *   to          : string | string[]                 recipient(s)
 *   cc?         : string | string[]
 *   subject?    : string
 *   message?    : string
 *   headline?   : string                            cover headline
 *   intro?      : string                            cover intro paragraph
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { insertRevenueEvent } from "@/lib/revenue/events";
import {
  buildMessageSentRevenueEventInput,
  normalizeEmailAddresses,
} from "@/lib/revenue/email-events";
import path from "path";
import fs from "fs/promises";
import { decryptPassword } from "@/services/email/crypto";
import {
  sendEmail,
  type SmtpConfig,
  type OutgoingEmail,
} from "@/services/email/smtp-sender";
import {
  renderMultiPropertyProspect,
  type PdfPropertyInput,
  type PdfBrandInput,
  type PdfAgentInput,
} from "@/services/pdf/property-prospect";
import { findAreaProfilesForLocations } from "@/services/pdf/area-lookup";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function pickStr(s: Record<string, unknown>, k: string): string | undefined {
  const v = s[k];
  return typeof v === "string" && v.trim() ? v : undefined;
}

async function resolveBrandLogoUrl(
  origin: string,
  brandId: string,
  override: string | undefined,
): Promise<string | undefined> {
  if (override) return override;
  const dir = path.join(process.cwd(), "public", "brand-logos");
  for (const ext of ["png", "jpg"] as const) {
    try {
      await fs.access(path.join(dir, `${brandId}.${ext}`));
      return `${origin}/brand-logos/${brandId}.${ext}`;
    } catch {
      // try next
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as {
      propertyIds?: string[];
      brandId?: string;
      to?: string | string[];
      cc?: string | string[];
      subject?: string;
      message?: string;
      headline?: string;
      intro?: string;
    };

    const propertyIds = (body.propertyIds || []).filter(Boolean);
    const brandId = body.brandId;
    const toRaw = body.to;
    if (propertyIds.length === 0 || !brandId || !toRaw) {
      return NextResponse.json(
        { error: "propertyIds, brandId and to are required" },
        { status: 400 },
      );
    }

    const toAddresses = Array.isArray(toRaw) ? toRaw : [toRaw];
    const ccAddresses = body.cc
      ? Array.isArray(body.cc) ? body.cc : [body.cc]
      : undefined;

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    // 1. Properties (preserve given order)
    const { data: rows } = await supabase
      .from("properties")
      .select("*")
      .in("id", propertyIds);
    const byId = new Map<string, PdfPropertyInput>();
    for (const r of (rows || []) as PdfPropertyInput[]) {
      if (r.id) byId.set(r.id, r);
    }
    const properties = propertyIds
      .map((id) => byId.get(id))
      .filter((p): p is PdfPropertyInput => Boolean(p));
    if (properties.length === 0) {
      return NextResponse.json({ error: "No matching properties found" }, { status: 404 });
    }

    // 2. Brand settings + agent
    const { data: brandRow } = await supabase
      .from("brand_settings")
      .select("settings")
      .eq("brand_id", brandId)
      .maybeSingle();
    const settings = (brandRow as { settings?: Record<string, unknown> } | null)?.settings || {};
    const brand: PdfBrandInput = {
      brand_id: brandId,
      custom_name: pickStr(settings, "custom_name"),
      display_name: pickStr(settings, "display_name"),
      logo_url: pickStr(settings, "logo_url"),
      website: pickStr(settings, "website"),
      area_blurb: pickStr(settings, "area_blurb"),
    };
    const agent: PdfAgentInput = {
      agent_name: pickStr(settings, "agent_name"),
      agent_title: pickStr(settings, "agent_title"),
      agent_photo_url: pickStr(settings, "agent_photo_url"),
      agent_email: pickStr(settings, "agent_email"),
      agent_phone: pickStr(settings, "agent_phone"),
      agent_bio: pickStr(settings, "agent_bio"),
    };
    const brandLogoUrl = await resolveBrandLogoUrl(req.nextUrl.origin, brandId, brand.logo_url);

    // 3. SMTP
    const { data: emailConfig, error: cfgErr } = await supabase
      .from("brand_email_configs")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .maybeSingle();
    if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });
    if (!emailConfig) {
      return NextResponse.json(
        { error: `No active SMTP config for brand "${brandId}"` },
        { status: 404 },
      );
    }
    const smtpConfig: SmtpConfig = {
      host: emailConfig.smtp_host,
      port: emailConfig.smtp_port,
      secure: emailConfig.smtp_secure,
      email: emailConfig.email_address,
      password: decryptPassword(emailConfig.encrypted_password, emailConfig.encryption_iv),
      displayName: emailConfig.display_name || agent.agent_name || brand.custom_name || undefined,
    };

    // 4. Area profiles — fuzzy match against the brand's saved profiles
    const areaProfilesBySlug = await findAreaProfilesForLocations(
      supabase,
      brandId,
      properties.map((p) => p.location || null),
    );

    // 5. Render PDF
    const pdfBuffer = await renderMultiPropertyProspect({
      properties,
      brand,
      agent,
      brandLogoUrl,
      headline: body.headline,
      intro: body.intro,
      areaProfilesBySlug,
    });

    const filename = `eiendomsutvalg-${properties.length}.pdf`;

    // 5. Compose email
    const subject =
      body.subject?.trim() ||
      `Eiendomsutvalg fra ${brand.custom_name || brand.display_name || "oss"} (${properties.length} eiendommer)`;

    const fallbackMessage =
      body.message?.trim() ||
      [
        "Hei,",
        "",
        `Vedlagt finner du et utvalg på ${properties.length} eiendommer som vi tror passer kriteriene dine.`,
        "",
        "Bla gjennom prospektet og gi beskjed hvilke du vil vite mer om eller se på visning.",
        "",
        agent.agent_name ? `Med vennlig hilsen,\n${agent.agent_name}` : "Med vennlig hilsen,",
        agent.agent_title || "",
        agent.agent_phone ? `Tlf: ${agent.agent_phone}` : "",
        agent.agent_email ? `E-post: ${agent.agent_email}` : "",
      ]
        .filter(Boolean)
        .join("\n");

    const bodyHtml = `<p>${fallbackMessage.replace(/\n/g, "<br/>")}</p>`;

    const outgoing: OutgoingEmail = {
      to: toAddresses,
      cc: ccAddresses,
      subject,
      bodyText: fallbackMessage,
      bodyHtml,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    const result = await sendEmail(smtpConfig, outgoing);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "SMTP send failed" },
        { status: 500 },
      );
    }

    const sentAt = new Date().toISOString();

    // Log outbound
    const { data: sentMessage, error: sentMessageError } = await supabase.from("email_messages").insert({
      brand_id: brandId,
      message_id: result.messageId || null,
      thread_id: result.messageId || null,
      direction: "outbound",
      from_address: emailConfig.email_address,
      from_name: smtpConfig.displayName || null,
      to_addresses: toAddresses,
      subject,
      body_text: fallbackMessage,
      body_html: bodyHtml,
      is_read: true,
      received_at: sentAt,
    }).select("id").single();

    if (sentMessageError) {
      console.warn("[property-pdf/multi/send] outbound message log failed", sentMessageError.message);
    }

    const normalizedRecipients = normalizeEmailAddresses(toAddresses);
    const { data: contact, error: contactError } = normalizedRecipients.length
      ? await supabase
          .from("contacts")
          .select("id, email, brand_id")
          .eq("brand_id", brandId)
          .in("email", normalizedRecipients)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };

    if (contactError) {
      console.warn("[property-pdf/multi/send] contact lookup for revenue event failed", contactError.message);
    }

    const eventResult = await insertRevenueEvent(supabase, buildMessageSentRevenueEventInput({
      brandId,
      toAddresses,
      subject,
      bodyPreview: fallbackMessage.slice(0, 280),
      sentAt,
      messageId: result.messageId || null,
      sentEmailMessageId: sentMessage?.id || null,
      contactId: contact?.id || null,
      sourceSystem: "property_pdf",
      sourceType: "multi_property_pdf",
      createdBy: "api/property-pdf/multi/send",
      extraMetadata: {
        property_ids: properties.map((property) => property.id).filter(Boolean),
        property_refs: properties.map((property) => property.ref).filter(Boolean),
        property_titles: properties.map((property) => property.title).filter(Boolean).slice(0, 10),
        properties_count: properties.length,
        filename,
        attachment_type: "multi_property_pdf",
      },
    }));

    if (!eventResult.ok && !eventResult.tableNotReady) {
      console.warn("[property-pdf/multi/send] revenue event insert failed", eventResult.error);
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      filename,
      bytes: pdfBuffer.length,
      properties: properties.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("[property-pdf/multi/send]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
