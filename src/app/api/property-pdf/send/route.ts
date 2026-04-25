/**
 * POST /api/property-pdf/send
 *
 * Render the property prospect to PDF in-memory and email it as an
 * attachment via the brand's SMTP config (the same `brand_email_configs`
 * row used by /api/email/send).
 *
 * Body:
 *   propertyId : string                              required
 *   brandId    : string                              required (which SMTP + agent profile to use)
 *   to         : string | string[]                   recipient(s)
 *   cc?        : string | string[]
 *   subject?   : string                              defaults to "Eiendomsprospekt: <title>"
 *   message?   : string                              plain text body; HTML auto-derived
 *   agent?     : { agent_name?, agent_title?, ... }  override brand defaults per-send
 *
 * Returns { success, messageId, filename } or { error }.
 *
 * Threading: not yet supported — these are net-new outbound emails, not
 * replies. If we later wire this to a CRM thread, add `inReplyTo`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptPassword } from "@/services/email/crypto";
import {
  sendEmail,
  type SmtpConfig,
  type OutgoingEmail,
} from "@/services/email/smtp-sender";
import path from "path";
import fs from "fs/promises";
import {
  renderPropertyProspect,
  type PdfPropertyInput,
  type PdfBrandInput,
  type PdfAgentInput,
} from "@/services/pdf/property-prospect";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    const file = path.join(dir, `${brandId}.${ext}`);
    try {
      await fs.access(file);
      return `${origin}/brand-logos/${brandId}.${ext}`;
    } catch {
      // try next
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      propertyId?: string;
      brandId?: string;
      to?: string | string[];
      cc?: string | string[];
      subject?: string;
      message?: string;
      agent?: PdfAgentInput;
    };

    const propertyId = body.propertyId;
    const brandId = body.brandId;
    const toRaw = body.to;
    if (!propertyId || !brandId || !toRaw) {
      return NextResponse.json(
        { error: "propertyId, brandId and to are required" },
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

    // 1. Property
    const { data: propertyRow, error: propErr } = await supabase
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr) return NextResponse.json({ error: propErr.message }, { status: 500 });
    if (!propertyRow) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    // 2. Brand settings (logo, agent, area_blurb)
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
      ...(body.agent || {}),
    };

    const brandLogoUrl = await resolveBrandLogoUrl(req.nextUrl.origin, brandId, brand.logo_url);

    // 3. Brand email config (SMTP)
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

    // 4. Render PDF
    const pdfBuffer = await renderPropertyProspect({
      property: propertyRow as PdfPropertyInput,
      brand,
      agent,
      brandLogoUrl,
    });

    const property = propertyRow as PdfPropertyInput;
    const refOrId = property.ref || property.id || "prospekt";
    const safeName = String(refOrId).replace(/[^A-Za-z0-9_-]+/g, "_");
    const filename = `${safeName}-prospekt.pdf`;

    // 5. Compose email
    const propertyTitle = property.title || "eiendom";
    const subject = body.subject?.trim() || `Eiendomsprospekt: ${propertyTitle}`;
    const fallbackMessage =
      body.message?.trim() ||
      [
        "Hei,",
        "",
        `Vedlagt finner du prospektet for "${propertyTitle}".`,
        "",
        "Ta gjerne kontakt om du har spørsmål eller ønsker en visning.",
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

    // Log outbound for the inbox view
    await supabase.from("email_messages").insert({
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
      received_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      filename,
      bytes: pdfBuffer.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("[property-pdf/send]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
