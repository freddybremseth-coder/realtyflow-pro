import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptPassword } from "@/services/email/crypto";
import { sendEmail, type OutgoingAttachment, type SmtpConfig } from "@/services/email/smtp-sender";

/**
 * Send a one-off email from a brand's configured SMTP account.
 *
 * Encapsulates the same brand_email_configs lookup + decrypt + sendEmail +
 * email_messages logging that /api/email/send does, so the nurture engine
 * (and any future automation) can send without duplicating that logic.
 *
 * Returns { skipped: true } when the brand has no active SMTP config or when
 * CRM suppression blocks a recipient.
 */
export async function sendBrandEmail(
  supabase: SupabaseClient,
  params: {
    brandId: string;
    to: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    attachments?: OutgoingAttachment[];
    /** Eksplisitt avsenderadresse når et merke har flere konfig-rader
     *  (f.eks. pinosoecolife: freddy@ vs post@). */
    fromAddress?: string;
    /** Overstyr visningsnavn i Fra-feltet. Brukes når vi sender via ett merkes
     *  SMTP, men vil fremstå som et annet (f.eks. Soleada-leads sendt fra
     *  freddy@zenecohomes.com, men signert "Freddy Bremseth – Soleada.no"). */
    fromName?: string;
    /** Kun for eksplisitt transaksjonell kommunikasjon som juridisk/operativt
     *  må sendes selv om markedsføring er stoppet. Standard er false. */
    allowSuppressed?: boolean;
  }
): Promise<{ success: boolean; skipped?: boolean; messageId?: string; error?: string }> {
  const recipients = params.to.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);

  if (!params.allowSuppressed && recipients.length) {
    const { data: suppressed, error: suppressionError } = await supabase
      .from("contacts")
      .select("id,email,do_not_contact,email_suppressed,suppression_reason")
      .in("email", recipients)
      .or("do_not_contact.eq.true,email_suppressed.eq.true")
      .limit(recipients.length);

    if (suppressionError) {
      return { success: false, skipped: true, error: `CRM suppression check failed: ${suppressionError.message}` };
    }
    if ((suppressed || []).length > 0) {
      const blocked = (suppressed || []).map((row: any) => row.email).filter(Boolean).join(", ");
      return { success: false, skipped: true, error: `Recipient suppressed in CRM${blocked ? `: ${blocked}` : ""}` };
    }
  }

  // Duplikat-trygt: et merke kan ha flere aktive konfig-rader. Velg eksplisitt
  // adresse hvis oppgitt, ellers den sist oppdaterte (aldri .single()-krasj).
  let configQuery = supabase
    .from("brand_email_configs")
    .select("*")
    .eq("brand_id", params.brandId)
    .eq("is_active", true);
  if (params.fromAddress) {
    configQuery = configQuery.eq("email_address", params.fromAddress);
  }
  const { data: configs } = await configQuery
    .order("updated_at", { ascending: false })
    .limit(1);
  const config = configs?.[0];

  if (!config) {
    return { success: false, skipped: true, error: "No active email config for brand" };
  }

  const password = decryptPassword(config.encrypted_password, config.encryption_iv);

  const smtpConfig: SmtpConfig = {
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    email: config.email_address,
    password,
    displayName: params.fromName || config.display_name || undefined,
  };

  const result = await sendEmail(smtpConfig, {
    to: params.to,
    subject: params.subject,
    bodyText: params.bodyText,
    bodyHtml: params.bodyHtml,
    attachments: params.attachments,
  });

  if (!result.success) {
    return { success: false, error: result.error || "Send failed" };
  }

  // Log as an outbound message so it shows up in the brand inbox/thread view.
  await supabase.from("email_messages").insert({
    brand_id: params.brandId,
    message_id: result.messageId || null,
    thread_id: result.messageId || null,
    direction: "outbound",
    from_address: config.email_address,
    from_name: params.fromName || config.display_name || null,
    to_addresses: params.to,
    subject: params.subject,
    body_text: params.bodyText,
    body_html: params.bodyHtml || null,
    is_read: true,
    received_at: new Date().toISOString(),
  });

  return { success: true, messageId: result.messageId };
}
