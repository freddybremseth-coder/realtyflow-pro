import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { insertRevenueEvent } from "@/lib/revenue/events";
import {
  buildMessageSentRevenueEventInput,
  normalizeEmailAddresses,
} from "@/lib/revenue/email-events";
import { decryptPassword } from "@/services/email/crypto";
import { sendEmail, type SmtpConfig, type OutgoingEmail } from "@/services/email/smtp-sender";

/**
 * POST /api/email/send
 * Send a draft reply via SMTP.
 * Body: { draft_id: string } or { brand_id, to, subject, body_text, body_html?, in_reply_to? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServerClient();

    let brandId: string;
    let toAddresses: string[];
    let subject: string;
    let bodyText: string;
    let bodyHtml: string | undefined;
    let inReplyTo: string | undefined;
    let draftId: string | undefined;
    let emailMessageId: string | undefined;

    if (body.draft_id) {
      // Send from an existing draft
      draftId = body.draft_id;

      const { data: draft, error: draftError } = await supabase
        .from("email_drafts")
        .select("*, email_messages(*)")
        .eq("id", draftId)
        .single();

      if (draftError || !draft) {
        return NextResponse.json(
          { error: "Draft not found" },
          { status: 404 }
        );
      }

      brandId = draft.brand_id;
      toAddresses = draft.to_addresses;
      subject = draft.subject || "";
      bodyText = draft.body_text;
      bodyHtml = draft.body_html || undefined;
      emailMessageId = draft.email_message_id;

      // Get the original email's message_id for threading
      if (draft.email_messages) {
        inReplyTo = draft.email_messages.message_id || undefined;
      }
    } else {
      // Send a custom email
      brandId = body.brand_id;
      toAddresses = Array.isArray(body.to) ? body.to : [body.to];
      subject = body.subject || "";
      bodyText = body.body_text || "";
      bodyHtml = body.body_html || undefined;
      inReplyTo = body.in_reply_to || undefined;
    }

    if (!brandId) {
      return NextResponse.json(
        { error: "brand_id is required" },
        { status: 400 }
      );
    }

    // Get brand email config
    const { data: config, error: configError } = await supabase
      .from("brand_email_configs")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: "No active email config found for this brand" },
        { status: 404 }
      );
    }

    // Decrypt password
    const password = decryptPassword(config.encrypted_password, config.encryption_iv);

    const smtpConfig: SmtpConfig = {
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      email: config.email_address,
      password,
      displayName: config.display_name || undefined,
    };

    const outgoingEmail: OutgoingEmail = {
      to: toAddresses,
      subject,
      bodyText,
      bodyHtml,
      inReplyTo,
      references: inReplyTo ? [inReplyTo] : undefined,
    };

    // Send via SMTP
    const result = await sendEmail(smtpConfig, outgoingEmail);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 }
      );
    }

    const sentAt = new Date().toISOString();

    // Update draft status if sending from a draft
    if (draftId) {
      await supabase
        .from("email_drafts")
        .update({
          status: "sent",
          sent_at: sentAt,
        })
        .eq("id", draftId);
    }

    // Update the original email's replied_at
    if (emailMessageId) {
      await supabase
        .from("email_messages")
        .update({ replied_at: sentAt })
        .eq("id", emailMessageId);
    }

    // Save the sent email as an outbound message
    const { data: sentMessage, error: sentMessageError } = await supabase.from("email_messages").insert({
      brand_id: brandId,
      message_id: result.messageId || null,
      thread_id: inReplyTo || result.messageId || null,
      direction: "outbound",
      from_address: config.email_address,
      from_name: config.display_name || null,
      to_addresses: toAddresses,
      subject,
      body_text: bodyText,
      body_html: bodyHtml || null,
      is_read: true,
      received_at: sentAt,
    }).select("id").single();

    if (sentMessageError) {
      console.warn("[Email Send] outbound message log failed", sentMessageError.message);
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
      console.warn("[Email Send] contact lookup for revenue event failed", contactError.message);
    }

    const eventResult = await insertRevenueEvent(supabase, buildMessageSentRevenueEventInput({
      brandId,
      toAddresses,
      subject,
      bodyPreview: bodyText.slice(0, 280),
      sentAt,
      messageId: result.messageId || null,
      draftId: draftId || null,
      sentEmailMessageId: sentMessage?.id || null,
      originalEmailMessageId: emailMessageId || null,
      contactId: contact?.id || null,
    }));

    if (!eventResult.ok && !eventResult.tableNotReady) {
      console.warn("[Email Send] revenue event insert failed", eventResult.error);
    }

    return NextResponse.json({
      success: true,
      message_id: result.messageId,
    });
  } catch (error) {
    console.error("[Email Send]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
